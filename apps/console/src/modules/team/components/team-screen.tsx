import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";

import { workspaceHref } from "@/lib/active-workspace";
import {
	AgentLogo,
	Alert,
	Avatar,
	Badge,
	Button,
	ButtonLink,
	ChatIcon,
	CheckIcon,
	CloseIcon,
	EditIcon,
	EmptyState,
	Figures,
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
	UserIcon,
} from "@/kit";
import { useAuth } from "@/modules/auth";
import { describeRole } from "@/modules/chat/components/roles";
import { rememberRole } from "@/modules/chat/lib/chosen-role";
import { providersStore } from "@/modules/chat/stores/providers";
import { rolesStore } from "@/modules/chat/stores/roles";
import type { Role, RoleDraft } from "@/modules/chat/types/chat.types";
import { ShellSlot } from "@/modules/shell";
import { useWorkspaces } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member } from "@/modules/workspaces/types/workspace.types";

import { duration, isOpen, RUN_STATE, waitsOnYou } from "../lib/run-state";
import { TEAMMATE_TEMPLATES } from "../lib/templates";
import { teamService } from "../services/team.service";
import type { TeammateLesson, TeammateRun, TeammateStats } from "../types/team.types";

import { TeammateDialog } from "./teammate-dialog";

/** How often an open Team screen reads its teammates' work again: they work on their own. */
const REFRESH_MS = 15_000;

function message(cause: unknown, fallback: string): string {
	return cause instanceof Error ? cause.message : fallback;
}

function since(at: string): string {
	const minutes = (Date.now() - Date.parse(at)) / 60_000;
	return minutes < 1 ? "just now" : `${duration(minutes)} ago`;
}

/** Where a run's card is on the board, and its thread. */
const cardHref = (run: TeammateRun) =>
	workspaceHref(`/board/${run.project}/tasks/${run.taskNumber}`);
const threadHref = (run: TeammateRun) =>
	run.sessionId ? workspaceHref(`/chat/${run.project}/${run.sessionId}`) : null;

/**
 * The team (Team): the people in the workspace and its teammates side by side. The overview leads
 * with what waits on you (plans to approve, stuck cards, lessons to keep), then each teammate with
 * what it is doing now and its scorecard, then the people. A teammate's page has its work, its
 * memory and its setup. Everything a teammate does is read again every few seconds while open.
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
	const [loaded, setLoaded] = createSignal(false);
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
		} finally {
			setLoaded(true);
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
			navigate(workspaceHref(`/team/${saved.id}`));
		}
	}

	/** Runs a step on a run, then reads the team again. */
	async function step(
		run: TeammateRun,
		action: "approve" | "stop" | "retry",
		done: string,
	): Promise<void> {
		const token = auth.token();
		if (!token) return;
		try {
			await teamService[action](token, run.id);
			notify({ title: done });
			await refresh();
		} catch (cause) {
			notify({ title: message(cause, "That did not work"), tone: "danger" });
		}
	}

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
		navigate(workspaceHref("/chat"));
	}

	return (
		<div class="flex min-h-0 flex-1 flex-col">
			<ShellSlot name="panelActions">
				<IconButton label="New teammate" size="sm" onClick={() => setEditing({ role: null })}>
					<PlusIcon size="sm" />
				</IconButton>
			</ShellSlot>
			<ShellSlot name="panel">
				<NavLink
					href={workspaceHref("/team")}
					icon={<UserIcon />}
					label="Overview"
					current={openId() === null}
					trailing={
						waiting().length + proposed().length > 0 ? (
							<Badge tone="warning">{waiting().length + proposed().length}</Badge>
						) : undefined
					}
				/>
				<Text size="caption" tone="subtle" class="px-2.5 pt-3 pb-1">
					Teammates
				</Text>
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
				<Show when={rolesStore.loaded("") && team().length === 0}>
					<Text size="caption" tone="subtle" class="px-2.5 py-1">
						None yet.
					</Text>
				</Show>
			</ShellSlot>
			<ShellSlot name="subtitle">Team</ShellSlot>

			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-4 pb-12 md:px-8 md:pt-10">
					<Show when={error()}>{(text) => <Alert tone="danger" title={text()} />}</Show>
					<Show
						when={openId()}
						fallback={
							<Overview
								team={team()}
								agents={agents()}
								loaded={loaded() && rolesStore.loaded("")}
								members={members()}
								waiting={waiting()}
								proposed={proposed()}
								stats={statsOf}
								runs={runsOf}
								nameOf={nameOf}
								me={auth.user()?.id ?? null}
								onNew={() => setEditing({ role: null })}
								onStep={step}
								onLesson={lesson}
								onChat={chatWith}
							/>
						}
					>
						<Show
							when={opened()}
							fallback={
								<Show when={rolesStore.loaded("")} fallback={<Skeleton class="h-40" />}>
									<EmptyState
										icon={<UserIcon size="lg" />}
										title="This teammate has left the team"
										action={
											<ButtonLink href={workspaceHref("/team")} size="sm">
												Back to the team
											</ButtonLink>
										}
									/>
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
					navigate(workspaceHref("/team"));
				}}
			/>
		</div>
	);
}

