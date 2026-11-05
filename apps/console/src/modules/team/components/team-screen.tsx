import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	ChatIcon,
	AgentLogo,
	Alert,
	Avatar,
	Button,
	ButtonLink,
	ChevronRightIcon,
	CloseIcon,
	DescriptionList,
	EditIcon,
	IconButton,
	Input,
	NavLink,
	notify,
	PlusIcon,
	RoleMark,
	Segmented,
	Skeleton,
	StatusDot,
	Text,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { describeRole } from "@/modules/chat/components/roles";
import { rememberRole } from "@/modules/chat/lib/chosen-role";
import { providersStore } from "@/modules/chat/stores/providers";
import { rolesStore } from "@/modules/chat/stores/roles";
import type { Role, RoleDraft } from "@/modules/chat/types/chat.types";
import { ShellSlot, useShell } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member } from "@/modules/workspaces/types/workspace.types";

import { duration, isOpen, RUN_STATE, waitsOnYou } from "../lib/run-state";
import { teamService } from "../services/team.service";
import type { TeammateLesson, TeammateRun, TeammateStats } from "../types/team.types";

import { TeammateDialog } from "./teammate-dialog";

/** How often an open Team screen reads its teammates' work again: they work on their own. */
const REFRESH_MS = 15_000;

type Step = (run: TeammateRun, action: "approve" | "stop" | "retry", done: string) => Promise<void>;

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

function since(at: string): string {
	const minutes = (Date.now() - Date.parse(at)) / 60_000;
	return minutes < 1 ? "just now" : `${duration(minutes)} ago`;
}

const plural = (count: number, one: string, many = `${one}s`) =>
	`${count} ${count === 1 ? one : many}`;

/** Where a run's card is on the board, and its thread. */
const cardHref = (run: TeammateRun) =>
	workspaceHref(`/board/${run.project}/tasks/${run.taskNumber}`);
const threadHref = (run: TeammateRun) =>
	run.sessionId ? workspaceHref(`/chat/${run.project}/${run.sessionId}`) : null;

/** What a teammate is doing now, in a few words; null when it is free. */
function nowLine(runs: readonly TeammateRun[]): string | null {
	const open = runs.filter(isOpen);
	const lead =
		open.find((run) => run.state === "working" || run.state === "planning") ??
		runs.find(waitsOnYou) ??
		open[0];
	if (!lead) return null;
	const more = open.length > 1 ? ` · +${open.length - 1}` : "";
	return `${RUN_STATE[lead.state].label} ${lead.taskKey}${more}`;
}

/** A quiet group heading over a list. */
function Heading(props: { children: JSX.Element; trailing?: JSX.Element }): JSX.Element {
	return (
		<div class="flex h-8 items-center justify-between gap-3 md:px-1">
			<Text size="caption" tone="subtle">
				{props.children}
			</Text>
			{props.trailing}
		</div>
	);
}

/** Rows in one quiet frame, divided by hairlines. */
function Rows(props: { children: JSX.Element }): JSX.Element {
	// Framed from md; on phones the rows run edge to edge like the Inbox's.
	return <div class="flex flex-col divide-y divide-line md:surface-card">{props.children}</div>;
}

/**
 * The team (Team): the workspace's teammates and its people, in one list. What waits on you leads
 * (plans to approve, stuck cards, lessons to keep); each teammate says what it is doing now. A
 * teammate's own page holds its work, its scorecard, its memory and its setup. Read again every
 * few seconds while open, as teammates work on their own.
 */
