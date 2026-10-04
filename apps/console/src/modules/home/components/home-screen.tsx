import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, Errored, For, Loading, Show } from "solid-js";

import {
	AgentLogo,
	Alert,
	Avatar,
	Button,
	CardRow,
	DotLine,
	MainAside,
	SectionCard,
	Skeleton,
	Text,
} from "@/kit";
import { workspaceHref } from "@/lib/active-workspace";
import { now as clockNow } from "@/lib/clock";
import { useAuth } from "@/modules/auth";
import {
	type Automation,
	automationsService,
} from "@/modules/automations/services/automations.service";
import { INBOX_KINDS, type InboxItem, inboxStore } from "@/modules/inbox";
import { projectsService, TASK_STATUS_LABELS, useWorkspace } from "@/modules/projects";
import { ShellSlot, useShell } from "@/modules/shell";

import {
	dayLabel,
	greeting,
	LIMITS,
	movingTasks,
	needsYou,
	ownerLabel,
	type ProjectTask,
	recentlyDone,
	shortDay,
	needLabel,
	summary,
	upcoming,
} from "../lib/today";
import { HomeNav } from "./home-nav";

/**
 * Every project's tasks, read together. A project that does not answer is named with its reason,
 * not fatal: the rest of the work in flight still shows.
 */
type MovingView = { entries: ProjectTask[]; failed: { name: string; reason: string }[] };

/** The next automations to run, or why they could not be read. */
type UpNextView = { items: Automation[]; failed: string | null };

/**
 * A read that waits for sign-in: never settles, so the part keeps showing its placeholder. The
 * memo runs again once there is a token, and that run is the one that answers.
 */
const untilSignedIn = <T,>(): Promise<T> => new Promise<T>(() => {});

const reasonOf = (cause: unknown, fallback: string) =>
	cause instanceof Error && cause.message ? cause.message : fallback;

/**
 * The first screen of the day: what needs you (the newest unread inbox items), the work in
 * flight across every project and who has it, and the automations that run next. Each row opens
 * the thing itself; each part links to its full list.
 */
