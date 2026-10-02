import { useSearchParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	Errored,
	For,
	isPending,
	Loading,
	onSettled,
	Show,
} from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	AgentLogo,
	Alert,
	Avatar,
	BoardSkeleton,
	BoardStat,
	BoardStats,
	Button,
	button,
	CheckIcon,
	EmptyState,
	InfoStrip,
	LaneDot,
	LinkButton,
	LoadingBar,
	MiniBars,
	NavLink,
	NavNote,
	NavSection,
	NobodyMark,
	PlusIcon,
	PullRequestIcon,
	SearchIcon,
	SearchInput,
	Select,
	SparklesIcon,
	StatusDot,
	UserIcon,
	ChatIcon,
	ToneTile,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { placementsStore, scopeFor } from "@/modules/environments";
import { providersStore } from "@/modules/chat/stores/providers";
import { threadsStore } from "@/modules/chat/stores/threads";
import { inboxStore } from "@/modules/inbox";
import { ShellSlot } from "@/modules/shell";

import { useWorkspace } from "../context/workspace-context";
import { BOARD_LANES, doneByDay, filterTasks, groupByOwner, laneOf, ownedBy } from "../lib/board";
import type { Task } from "../types/project.types";

import { BoardLanes, boardLaneId, type BoardLane } from "./board-lanes";
import { StageTabs } from "./stage-tabs";

export type BoardView = "status" | "owner";

const LANE_TONE = { todo: "todo", doing: "doing", review: "review", done: "done" } as const;

/**
 * A project's board (Figma 12 · Board): what the agents and the team are doing across the top,
 * then four columns — Todo, In progress, In review, Done — that run to the bottom of the screen,
 * each scrolling its own cards. The panel picks whose tasks to show and lists the agents at work.
 */