export function TeamScreen(): JSX.Element {
	const auth = useAuth();
	const workspaces = useWorkspaces();
	const navigate = useNavigate();
	const params = useParams<{ id?: string }>();
	const openId = () => params.id ?? null;

	const [stats, setStats] = createSignal<TeammateStats[]>([]);
	const [runs, setRuns] = createSignal<TeammateRun[]>([]);
	const [proposed, setProposed] = createSignal<TeammateLesson[]>([]);
	const [members, setMembers] = createSignal<Member[] | null>(null);
	const [error, setError] = createSignal<string | null>(null);
	const [editing, setEditing] = createSignal<{ role: Role | null } | null>(null);

	const team = () => rolesStore.roles("");
	const agents = () => providersStore.providers("").filter((item) => item.available);

	async function refresh(): Promise<void> {
		const token = untrack(auth.token);
		if (!token) return;
		try {
			const [nextStats, nextRuns, nextProposed] = await Promise.all([
				teamService.stats(token),
				teamService.runs(token),
				teamService.proposed(token),
			]);
			setStats(nextStats);
			setRuns(nextRuns);
			setProposed(nextProposed);
			setError(null);
		} catch (cause) {
			setError(message(cause, "Could not read what the team is doing"));
		}
	}

	createEffect(
		() => [auth.token() !== null, workspaces.current()?.slug] as const,
		([signedIn, slug]) => {
			const token = untrack(auth.token);
			if (!signedIn || !token) return;
			void rolesStore.reload(token);
			void providersStore.load(token);
			void refresh();
			if (slug) void workspacesService.members(token, slug).then(setMembers, () => setMembers([]));
		},
	);
	const timer = setInterval(() => void refresh(), REFRESH_MS);
	onCleanup(() => clearInterval(timer));

	const statsOf = (id: string) => stats().find((item) => item.teammateId === id) ?? null;
	const runsOf = (id: string) => runs().filter((run) => run.teammateId === id);
	const nameOf = (id: string) => team().find((item) => item.id === id)?.name ?? "A teammate";
	const waiting = createMemo(() => runs().filter(waitsOnYou));
	const opened = () => team().find((item) => item.id === openId()) ?? null;

	async function save(draft: RoleDraft): Promise<void> {
		const token = auth.token();
		if (!token) return;
		const target = editing()?.role;
		const saved = target
			? await rolesStore.update(token, target.id, draft)
			: await rolesStore.create(token, draft);
		if (!target) {
			notify({ title: `${saved.name} joined the team` });
			navigate(`/team/${saved.id}`);
		}
	}

	const step: Step = async (run, action, done) => {
		const token = auth.token();
		if (!token) return;
		try {
			await teamService[action](token, run.id);
			notify({ title: done });
			await refresh();
		} catch (cause) {
			notify({ title: message(cause, "That did not work"), tone: "danger" });
		}
	};

	async function lesson(item: TeammateLesson, keep: boolean): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			if (keep) await teamService.keep(token, item.id);
			else await teamService.forget(token, item.id);
			notify({ title: keep ? `${nameOf(item.teammateId)} will remember that` : "Dropped" });
			await refresh();
		} catch (cause) {
			notify({ title: message(cause, "That did not work"), tone: "danger" });
		}
	}

	function chatWith(role: Role): void {
		rememberRole(role.id);
		navigate("/chat");
	}

	const newTeammate = () => setEditing({ role: null });

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="panelActions">
				<IconButton label="New teammate" size="sm" onClick={newTeammate}>
					<PlusIcon size="sm" />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="panel">
				<NavLink
					href={workspaceHref("/team")}
					label="Everyone"
					current={openId() === null}
					trailing={
						waiting().length + proposed().length > 0 ? (
							<StatusDot status="waiting" label="Waiting on you" />
						) : undefined
					}
				/>
				<For each={team()}>
					{(role) => (
						<NavLink
							href={workspaceHref(`/team/${role.id}`)}
							icon={<RoleMark icon={role.icon} size="sm" />}
							label={role.name}
							current={openId() === role.id}
							trailing={<TeammateDot runs={runsOf(role.id)} />}
						/>
					)}
				</For>
			</ShellSlot>
			<Show when={opened()}>
				{(role) => (
					<ShellSlot name="crumb">
						<Text tone="strong">{role().name}</Text>
					</ShellSlot>
				)}
			</Show>
			<ShellSlot name="trailing">
				<IconButton
					label="New teammate"
					variant="secondary"
					shape="round"
					size="lg"
					onClick={newTeammate}
				>
					<PlusIcon />
				</IconButton>
			</ShellSlot>

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div class="flex w-full max-w-4xl flex-col gap-6 px-4 pt-3 pb-8 md:px-6 md:pt-5">
					<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
					<Show
						when={openId()}
						fallback={
							<Everyone
								team={team()}
								agents={agents()}
								loaded={rolesStore.loaded("")}
								members={members()}
								waiting={waiting()}
								proposed={proposed()}
								runs={runsOf}
								nameOf={nameOf}
								me={auth.user()?.id ?? null}
								onNew={newTeammate}
								onStep={step}
								onLesson={lesson}
							/>
						}
					>
						<Show
							when={opened()}
							fallback={
								<Show when={rolesStore.loaded("")} fallback={<Skeleton class="h-40" />}>
									<Text tone="subtle">
										This teammate has left the team.{" "}
										<a href={workspaceHref("/team")} class="focus-ring text-fg underline">
											Back to the team
										</a>
									</Text>
								</Show>
							}
						>
							{(role) => (
								<TeammatePage
									role={role()}
									agents={agents()}
									stats={statsOf(role().id)}
									runs={runsOf(role().id)}
									team={team()}
									onEdit={() => setEditing({ role: role() })}
									onChat={() => chatWith(role())}
									onStep={step}
									onLessonsChanged={() => void refresh()}
								/>
							)}
						</Show>
					</Show>
				</div>
			</div>

			<TeammateDialog
				open={editing() !== null}
				target={editing()?.role ?? null}
				agents={agents()}
				team={team()}
				onClose={() => setEditing(null)}
				onSave={save}
				onDelete={async () => {
					const token = auth.token();
					const target = editing()?.role;
					if (!token || !target) return;
					await rolesStore.remove(token, target.id);
					notify({ title: `${target.name} left the team` });
					navigate("/team");
				}}
			/>
		</div>
	);
}