export function HomeScreen(): JSX.Element {
	const auth = useAuth();
	const workspace = useWorkspace();
	const navigate = useNavigate();
	const shell = useShell();
	// Read inside the UI, so the greeting and the date turn over with the shared clock.
	const today = () => new Date(clockNow());

	createEffect(
		() => auth.token(),
		(token) => {
			if (token) void inboxStore.load(token);
		},
	);

	const moving = createMemo(async (): Promise<MovingView> => {
		const token = auth.token();
		const projects = workspace.projects();
		// Until sign-in is restored there is nothing to ask yet: stay loading rather than say "no work".
		if (!token) return untilSignedIn();
		if (projects.length === 0) return { entries: [], failed: [] };
		const answers = await Promise.all(
			projects.map((project) =>
				projectsService.listTasks(token, project.slug).then(
					(tasks) => ({ entries: tasks.map((task) => ({ project, task })), failure: null }),
					(cause: unknown) => {
						console.warn(`[home] ${project.slug}'s board did not answer`, cause);
						const reason = reasonOf(cause, "The board did not answer");
						return { entries: [], failure: { name: project.name, reason } };
					},
				),
			),
		);
		const failed = answers.flatMap((answer) => (answer.failure ? [answer.failure] : []));
		// Every project failing is an error to show and retry; some failing is a note under the list.
		if (failed.length === projects.length) {
			throw new Error(`The boards did not answer: ${failed[0]?.reason ?? ""}`);
		}
		return { entries: movingTasks(answers.flatMap((answer) => answer.entries)), failed };
	});

	const automations = createMemo(async (): Promise<UpNextView> => {
		const token = auth.token();
		if (!token) return untilSignedIn();
		return automationsService.list(token).then(
			(items) => ({ items: upcoming(items), failed: null }),
			// The runner not answering only hides this part; the rest of Today still works. Its
			// messages are written to be shown ("The runner is not reachable…").
			(cause: unknown) => {
				console.warn("[home] automations did not answer", cause);
				return { items: [], failed: reasonOf(cause, "Automations did not answer") };
			},
		);
	});

	const waiting = createMemo(() => needsYou(inboxStore.items()));
	const away = createMemo(() => recentlyDone(inboxStore.items(), clockNow()));
	const needCount = () => (inboxStore.loaded() && !inboxStore.error() ? inboxStore.unread() : null);

	function openItem(item: InboxItem): void {
		const token = auth.token();
		if (token) void inboxStore.open(token, item);
		navigate(workspaceHref(item.url));
	}

	const openTask = (entry: ProjectTask) =>
		navigate(workspaceHref(`/board/${entry.project.slug}/tasks/${entry.task.number}`));

	return (
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
			<ShellSlot name="crumb">Today</ShellSlot>
			<ShellSlot name="subtitle">
				{[shortDay(today()), needCount() ? needLabel(needCount() ?? 0) : null]
					.filter(Boolean)
					.join(" · ")}
			</ShellSlot>

			<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-8 md:px-10 md:pt-10">
				<HomeNav
					current="today"
					today={needCount() === null ? undefined : summary(needCount(), 0)}
					waiting={(needCount() ?? 0) > 0}
				/>
				{/* The greeting is the page's title on desktop; phones have it in their header. */}
				<header class="hidden items-end justify-between gap-4 lg:flex">
					<div class="flex min-w-0 flex-col gap-1">
						<Text as="h1" size="headline" tone="strong" weight="medium">
							{auth.user() ? `${greeting(today())}, ${auth.user()?.username}` : greeting(today())}
						</Text>
						<Loading fallback={<Text size="body-lg">{dayLabel(today())}</Text>}>
							<Errored fallback={() => <Text size="body-lg">{dayLabel(today())}</Text>}>
								<Text size="body-lg">
									{[dayLabel(today()), summary(needCount(), moving().entries.length)]
										.filter(Boolean)
										.join(" · ")}
								</Text>
							</Errored>
						</Loading>
					</div>
					<Button size="sm" onClick={() => shell.setPaletteOpen(true, "ask")}>
						Ask Grid
					</Button>
				</header>

				<MainAside
					main={
						<>
							<SectionCard
								title="Needs you"
								count={needCount() ?? undefined}
								action={
									<Button
										size="sm"
										variant="ghost"
										onClick={() => navigate(workspaceHref("/inbox"))}
									>
										Inbox
									</Button>
								}
							>
								<Show when={inboxStore.loaded()} fallback={<RowsSkeleton count={2} />}>
									<Show when={inboxStore.error()}>
										{(reason) => (
											<div class="p-4">
												<Alert
													tone="danger"
													title={reason()}
													action={
														<Button
															size="sm"
															onClick={() => {
																const token = auth.token();
																if (token) void inboxStore.load(token, true);
															}}
														>
															Try again
														</Button>
													}
												/>
											</div>
										)}
									</Show>
									<Show
										when={waiting().length > 0}
										fallback={
											<Show when={!inboxStore.error()}>
												<Quiet>Nothing is waiting on you.</Quiet>
											</Show>
										}
									>
										<For each={waiting()}>
											{(item) => (
												<CardRow
													tone={INBOX_KINDS[item.kind].tone}
													icon={INBOX_KINDS[item.kind].icon()}
													title={item.title}
													meta={`${item.project} · ${item.body}`}
													onClick={() => openItem(item)}
													action={
														<Button
															size="sm"
															variant={item.kind === "pull_review" ? "primary" : "secondary"}
															aria-label={`${ACTION[item.kind]}: ${item.title}`}
															onClick={() => openItem(item)}
														>
															{ACTION[item.kind]}
														</Button>
													}
												/>
											)}
										</For>
									</Show>
								</Show>
							</SectionCard>

							<SectionCard
								title="Agents' plan for today"
								action={
									<Button
										size="sm"
										variant="ghost"
										onClick={() => navigate(workspaceHref("/board"))}
									>
										Board
									</Button>
								}
							>
								<Loading fallback={<RowsSkeleton count={3} />}>
									<Errored
										fallback={(error, reset) => (
											<div class="p-4">
												<Alert
													tone="danger"
													title={reasonOf(error(), "The boards did not answer")}
													action={
														<Button size="sm" onClick={reset}>
															Try again
														</Button>
													}
												/>
											</div>
										)}
									>
										<Show
											when={moving().entries.length > 0}
											fallback={
												<Quiet>No work in flight. Tasks you or an agent start show up here.</Quiet>
											}
										>
											<For each={moving().entries.slice(0, LIMITS.moving)}>
												{(entry) => (
													<CardRow
														icon={
															<Show
																when={entry.task.owner?.kind === "agent"}
																fallback={<Avatar name={ownerLabel(entry.task)} />}
															>
																<AgentLogo
																	id={agentId(entry.task.owner?.name)}
																	name={ownerLabel(entry.task)}
																/>
															</Show>
														}
														title={entry.task.title}
														meta={`${entry.task.key} · ${entry.project.name} · ${ownerLabel(entry.task)} · ${TASK_STATUS_LABELS[entry.task.status]}`}
														onClick={() => openTask(entry)}
														action={
															<Button
																size="sm"
																variant="ghost"
																aria-label={`Open ${entry.task.title}`}
																onClick={() => openTask(entry)}
															>
																Open
															</Button>
														}
													/>
												)}
											</For>
										</Show>
										<Show when={moving().failed.length > 0}>
											<Quiet>
												{moving().failed.length === 1
													? `${moving().failed[0]?.name}'s board did not answer: ${moving().failed[0]?.reason}`
													: `${moving().failed.length} projects' boards did not answer.`}
											</Quiet>
										</Show>
									</Errored>
								</Loading>
							</SectionCard>
						</>
					}
					aside={
						<>
							<SectionCard title="While you were away">
								<Show when={inboxStore.loaded()} fallback={<RowsSkeleton count={2} />}>
									<Show
										when={away().length > 0}
										fallback={<Quiet>Nothing happened since yesterday.</Quiet>}
									>
										<div class="flex flex-col py-1">
											<For each={away()}>
												{(item) => (
													<DotLine
														tone={INBOX_KINDS[item.kind].tone}
														onClick={() => openItem(item)}
													>
														{item.title}
													</DotLine>
												)}
											</For>
										</div>
									</Show>
								</Show>
							</SectionCard>

							<SectionCard
								title="Scheduled"
								action={
									<Button
										size="sm"
										variant="ghost"
										onClick={() => navigate(workspaceHref("/automations"))}
									>
										Automations
									</Button>
								}
							>
								<Loading fallback={<RowsSkeleton count={2} />}>
									<Errored fallback={() => <Quiet>Automations did not load.</Quiet>}>
										<Show
											when={automations().failed === null}
											fallback={
												<Quiet>{`Automations did not answer: ${automations().failed}`}</Quiet>
											}
										>
											<Show
												when={automations().items.length > 0}
												fallback={
													<Quiet>Nothing scheduled. Automations show their next run here.</Quiet>
												}
											>
												<For each={automations().items}>
													{(item) => (
														<CardRow
															lead={item.nextRunAt ? timeOf(item.nextRunAt) : undefined}
															title={item.name}
															meta={
																workspace
																	.projects()
																	.find((project) => project.slug === item.project)?.name ??
																item.project
															}
															onClick={() => navigate(workspaceHref("/automations"))}
														/>
													)}
												</For>
											</Show>
										</Show>
									</Errored>
								</Loading>
							</SectionCard>
						</>
					}
				/>
			</div>
		</div>
	);
}