export function BoardScreen(): JSX.Element {
	const workspace = useWorkspace();
	const auth = useAuth();
	const [searchParams, setSearchParams] = useSearchParams();
	const view = createMemo<BoardView>(() => (searchParams.view === "owner" ? "owner" : "status"));
	const owner = createMemo(() =>
		typeof searchParams.owner === "string" ? searchParams.owner : "all",
	);
	const query = createMemo(() => (typeof searchParams.q === "string" ? searchParams.q : ""));
	// The panel and the header read the tasks through this copy: the board's own read can wait on
	// the network, and the shell around it must never wait with it.
	// Undefined until this project's tasks have been read, so the panel never shows a stale count.
	const [known, setKnown] = createSignal<{ slug: string | null; name: string; tasks: Task[] }>();
	const me = () => auth.user()?.username ?? null;
	const slug = () => workspace.activeSlug();
	const shown = () => (known()?.slug === slug() ? known() : undefined);

	// The agents at work in this project come from its threads, polled while the board is open.
	const scope = () => scopeFor(placementsStore.environmentOf(slug()));
	createEffect(
		() => [auth.token(), slug(), scope()] as const,
		([token, project, where]) => {
			if (!token || !project) return;
			void threadsStore.reload(token, project);
			void providersStore.load(token, where);
		},
	);
	onSettled(() => threadsStore.watchRunning(() => auth.token()));
	const working = createMemo(() =>
		threadsStore.threads(slug() ?? "").filter((thread) => threadsStore.isRunning(thread.id)),
	);
	const agentName = (id: string) =>
		providersStore.providers(scope()).find((provider) => provider.id === id)?.name ?? id;
	// What waits on you here: the Inbox's unread items for this project.
	const waiting = createMemo(() =>
		inboxStore
			.items()
			.filter(
				(item) => item.project === slug() && item.readAt === null && item.kind === "approval",
			),
	);

	const viewHref = (next: string) => {
		const params = new URLSearchParams();
		if (next !== "all") params.set("owner", next);
		if (view() === "owner") params.set("view", "owner");
		if (query()) params.set("q", query());
		const search = params.toString();
		return workspaceHref(`/board/${slug()}${search ? `?${search}` : ""}`);
	};
	const count = (which: string): string | undefined => {
		const current = shown();
		return current
			? String(current.tasks.filter((task) => ownedBy(task, which, me())).length)
			: undefined;
	};
	// Everyone who has a task here, for one owner's view.
	// The busiest few, and whoever is picked: a long tail would push the rest out of sight.
	const owners = () => {
		const all = groupByOwner(shown()?.tasks ?? []).filter((lane) => lane.id !== "unassigned");
		const top = [...all].sort((a, b) => b.tasks.length - a.tasks.length).slice(0, 6);
		const picked = all.find((lane) => lane.id === owner());
		return picked && !top.includes(picked) ? [...top, picked] : top;
	};

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="actions">
				<SearchInput
					icon={<SearchIcon />}
					type="search"
					enterkeyhint="search"
					aria-label="Filter tasks"
					placeholder="Filter"
					value={query()}
					onInput={(event) =>
						setSearchParams({ q: event.currentTarget.value || undefined }, { replace: true })
					}
					class="hidden w-44 lg:flex"
				/>
				<div class="w-32">
					<Select<BoardView>
						label="Board view"
						look="chip"
						placement="bottom-end"
						value={view()}
						onChange={(next) => setSearchParams({ view: next === "status" ? undefined : next })}
						groups={[
							{
								options: [
									{ value: "status", label: "By status" },
									{ value: "owner", label: "By owner" },
								],
							},
						]}
					/>
				</div>
				<Button
					variant="primary"
					size="sm"
					icon={<PlusIcon />}
					kbd="C"
					aria-haspopup="dialog"
					onClick={() => workspace.setNewTaskOpen(true)}
				>
					New task
				</Button>
			</ShellSlot>
			<ShellSlot name="subtitle">
				{[
					shown()?.name,
					working().length > 0
						? `${working().length} agent${working().length === 1 ? "" : "s"} working`
						: null,
				]
					.filter(Boolean)
					.join(" · ")}
			</ShellSlot>
			<ShellSlot name="panel">
				<NavLink
					href={viewHref("all")}
					current={owner() === "all"}
					icon={<CheckIcon />}
					label="All tasks"
					trailing={count("all")}
				/>
				<NavLink
					href={viewHref("agents")}
					current={owner() === "agents"}
					icon={<SparklesIcon />}
					label="Given to agents"
					trailing={count("agents")}
				/>
				<NavLink
					href={viewHref("me")}
					current={owner() === "me"}
					icon={<UserIcon />}
					label="Assigned to me"
					trailing={count("me")}
				/>
				<div class="mt-3">
					<NavSection label="Agents now">
						<Show
							when={working().length > 0}
							fallback={<NavNote>No agent is working here.</NavNote>}
						>
							<For each={working()}>
								{(thread) => (
									<NavLink
										href={workspaceHref(`/chat/${thread.project}/${thread.id}`)}
										icon={<AgentLogo id={thread.provider} name={agentName(thread.provider)} />}
										label={agentName(thread.provider)}
										detail={thread.title}
										trailing={<StatusDot status="busy" size="sm" />}
									/>
								)}
							</For>
						</Show>
					</NavSection>
				</div>
				<Show when={owners().length > 0}>
					<div class="mt-3">
						<NavSection label="Who has tasks">
							<For each={owners()}>
								{(lane) => (
									<NavLink
										href={viewHref(lane.id)}
										current={owner() === lane.id}
										icon={<Avatar name={lane.title} size="xs" />}
										label={lane.title}
										trailing={String(lane.tasks.length)}
									/>
								)}
							</For>
						</NavSection>
					</div>
				</Show>
			</ShellSlot>
			<div class="flex min-h-0 flex-1 flex-col px-4 pt-3 md:px-6 md:pt-4">
				<Loading fallback={<BoardSkeleton />}>
					<Errored fallback={(error, reset) => <BoardError error={error()} onRetry={reset} />}>
						<Board
							view={view()}
							owner={owner()}
							query={query()}
							me={me()}
							onTasks={(tasks) =>
								setKnown({ slug: slug(), name: workspace.activeProject()?.name ?? "", tasks })
							}
							onQuery={(next) => setSearchParams({ q: next || undefined }, { replace: true })}
							working={working().map((thread) => ({
								provider: thread.provider,
								name: agentName(thread.provider),
								title: thread.title,
							}))}
							waiting={waiting().map((item) => ({
								title: item.title,
								body: item.body,
								url: item.url,
							}))}
							onClearFilters={() => setSearchParams({ q: undefined, owner: undefined })}
						/>
					</Errored>
				</Loading>
			</div>
		</div>
	);
}