/** A dot only when it means something: waiting on you, or at work. */
function TeammateDot(props: { runs: readonly TeammateRun[] }): JSX.Element {
	const waiting = () => props.runs.some(waitsOnYou);
	const working = () =>
		props.runs.some((run) => run.state === "planning" || run.state === "working");
	return (
		<Show when={waiting() || working()}>
			<StatusDot
				status={waiting() ? "waiting" : "running"}
				label={waiting() ? "Waiting on you" : "At work"}
			/>
		</Show>
	);
}

/** The overview: what waits on you, then the teammates, then the people. */
function Everyone(props: {
	team: readonly Role[];
	agents: ReturnType<typeof providersStore.providers>;
	loaded: boolean;
	members: readonly Member[] | null;
	waiting: readonly TeammateRun[];
	proposed: readonly TeammateLesson[];
	runs: (id: string) => TeammateRun[];
	nameOf: (id: string) => string;
	me: string | null;
	onNew: () => void;
	onStep: Step;
	onLesson: (lesson: TeammateLesson, keep: boolean) => Promise<void>;
}): JSX.Element {
	return (
		<>
			<header class="hidden items-center gap-3 md:flex">
				<div class="flex min-w-0 flex-1 flex-col">
					<Text as="h1" size="headline" tone="strong" weight="medium">
						Team
					</Text>
					<Text size="caption" tone="subtle">
						{props.members ? plural(props.members.length, "person", "people") : "People"} ·{" "}
						{plural(props.team.length, "teammate")}
					</Text>
				</div>
				<Button size="sm" icon={<PlusIcon />} onClick={props.onNew}>
					New teammate
				</Button>
			</header>

			<Show when={props.waiting.length + props.proposed.length > 0}>
				<section aria-label="Waiting on you" class="flex flex-col gap-1">
					<Heading>Waiting on you</Heading>
					<Rows>
						<For each={props.waiting}>
							{(run) => (
								<div class="flex min-h-14 items-center gap-3 py-2.5 md:px-4">
									<StatusDot
										status={run.state === "plan_ready" ? "waiting" : "error"}
										label={RUN_STATE[run.state].label}
									/>
									<div class="flex min-w-0 flex-1 flex-col">
										<a
											href={cardHref(run)}
											class="focus-ring truncate text-body text-fg hover:underline"
										>
											{run.taskKey} {run.taskTitle}
										</a>
										<Text size="caption" tone="subtle" truncate>
											{props.nameOf(run.teammateId)} ·{" "}
											{run.state === "plan_ready" ? "plan ready" : (run.error ?? "stuck")}
										</Text>
									</div>
									<Show when={threadHref(run)}>
										{(href) => (
											<ButtonLink
												href={href()}
												size="sm"
												variant="ghost"
												class="hidden sm:inline-flex"
											>
												{run.state === "plan_ready" ? "Read" : "Open"}
											</ButtonLink>
										)}
									</Show>
									<Button
										size="sm"
										onClick={() =>
											void props.onStep(
												run,
												run.state === "plan_ready" ? "approve" : "retry",
												run.state === "plan_ready"
													? `${props.nameOf(run.teammateId)} is on it`
													: "Trying again",
											)
										}
									>
										{run.state === "plan_ready" ? "Approve" : "Retry"}
									</Button>
								</div>
							)}
						</For>
						<For each={props.proposed}>
							{(lesson) => (
								<div class="flex min-h-14 items-center gap-3 py-2.5 md:px-4">
									<StatusDot status="waiting" label="A lesson to keep" />
									<div class="flex min-w-0 flex-1 flex-col">
										<Text truncate>{lesson.text}</Text>
										<Text size="caption" tone="subtle" truncate>
											{props.nameOf(lesson.teammateId)} wants to remember this
										</Text>
									</div>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => void props.onLesson(lesson, false)}
									>
										Drop
									</Button>
									<Button size="sm" onClick={() => void props.onLesson(lesson, true)}>
										Keep
									</Button>
								</div>
							)}
						</For>
					</Rows>
				</section>
			</Show>

			<section aria-label="Teammates" class="flex flex-col gap-1">
				<Heading>Teammates</Heading>
				<Show
					when={props.loaded}
					fallback={
						<div class="flex flex-col gap-1">
							<Skeleton class="h-14" />
							<Skeleton class="h-14" />
						</div>
					}
				>
					<Rows>
						<For each={props.team}>
							{(role) => (
								<a
									href={workspaceHref(`/team/${role.id}`)}
									class="focus-ring flex min-h-14 items-center gap-3 py-2.5 md:px-4 transition-colors duration-fast hover:bg-fill"
								>
									<RoleMark icon={role.icon} />
									<div class="flex min-w-0 flex-1 flex-col">
										<Text truncate>{role.name}</Text>
										<Text size="caption" tone="subtle" truncate>
											{[role.specialty, describeRole(role, props.agents).agent]
												.filter(Boolean)
												.join(" · ")}
										</Text>
									</div>
									<Show
										when={nowLine(props.runs(role.id))}
										fallback={
											<Text size="caption" tone="faint" class="hidden sm:block">
												Free
											</Text>
										}
									>
										{(line) => (
											<span class="flex shrink-0 items-center gap-2 text-caption text-fg-subtle">
												<TeammateDot runs={props.runs(role.id)} />
												<span class="hidden sm:inline">{line()}</span>
											</span>
										)}
									</Show>
									<ChevronRightIcon size="xs" class="shrink-0 text-fg-faint" />
								</a>
							)}
						</For>
						<Show when={props.team.length === 0}>
							<div class="flex min-h-14 items-center gap-3 py-3 md:px-4">
								<Text tone="subtle" class="min-w-0 flex-1">
									No teammates yet. A teammate is a specialist any agent can be, with its own brief,
									skills and memory.
								</Text>
								<Button size="sm" onClick={props.onNew}>
									Add one
								</Button>
							</div>
						</Show>
					</Rows>
				</Show>
			</section>

			<section aria-label="People" class="flex flex-col gap-1">
				<Heading
					trailing={
						<a
							href={workspaceHref("/settings/members")}
							class="focus-ring text-caption text-fg-subtle hover:text-fg"
						>
							Invite
						</a>
					}
				>
					People
				</Heading>
				<Show when={props.members} fallback={<Skeleton class="h-14" />}>
					{(people) => (
						<Rows>
							<For each={people()}>
								{(person) => (
									<div class="flex min-h-14 items-center gap-3 py-2.5 md:px-4">
										<Avatar
											name={person.displayName || person.username}
											src={person.avatarUrl}
											size="lg"
										/>
										<div class="flex min-w-0 flex-1 flex-col">
											<Text truncate>
												{person.displayName || person.username}
												{person.userId === props.me ? " (you)" : ""}
											</Text>
											<Text size="caption" tone="subtle" truncate>
												{person.role.charAt(0).toUpperCase() + person.role.slice(1)}
											</Text>
										</div>
									</div>
								)}
							</For>
						</Rows>
					)}
				</Show>
			</section>
		</>
	);
}