/** A teammate's state at a glance: waiting on you, at work, or nothing. */
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

/** What a teammate is doing now, in a few words. */
function nowLine(runs: readonly TeammateRun[]): string {
	const open = runs.filter(isOpen);
	const lead =
		open.find((run) => run.state === "working" || run.state === "planning") ??
		open.find(waitsOnYou) ??
		runs.find(waitsOnYou) ??
		open[0];
	if (!lead) return "Free for a card";
	const more = open.length > 1 ? ` · ${open.length - 1} more` : "";
	return `${RUN_STATE[lead.state].label} · ${lead.taskKey}${more}`;
}

function Overview(props: {
	team: readonly Role[];
	agents: ReturnType<typeof providersStore.providers>;
	loaded: boolean;
	members: readonly Member[] | null;
	waiting: readonly TeammateRun[];
	proposed: readonly TeammateLesson[];
	stats: (id: string) => TeammateStats | null;
	runs: (id: string) => TeammateRun[];
	nameOf: (id: string) => string;
	me: string | null;
	onNew: () => void;
	onStep: (run: TeammateRun, action: "approve" | "stop" | "retry", done: string) => Promise<void>;
	onLesson: (lesson: TeammateLesson, keep: boolean) => Promise<void>;
	onChat: (role: Role) => void;
}): JSX.Element {
	const roleOf = (id: string) => props.team.find((item) => item.id === id);
	return (
		<>
			<header class="flex flex-col gap-4 sm:flex-row sm:items-end">
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<Text as="h1" size="display" tone="strong" weight="medium">
						Team
					</Text>
					<Text tone="subtle">
						{props.members ? `${props.members.length} people` : "People"} · {props.team.length}{" "}
						teammate{props.team.length === 1 ? "" : "s"}. Give a teammate a card on the board and it
						works on it in its own worktree.
					</Text>
				</div>
				<Button variant="primary" icon={<PlusIcon />} onClick={props.onNew}>
					New teammate
				</Button>
			</header>

			<Show when={props.waiting.length + props.proposed.length > 0}>
				<section aria-label="Waiting on you" class="flex flex-col gap-2">
					<Text size="caption" tone="subtle" weight="medium" class="px-1">
						Waiting on you
					</Text>
					<div class="surface-card flex flex-col divide-y divide-line">
						<For each={props.waiting}>
							{(run) => (
								<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
									<div class="flex min-w-0 flex-1 items-center gap-3">
										<RoleMark icon={roleOf(run.teammateId)?.icon ?? "code"} />
										<div class="flex min-w-0 flex-col">
											<a
												href={cardHref(run)}
												class="focus-ring truncate font-medium text-body text-fg hover:underline"
											>
												{run.taskKey}: {run.taskTitle}
											</a>
											<Text size="caption" tone="subtle" truncate>
												{props.nameOf(run.teammateId)} ·{" "}
												{run.state === "plan_ready"
													? "wrote a plan for you to approve"
													: (run.error ?? "got stuck")}
											</Text>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<Show when={threadHref(run)}>
											{(href) => (
												<ButtonLink href={href()} size="sm" variant="ghost">
													{run.state === "plan_ready" ? "Read plan" : "Open"}
												</ButtonLink>
											)}
										</Show>
										<Show
											when={run.state === "plan_ready"}
											fallback={
												<Button
													size="sm"
													onClick={() => void props.onStep(run, "retry", "Trying again")}
												>
													Retry
												</Button>
											}
										>
											<Button
												size="sm"
												variant="primary"
												icon={<CheckIcon />}
												onClick={() =>
													void props.onStep(
														run,
														"approve",
														`${props.nameOf(run.teammateId)} is on it`,
													)
												}
											>
												Approve
											</Button>
										</Show>
									</div>
								</div>
							)}
						</For>
						<For each={props.proposed}>
							{(lesson) => (
								<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
									<div class="flex min-w-0 flex-1 items-center gap-3">
										<RoleMark icon={roleOf(lesson.teammateId)?.icon ?? "code"} />
										<div class="flex min-w-0 flex-col">
											<Text weight="medium">“{lesson.text}”</Text>
											<Text size="caption" tone="subtle">
												{props.nameOf(lesson.teammateId)} wants to remember this
											</Text>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => void props.onLesson(lesson, false)}
										>
											Drop
										</Button>
										<Button
											size="sm"
											variant="primary"
											icon={<CheckIcon />}
											onClick={() => void props.onLesson(lesson, true)}
										>
											Keep
										</Button>
									</div>
								</div>
							)}
						</For>
					</div>
				</section>
			</Show>

			<section aria-label="Teammates" class="flex flex-col gap-3">
				<Text size="caption" tone="subtle" weight="medium" class="px-1">
					Teammates
				</Text>
				<Show
					when={props.loaded}
					fallback={
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<Skeleton class="h-44" />
							<Skeleton class="h-44" />
							<Skeleton class="h-44" />
						</div>
					}
				>
					<Show
						when={props.team.length > 0}
						fallback={
							<div class="surface-card flex flex-col gap-5 p-6">
								<div class="flex flex-col gap-1">
									<Text weight="medium" tone="strong">
										Hire your first teammate
									</Text>
									<Text tone="subtle">
										A specialist any agent can be. Its brief, skills, tools and what it learns go
										with every card and thread it takes.
									</Text>
								</div>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
									<For each={TEAMMATE_TEMPLATES.slice(0, 4)}>
										{(item) => (
											<button
												type="button"
												onClick={props.onNew}
												class="surface-card focus-ring flex min-w-0 flex-col items-start gap-2 p-3 text-left transition-colors duration-fast hover:bg-fill"
											>
												<RoleMark icon={item.icon} size="sm" />
												<span class="w-full truncate font-medium text-body text-fg">
													{item.specialty}
												</span>
											</button>
										)}
									</For>
								</div>
							</div>
						}
					>
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<For each={props.team}>
								{(role) => (
									<TeammateCard
										role={role}
										agents={props.agents}
										stats={props.stats(role.id)}
										runs={props.runs(role.id)}
										onChat={() => props.onChat(role)}
									/>
								)}
							</For>
						</div>
					</Show>
				</Show>
			</section>

			<section aria-label="People" class="flex flex-col gap-3">
				<Text size="caption" tone="subtle" weight="medium" class="px-1">
					People
				</Text>
				<Show
					when={props.members}
					fallback={
						<div class="flex flex-col gap-2">
							<Skeleton class="h-12" />
							<Skeleton class="h-12" />
						</div>
					}
				>
					{(people) => (
						<div class="surface-card flex flex-col divide-y divide-line">
							<For each={people()}>
								{(person) => (
									<div class="flex min-h-14 items-center gap-3 px-4 py-2">
										<Avatar
											name={person.displayName || person.username}
											src={person.avatarUrl}
											size="lg"
										/>
										<div class="flex min-w-0 flex-1 flex-col">
											<Text weight="medium" truncate>
												{person.displayName || person.username}
												{person.userId === props.me ? " (you)" : ""}
											</Text>
											<Text size="caption" tone="subtle" truncate>
												{person.email ?? `@${person.username}`}
											</Text>
										</div>
										<Badge>{person.role.charAt(0).toUpperCase() + person.role.slice(1)}</Badge>
									</div>
								)}
							</For>
							<div class="flex items-center justify-between gap-3 px-4 py-3">
								<Text size="caption" tone="subtle">
									Invite people and set what they can do in Settings → Members.
								</Text>
								<ButtonLink href={workspaceHref("/settings/members")} size="sm" variant="ghost">
									Members
								</ButtonLink>
							</div>
						</div>
					)}
				</Show>
			</section>
		</>
	);
}