type Working = { provider: string; name: string; title: string };
type Waiting = { title: string; body: string; url: string };

function Board(props: {
	view: BoardView;
	owner: string;
	query: string;
	me: string | null;
	onTasks: (tasks: Task[]) => void;
	onQuery: (query: string) => void;
	working: Working[];
	waiting: Waiting[];
	onClearFilters: () => void;
}): JSX.Element {
	const workspace = useWorkspace();
	createEffect(workspace.tasks, (tasks) => {
		props.onTasks(tasks);
	});
	const filteredTasks = createMemo(() =>
		filterTasks(workspace.tasks(), { query: props.query, owner: props.owner, me: props.me }),
	);
	const statusLanes = createMemo<BoardLane[]>(() =>
		BOARD_LANES.map((lane) => ({
			id: lane.id,
			title: lane.title,
			short: lane.short,
			icon: () => <LaneDot tone={LANE_TONE[lane.id]} />,
			tasks: filteredTasks().filter((task) => laneOf(task.status) === lane.id),
		})),
	);
	const ownerLanes = createMemo<BoardLane[]>(() =>
		groupByOwner(filteredTasks()).map((lane) => ({
			id: lane.id,
			title: lane.title,
			short: lane.title,
			icon: () =>
				lane.id === "unassigned" ? (
					<NobodyMark size="xs" />
				) : (
					<Avatar name={lane.title} size="xs" />
				),
			tasks: lane.tasks,
		})),
	);
	const lanes = createMemo(() => (props.view === "owner" ? ownerLanes() : statusLanes()));
	const isFiltered = createMemo(() => props.query.trim().length > 0 || props.owner !== "all");
	const filteredEmpty = createMemo(() => isFiltered() && filteredTasks().length === 0);
	const [selectedLane, setSelectedLane] = createSignal("");
	const activeLane = createMemo(() => {
		const selected = selectedLane();
		const currentLanes = lanes();
		return currentLanes.some((lane) => lane.id === selected)
			? selected
			: (currentLanes[0]?.id ?? "");
	});

	// The strip's numbers: in review now, and what was finished this week against the last.
	const inReview = createMemo(() =>
		workspace.tasks().filter((task) => laneOf(task.status) === "review"),
	);
	const week = createMemo(() => doneByDay(workspace.tasks(), new Date(), 14));
	const DAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
	const barsLabel = () =>
		week()
			.slice(7)
			.map((n, index) => {
				const day = new Date();
				day.setDate(day.getDate() - (6 - index));
				return `${DAY.format(day)} ${n}`;
			})
			.join(", ");
	const thisWeek = () =>
		week()
			.slice(7)
			.reduce((sum, n) => sum + n, 0);
	const lastWeek = () =>
		week()
			.slice(0, 7)
			.reduce((sum, n) => sum + n, 0);

	function selectLane(lane: string): void {
		setSelectedLane(lane);
		document
			.getElementById(boardLaneId(lane))
			?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
	}

	return (
		<Show when={workspace.activeProject()} fallback={<ProjectNotFound />}>
			<div class="-mt-1 mb-2">
				<LoadingBar active={isPending(() => workspace.tasks())} />
			</div>
			<div class="hidden md:block">
				<BoardStats>
					<BoardStat
						mark={
							<Show
								when={props.working.length > 0}
								fallback={
									<ToneTile tone="neutral">
										<SparklesIcon />
									</ToneTile>
								}
							>
								<span class="flex items-center gap-1">
									<For each={[...new Set(props.working.map((item) => item.provider))].slice(0, 3)}>
										{(provider) => (
											<AgentLogo
												id={provider}
												name={
													props.working.find((item) => item.provider === provider)?.name ?? provider
												}
											/>
										)}
									</For>
								</span>
							</Show>
						}
						title={
							props.working.length === 0
								? "No agent working"
								: `${props.working.length} agent${props.working.length === 1 ? "" : "s"} working`
						}
						detail={
							props.working.map((item) => item.title).join(" · ") ||
							"Start a thread to hand work over"
						}
					/>
					<BoardStat
						mark={
							<ToneTile tone="warning">
								<ChatIcon />
							</ToneTile>
						}
						title={
							props.waiting.length === 0
								? "Nothing waiting on you"
								: `${props.waiting.length} approval${props.waiting.length === 1 ? "" : "s"} waiting`
						}
						detail={
							props.waiting[0]
								? `${props.waiting[0].title} · ${props.waiting[0].body}`
								: "Agents ask here when they need you"
						}
						href={props.waiting[0] ? workspaceHref(props.waiting[0].url) : undefined}
					/>
					<BoardStat
						mark={
							<ToneTile tone="violet">
								<PullRequestIcon />
							</ToneTile>
						}
						title={
							inReview().length === 0 ? "Nothing to review" : `${inReview().length} ready to review`
						}
						detail={
							inReview()
								.slice(0, 3)
								.map((task) => task.key)
								.join(", ") || "Tasks in review show here"
						}
					/>
					<BoardStat
						mark={
							<MiniBars
								values={week().slice(7)}
								label={`Done tasks touched each day: ${barsLabel()}`}
							/>
						}
						title={`${thisWeek()} done in the last 7 days`}
						detail={
							thisWeek() === lastWeek()
								? "As many as the 7 days before"
								: `${Math.abs(thisWeek() - lastWeek())} ${thisWeek() > lastWeek() ? "more" : "fewer"} than the 7 days before`
						}
					/>
				</BoardStats>
			</div>
			{/* Phones: what waits on you, in a line with a way to answer. */}
			<Show when={props.waiting[0]}>
				{(first) => (
					<div class="mb-2 md:hidden">
						<InfoStrip
							trailing={
								<a href={workspaceHref(first().url)} class={button({ size: "sm" })}>
									Answer
								</a>
							}
						>
							Waiting on you: {first().title}
						</InfoStrip>
					</div>
				)}
			</Show>
			<Show
				when={!filteredEmpty()}
				fallback={
					<EmptyState
						title="No tasks match these filters"
						action={
							<LinkButton tone="accent" onClick={() => props.onClearFilters()}>
								Clear filters
							</LinkButton>
						}
					/>
				}
			>
				{/* Phones and tablets: the search the desktop bar carries. */}
				<SearchInput
					icon={<SearchIcon />}
					type="search"
					enterkeyhint="search"
					aria-label="Search tasks"
					placeholder="Search tasks"
					value={props.query}
					onInput={(event) => props.onQuery(event.currentTarget.value)}
					class="mb-2 lg:hidden"
				/>
				<StageTabs lanes={lanes()} active={activeLane()} onSelect={selectLane} />
				<BoardLanes lanes={lanes()} onActiveChange={setSelectedLane} />
			</Show>
		</Show>
	);
}

function BoardError(props: { error: unknown; onRetry: () => void }): JSX.Element {
	return (
		<div class="py-6">
			<Alert
				tone="danger"
				title="The board could not load"
				action={
					<Button size="sm" onClick={() => props.onRetry()}>
						Try again
					</Button>
				}
			>
				{props.error instanceof Error ? props.error.message : "Something went wrong."}
			</Alert>
		</div>
	);
}

function ProjectNotFound(): JSX.Element {
	return (
		<EmptyState
			title="Project not found"
			description="It may have been renamed or archived."
			action={
				<a href={workspaceHref("/board")} class={button({ size: "sm" })}>
					Open your first project
				</a>
			}
		/>
	);
}