type Tab = "work" | "memory" | "setup";

/** One teammate: who it is and what it runs, then its work, its memory and its setup. */
function TeammatePage(props: {
	role: Role;
	agents: ReturnType<typeof providersStore.providers>;
	stats: TeammateStats | null;
	runs: readonly TeammateRun[];
	team: readonly Role[];
	onEdit: () => void;
	onChat: () => void;
	onStep: Step;
	onLessonsChanged: () => void;
}): JSX.Element {
	const shell = useShell();
	const [tab, setTab] = createSignal<Tab>("work");
	const about = () => describeRole(props.role, props.agents);
	const open = () => props.runs.filter(isOpen);
	const past = () => props.runs.filter((run) => !isOpen(run));
	/** The scorecard as one line: only what there is to say. */
	const score = () => {
		const stats = props.stats;
		if (!stats || stats.finished + stats.stuck === 0) return "No cards finished yet";
		return [
			plural(stats.finished, "card") + " done",
			stats.successRate !== null ? `${Math.round(stats.successRate * 100)}% without help` : null,
			stats.medianMinutes !== null ? `usually ${duration(stats.medianMinutes)}` : null,
			stats.costUsd > 0 ? `$${stats.costUsd.toFixed(2)}` : null,
		]
			.filter(Boolean)
			.join(" · ");
	};
	return (
		<>
			{/* Phones: who it is, wrapped rather than cut, then its two actions side by side at full
			    width. From md the actions sit at the end of the same line. */}
			<header class="flex flex-col gap-4 md:flex-row md:items-center md:gap-3">
				<div class="flex min-w-0 items-center gap-3 md:flex-1">
					<RoleMark icon={props.role.icon} size="lg" />
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<Text as="h1" size="headline" tone="strong" weight="medium" truncate>
							{props.role.name}
						</Text>
						<Show when={props.role.specialty}>
							<Text size="caption" tone="subtle">
								{props.role.specialty}
							</Text>
						</Show>
						<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
							<AgentLogo id={props.role.provider} name={about().agent} class="size-3.5" />
							<span class="min-w-0 break-words">
								{[about().agent, about().model].filter(Boolean).join(" · ")}
							</span>
						</span>
					</div>
				</div>
				<div class="flex gap-2 [&>*]:flex-1 md:[&>*]:flex-none">
					<Button variant="primary" icon={<ChatIcon />} onClick={props.onChat}>
						Chat
					</Button>
					<Button icon={<EditIcon />} onClick={props.onEdit}>
						Edit
					</Button>
				</div>
			</header>

			<Segmented<Tab>
				label="Show"
				value={tab()}
				onChange={setTab}
				block={!shell.desktop()}
				options={[
					{ value: "work", label: "Work", count: open().length || undefined, countTone: "quiet" },
					{ value: "memory", label: "Memory" },
					{ value: "setup", label: "Setup" },
				]}
			/>

			<Show when={tab() === "work"}>
				<Text size="caption" tone="subtle" class="md:px-1">
					{score()}
				</Text>
				<RunList
					title="Now"
					runs={open()}
					empty="Free. Assign it a card on the board."
					onStep={props.onStep}
					name={props.role.name}
				/>
				<Show when={past().length > 0}>
					<RunList
						title="Earlier"
						runs={past()}
						empty=""
						onStep={props.onStep}
						name={props.role.name}
					/>
				</Show>
			</Show>

			<Show when={tab() === "memory"}>
				<Memory role={props.role} onChanged={props.onLessonsChanged} />
			</Show>

			<Show when={tab() === "setup"}>
				<Setup role={props.role} team={props.team} onEdit={props.onEdit} />
			</Show>
		</>
	);
}