/** A teammate on the overview: who, what it runs, what it is doing, and how it has done. */
function TeammateCard(props: {
	role: Role;
	agents: ReturnType<typeof providersStore.providers>;
	stats: TeammateStats | null;
	runs: readonly TeammateRun[];
	onChat: () => void;
}): JSX.Element {
	const about = () => describeRole(props.role, props.agents);
	const busy = () => props.runs.some(isOpen);
	return (
		<article class="surface-card flex min-w-0 flex-col gap-4 p-4">
			<a
				href={workspaceHref(`/team/${props.role.id}`)}
				class="focus-ring flex min-w-0 items-center gap-3"
			>
				<RoleMark icon={props.role.icon} size="lg" />
				<div class="flex min-w-0 flex-1 flex-col">
					<Text weight="medium" tone="strong" truncate>
						{props.role.name}
					</Text>
					<Text size="caption" tone="subtle" truncate>
						{props.role.specialty || "Teammate"}
					</Text>
				</div>
				<TeammateDot runs={props.runs} />
			</a>
			<div class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
				<AgentLogo id={props.role.provider} name={about().agent} class="size-3.5" />
				<span class="truncate">
					{[about().agent, about().model, about().effort].filter(Boolean).join(" · ")}
				</span>
			</div>
			<Text size="caption" tone={busy() ? "default" : "subtle"} truncate>
				{nowLine(props.runs)}
			</Text>
			<div class="flex items-center gap-3 border-line border-t pt-3 text-caption text-fg-subtle">
				<span title="Cards finished">
					<span class="text-fg tabular-nums">{props.stats?.finished ?? 0}</span> done
				</span>
				<Show when={props.stats?.successRate !== null && props.stats?.successRate !== undefined}>
					<span title="Of the cards that ended, the share finished">
						<span class="text-fg tabular-nums">
							{Math.round((props.stats?.successRate ?? 0) * 100)}%
						</span>{" "}
						clean
					</span>
				</Show>
				<span title="Lessons it keeps">
					<span class="text-fg tabular-nums">{props.stats?.lessons ?? 0}</span> lessons
				</span>
				<span class="flex-1" />
				<IconButton label={`Chat with ${props.role.name}`} size="sm" onClick={props.onChat}>
					<ChatIcon />
				</IconButton>
			</div>
		</article>
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
	onStep: (run: TeammateRun, action: "approve" | "stop" | "retry", done: string) => Promise<void>;
	onLessonsChanged: () => void;
}): JSX.Element {
	const [tab, setTab] = createSignal<Tab>("work");
	const about = () => describeRole(props.role, props.agents);
	const open = () => props.runs.filter(isOpen);
	const past = () => props.runs.filter((run) => !isOpen(run));
	return (
		<>
			<header class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div class="flex min-w-0 flex-1 items-center gap-4">
					<RoleMark icon={props.role.icon} size="lg" />
					<div class="flex min-w-0 flex-col gap-0.5">
						<Text as="h1" size="headline" tone="strong" weight="medium" truncate>
							{props.role.name}
						</Text>
						<span class="flex min-w-0 items-center gap-1.5 text-caption text-fg-subtle">
							<span class="truncate">{props.role.specialty || "Teammate"}</span>
							<span aria-hidden="true">·</span>
							<AgentLogo id={props.role.provider} name={about().agent} class="size-3.5" />
							<span class="truncate">
								{[about().agent, about().model, about().effort].filter(Boolean).join(" · ")}
							</span>
						</span>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Button icon={<EditIcon />} onClick={props.onEdit}>
						Edit
					</Button>
					<Button variant="primary" icon={<ChatIcon />} onClick={props.onChat}>
						Chat with {props.role.name}
					</Button>
				</div>
			</header>

			<Segmented<Tab>
				label="Show"
				value={tab()}
				onChange={setTab}
				options={[
					{ value: "work", label: "Work", count: open().length || undefined },
					{ value: "memory", label: "Memory", count: props.stats?.lessons || undefined },
					{ value: "setup", label: "Setup" },
				]}
			/>

			<Show when={tab() === "work"}>
				<section aria-label="Scorecard" class="surface-card flex flex-col gap-3 p-4">
					<Figures
						items={[
							{ value: String(props.stats?.finished ?? 0), label: "Cards finished" },
							{
								value:
									props.stats?.successRate === null || props.stats?.successRate === undefined
										? "—"
										: `${Math.round(props.stats.successRate * 100)}%`,
								label: "Finished without getting stuck",
							},
							{
								value:
									props.stats?.medianMinutes === null || props.stats?.medianMinutes === undefined
										? "—"
										: duration(props.stats.medianMinutes),
								label: "Typical card",
							},
						]}
					/>
					<Show when={(props.stats?.costUsd ?? 0) > 0}>
						<Text size="caption" tone="subtle">
							${props.stats?.costUsd.toFixed(2)} spent on its cards so far
						</Text>
					</Show>
				</section>
				<RunList
					title="On now"
					runs={open()}
					empty="No card right now. Assign one to it on the board."
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

/** Cards a teammate has on, or had: each with where it stands and what can be done about it. */
function RunList(props: {
	title: string;
	runs: readonly TeammateRun[];
	empty: string;
	name: string;
	onStep: (run: TeammateRun, action: "approve" | "stop" | "retry", done: string) => Promise<void>;
}): JSX.Element {
	return (
		<section aria-label={props.title} class="flex flex-col gap-2">
			<Text size="caption" tone="subtle" weight="medium" class="px-1">
				{props.title}
			</Text>
			<Show
				when={props.runs.length > 0}
				fallback={
					<Text tone="subtle" class="px-1">
						{props.empty}
					</Text>
				}
			>
				<div class="surface-card flex flex-col divide-y divide-line">
					<For each={props.runs}>
						{(run) => (
							<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<a
										href={cardHref(run)}
										class="focus-ring truncate font-medium text-body text-fg hover:underline"
									>
										{run.taskKey}: {run.taskTitle}
									</a>
									<span class="flex min-w-0 flex-wrap items-center gap-2 text-caption text-fg-subtle">
										<Badge tone={RUN_STATE[run.state].tone} dot>
											{RUN_STATE[run.state].label}
										</Badge>
										<span>{since(run.updatedAt)}</span>
										<Show when={run.branch}>
											<span class="truncate font-mono">{run.branch}</span>
										</Show>
										<Show when={run.fromRun}>
											<span>handed on</span>
										</Show>
									</span>
									<Show when={run.state === "needs_you" && run.error}>
										<Text size="caption" tone="danger">
											{run.error}
										</Text>
									</Show>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<Show when={threadHref(run)}>
										{(href) => (
											<ButtonLink href={href()} size="sm" variant="ghost">
												Thread
											</ButtonLink>
										)}
									</Show>
									<Show when={run.state === "plan_ready"}>
										<Button
											size="sm"
											variant="primary"
											icon={<CheckIcon />}
											onClick={() => void props.onStep(run, "approve", `${props.name} is on it`)}
										>
											Approve plan
										</Button>
									</Show>
									<Show when={run.state === "needs_you" || run.state === "stopped"}>
										<Button
											size="sm"
											onClick={() => void props.onStep(run, "retry", "Trying again")}
										>
											Retry
										</Button>
									</Show>
									<Show when={isOpen(run)}>
										<IconButton
											label="Stop"
											size="sm"
											onClick={() => void props.onStep(run, "stop", "Stopped")}
										>
											<CloseIcon />
										</IconButton>
									</Show>
								</div>
							</div>
						)}
					</For>
				</div>
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
				class="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
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
					placeholder={`Teach ${props.role.name} something: “Always add a screenshot to UI pull requests”`}
					value={text()}
					maxlength={300}
					onInput={(event) => setText(event.currentTarget.value)}
					class="min-w-0 flex-1"
				/>
				<Button type="submit" variant="primary" disabled={busy() || !text().trim()}>
					Teach
				</Button>
			</form>
			<Show when={lessons()} fallback={<Skeleton class="h-24" />}>
				<Show when={proposed().length > 0}>
					<div class="flex flex-col gap-2">
						<Text size="caption" tone="subtle" weight="medium" class="px-1">
							Waiting for your approval
						</Text>
						<div class="surface-card flex flex-col divide-y divide-line">
							<For each={proposed()}>
								{(lesson) => (
									<div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
										<Text class="min-w-0 flex-1">“{lesson.text}”</Text>
										<div class="flex shrink-0 items-center gap-2">
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
												variant="primary"
												icon={<CheckIcon />}
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
									</div>
								)}
							</For>
						</div>
					</div>
				</Show>
				<div class="flex flex-col gap-2">
					<Text size="caption" tone="subtle" weight="medium" class="px-1">
						What {props.role.name} knows
					</Text>
					<Show
						when={kept().length > 0}
						fallback={
							<Text tone="subtle" class="px-1">
								Nothing yet. When you correct {props.role.name} in a thread, it proposes a lesson
								here; or teach it one above.
							</Text>
						}
					>
						<div class="surface-card flex flex-col divide-y divide-line">
							<For each={kept()}>
								{(lesson) => (
									<div class="flex min-h-12 items-center gap-3 px-4 py-2">
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
						</div>
					</Show>
				</div>
			</Show>
		</section>
	);
}

/** How a teammate is set up, in words, with the way to change it. */
function Setup(props: { role: Role; team: readonly Role[]; onEdit: () => void }): JSX.Element {
	const next = () => props.team.find((item) => item.id === props.role.handoffTo)?.name ?? null;
	const rows = (): { label: string; value: string }[] => [
		{
			label: "On the board",
			value: [
				props.role.autoStart ? "Starts cards by itself" : "Waits for Start",
				props.role.planFirst ? "plans first" : "works straight away",
				props.role.parallel === 1 ? "one card at a time" : `${props.role.parallel} cards at once`,
			].join(", "),
		},
		{ label: "When done", value: next() ? `Hands the card to ${next()}` : "Straight to review" },
		{
			label: "Skills",
			value: props.role.skills.length
				? `${props.role.skills.length} of the workspace's skills`
				: "The team's skills only",
		},
		{
			label: "Tools",
			value:
				props.role.connectors === null
					? "Every connector its agent may use"
					: `${props.role.connectors.length} chosen connector${props.role.connectors.length === 1 ? "" : "s"}`,
		},
	];
	return (
		<section aria-label="Setup" class="flex flex-col gap-4">
			<div class="surface-card flex flex-col gap-2 p-4">
				<Text size="caption" tone="subtle" weight="medium">
					How it works
				</Text>
				<Text class="whitespace-pre-wrap">{props.role.brief || "No brief yet."}</Text>
			</div>
			<dl class="surface-card flex flex-col divide-y divide-line">
				<For each={rows()}>
					{(row) => (
						<div class="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
							<dt class="w-32 shrink-0 text-caption text-fg-subtle">{row.label}</dt>
							<dd class="min-w-0 text-body text-fg">{row.value}</dd>
						</div>
					)}
				</For>
			</dl>
			<div>
				<Button icon={<EditIcon />} onClick={props.onEdit}>
					Change setup
				</Button>
			</div>
		</section>
	);
}