/** The button on a waiting item, by what it waits for (Figma: Review, Answer, Open). */
const ACTION: Record<InboxItem["kind"], string> = {
	approval: "Answer",
	pull_review: "Review",
	pull_checks: "Open",
	turn_done: "Open",
	turn_error: "Open",
};

/** Which agent's logo a task owner's name is, as far as Grid knows its agents. */
function agentId(name: string | null | undefined): string {
	const lower = (name ?? "").toLowerCase();
	for (const id of ["claude", "codex", "opencode", "antigravity"])
		if (lower.includes(id)) return id;
	return lower;
}

/** A run's time today as "11:00", or its day when it is later. */
function timeOf(iso: string): string {
	const at = new Date(iso);
	const now = new Date(clockNow());
	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	if (at.toDateString() === now.toDateString()) {
		return at.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
	}
	if (at.toDateString() === tomorrow.toDateString()) return "Tmrw";
	return at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** A part with nothing to show says so in one quiet line. */
function Quiet(props: { children: JSX.Element }): JSX.Element {
	return (
		<Text tone="subtle" class="block px-4.5 pt-1 pb-4">
			{props.children}
		</Text>
	);
}

function RowsSkeleton(props: { count: number }): JSX.Element {
	return (
		<div class="flex flex-col gap-2 px-4.5 pt-1 pb-4">
			<For each={Array.from({ length: props.count })}>{() => <Skeleton class="h-10" />}</For>
		</div>
	);
}