/** Cards a teammate has on, or had: each a row with where it stands and the one thing to do. */
function RunList(props: {
	title: string;
	runs: readonly TeammateRun[];
	empty: string;
	name: string;
	onStep: Step;
}): JSX.Element {
	return (
		<section aria-label={props.title} class="flex flex-col gap-1">
			<Heading>{props.title}</Heading>
			<Show
				when={props.runs.length > 0}
				fallback={
					<Text tone="subtle" class="md:px-1">
						{props.empty}
					</Text>
				}
			>
				<Rows>
					<For each={props.runs}>
						{(run) => (
							<div class="flex min-h-14 items-center gap-3 py-2.5 md:px-4">
								<StatusDot status={RUN_STATE[run.state].dot} label={RUN_STATE[run.state].label} />
								<div class="flex min-w-0 flex-1 flex-col">
									<a
										href={cardHref(run)}
										class="focus-ring truncate text-body text-fg hover:underline"
									>
										{run.taskKey} {run.taskTitle}
									</a>
									<Text
										size="caption"
										tone={run.state === "needs_you" ? "danger" : "subtle"}
										truncate
									>
										{run.state === "needs_you" && run.error
											? run.error
											: `${RUN_STATE[run.state].label} · ${since(run.updatedAt)}${run.fromRun ? " · handed on" : ""}`}
									</Text>
								</div>
								<Show when={threadHref(run)}>
									{(href) => (
										<ButtonLink
											href={href()}
											size="sm"
											variant="ghost"
											class="hidden sm:inline-flex"
										>
											Thread
										</ButtonLink>
									)}
								</Show>
								<Show when={run.state === "plan_ready"}>
									<Button
										size="sm"
										onClick={() => void props.onStep(run, "approve", `${props.name} is on it`)}
									>
										Approve
									</Button>
								</Show>
								<Show when={run.state === "needs_you" || run.state === "stopped"}>
									<Button size="sm" onClick={() => void props.onStep(run, "retry", "Trying again")}>
										Retry
									</Button>
								</Show>
								<Show when={isOpen(run) && run.state !== "plan_ready"}>
									<IconButton
										label="Stop"
										size="sm"
										onClick={() => void props.onStep(run, "stop", "Stopped")}
									>
										<CloseIcon />
									</IconButton>
								</Show>
							</div>
						)}
					</For>
				</Rows>
			</Show>
		</section>
	);
}

/** What a teammate has learned: lessons waiting for approval, those it keeps, and a way to teach. */
function Memory(props: { role: Role; onChanged: () => void }): JSX.Element {
	const auth = useAuth();
	const [lessons, setLessons] = createSignal<TeammateLesson[] | null>(null);
	const [text, setText] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const read = async () => {
		const [token, id] = untrack(() => [auth.token(), props.role.id] as const);
		if (!token) return;
		setLessons(await teamService.lessons(token, id).catch(() => []));
	};
	createEffect(
		() => props.role.id,
		() => void read(),
	);
	const proposed = () => (lessons() ?? []).filter((item) => item.state === "proposed");
	const kept = () => (lessons() ?? []).filter((item) => item.state === "kept");

	async function act(run: (token: string) => Promise<unknown>, done: string): Promise<void> {
		const token = auth.token();
		if (!token || busy()) return;
		setBusy(true);
		try {
			await run(token);
			notify({ title: done });
			await read();
			props.onChanged();
		} catch (cause) {
			notify({ title: message(cause, "That did not work"), tone: "danger" });
		} finally {
			setBusy(false);
		}
	}

	return (
		<section aria-label="Memory" class="flex flex-col gap-6">
			<form
				class="flex items-center gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					const lesson = text().trim();
					if (!lesson) return;
					void act(async (token) => {
						await teamService.teach(token, props.role.id, lesson);
						setText("");
					}, `${props.role.name} will remember that`);
				}}
			>
				<Input
					aria-label={`Teach ${props.role.name}`}
					placeholder={`Teach ${props.role.name} something`}
					value={text()}
					maxlength={300}
					onInput={(event) => setText(event.currentTarget.value)}
					class="min-w-0 flex-1"
				/>
				<Button type="submit" disabled={busy() || !text().trim()}>
					Teach
				</Button>
			</form>
			<Show when={lessons()} fallback={<Skeleton class="h-24" />}>
				<Show when={proposed().length > 0}>
					<div class="flex flex-col gap-1">
						<Heading>Wants to remember</Heading>
						<Rows>
							<For each={proposed()}>
								{(lesson) => (
									<div class="flex min-h-12 items-center gap-3 py-2 md:px-4">
										<Text class="min-w-0 flex-1">{lesson.text}</Text>
										<Button
											size="sm"
											variant="ghost"
											onClick={() =>
												void act((token) => teamService.forget(token, lesson.id), "Dropped")
											}
										>
											Drop
										</Button>
										<Button
											size="sm"
											onClick={() =>
												void act(
													(token) => teamService.keep(token, lesson.id),
													`${props.role.name} will remember that`,
												)
											}
										>
											Keep
										</Button>
									</div>
								)}
							</For>
						</Rows>
					</div>
				</Show>
				<div class="flex flex-col gap-1">
					<Heading>Knows</Heading>
					<Show
						when={kept().length > 0}
						fallback={
							<Text tone="subtle" class="md:px-1">
								Nothing yet. Correct {props.role.name} in a thread and it proposes a lesson here.
							</Text>
						}
					>
						<Rows>
							<For each={kept()}>
								{(lesson) => (
									<div class="flex min-h-12 items-center gap-3 py-2 md:px-4">
										<Text class="min-w-0 flex-1">{lesson.text}</Text>
										<IconButton
											label="Forget this"
											size="sm"
											onClick={() =>
												void act((token) => teamService.forget(token, lesson.id), "Forgotten")
											}
										>
											<CloseIcon />
										</IconButton>
									</div>
								)}
							</For>
						</Rows>
					</Show>
				</div>
			</Show>
		</section>
	);
}

/** How a teammate is set up, in words, with the way to change it. */
function Setup(props: { role: Role; team: readonly Role[]; onEdit: () => void }): JSX.Element {
	const next = () => props.team.find((item) => item.id === props.role.handoffTo)?.name ?? null;
	return (
		<section aria-label="Setup" class="flex flex-col gap-4">
			<Rows>
				<DescriptionList
					items={[
						{ label: "How it works", value: props.role.brief || "No brief yet." },
						{
							label: "Cards",
							value: [
								props.role.autoStart ? "Starts by itself" : "Waits for Start",
								props.role.planFirst ? "plans first" : "no plan",
								props.role.parallel === 1 ? "one at a time" : `${props.role.parallel} at once`,
							].join(", "),
						},
						{ label: "When done", value: next() ? `Hands to ${next()}` : "To review" },
						{
							label: "Skills",
							value: props.role.skills.length
								? plural(props.role.skills.length, "skill")
								: "The team's",
						},
						{
							label: "Tools",
							value:
								props.role.connectors === null
									? "Every connector"
									: plural(props.role.connectors.length, "connector"),
						},
					]}
				/>
			</Rows>
			{/* On phones the header's Edit is right above; from md it ends the list too. */}
			<div class="hidden md:block">
				<Button size="sm" icon={<EditIcon />} onClick={props.onEdit}>
					Edit
				</Button>
			</div>
		</section>
	);
}
