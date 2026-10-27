import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { Button, IconButton } from "./button";
import { Badge, type Tone } from "./badge";
import { BranchIcon, CloseIcon, RestoreIcon, SendIcon, SpinnerIcon } from "./icons";

/**
 * The pieces an agent's work adds around a conversation: a question it asks, the messages that
 * wait for it, the subagents it has running, the files a turn changed (with Undo), and where a
 * forked thread begins.
 */

export type QuestionItem = {
	id: string;
	header: string;
	question: string;
	options: { label: string; description?: string }[];
	multiSelect?: boolean;
};

/**
 * The agent asks: each question with its options as toggles (one, or several when it allows),
 * and a line to type an answer of one's own. Answered, it shows what was chosen.
 */
export function QuestionCard(props: {
	questions: QuestionItem[];
	/** undefined while waiting; the answers given, or null when dismissed. */
	answers?: Record<string, string[]> | null;
	onAnswer?: (answers: Record<string, string[]> | null) => void;
}): JSX.Element {
	const [picked, setPicked] = createSignal<Record<string, string[]>>({});
	const [typed, setTyped] = createSignal<Record<string, string>>({});
	const answerOf = (question: QuestionItem) => {
		const own = typed()[question.id]?.trim();
		return [...(picked()[question.id] ?? []), ...(own ? [own] : [])];
	};
	const ready = () => props.questions.every((question) => answerOf(question).length > 0);
	const toggle = (question: QuestionItem, label: string) =>
		setPicked((current) => {
			const now = current[question.id] ?? [];
			const on = now.includes(label);
			const next = question.multiSelect
				? on
					? now.filter((item) => item !== label)
					: [...now, label]
				: on
					? []
					: [label];
			return { ...current, [question.id]: next };
		});
	const waiting = () => props.answers === undefined;
	return (
		<div class="surface-card flex flex-col gap-4 p-3">
			<For each={props.questions}>
				{(question) => (
					<fieldset class="flex min-w-0 flex-col gap-2 border-0 p-0">
						<legend class="mb-1 flex flex-col gap-0.5">
							<span class="text-caption text-fg-subtle">{question.header}</span>
							<span class="text-body-lg text-fg">{question.question}</span>
						</legend>
						<Show
							when={waiting()}
							fallback={
								<span class="text-body text-fg-muted">
									{props.answers === null
										? "Dismissed"
										: (props.answers?.[question.id] ?? []).join(", ") || "No answer"}
								</span>
							}
						>
							<div class="flex flex-wrap gap-1.5">
								<For each={question.options}>
									{(option) => (
										<button
											type="button"
											aria-pressed={
												(picked()[question.id] ?? []).includes(option.label) ? "true" : "false"
											}
											title={option.description}
											onClick={() => toggle(question, option.label)}
											class="focus-ring flex min-h-11 flex-col items-start rounded-kit px-2.5 py-1.5 text-left ring-line-strong transition-colors duration-fast hover:bg-fill aria-pressed:bg-fill-strong aria-pressed:ring-selected md:min-h-0"
										>
											<span class="text-body text-fg">{option.label}</span>
											<Show when={option.description}>
												<span class="text-caption text-fg-subtle">{option.description}</span>
											</Show>
										</button>
									)}
								</For>
							</div>
							<input
								type="text"
								aria-label={`Your own answer to: ${question.question}`}
								placeholder={
									question.options.length ? "Or type your own answer" : "Type your answer"
								}
								value={typed()[question.id] ?? ""}
								onInput={(event) => {
									const value = event.currentTarget.value;
									setTyped((current) => ({ ...current, [question.id]: value }));
								}}
								class="surface-field h-kit-control rounded-kit px-2.5 text-body text-fg placeholder:text-fg-faint"
							/>
						</Show>
					</fieldset>
				)}
			</For>
			<Show when={waiting()}>
				<div class="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
					<Button variant="ghost" size="sm" onClick={() => props.onAnswer?.(null)}>
						Dismiss
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!ready()}
						onClick={() =>
							props.onAnswer?.(
								Object.fromEntries(
									props.questions.map((question) => [question.id, answerOf(question)]),
								),
							)
						}
					>
						Answer
					</Button>
				</div>
			</Show>
		</div>
	);
}

/** A thread's goal as the bar above the composer shows it. */
export type GoalState = {
	objective: string;
	status: "active" | "paused" | "met" | "blocked";
	turns: number;
	maxTurns: number;
};

const GOAL_TONE: Record<GoalState["status"], { tone: Tone; label: string }> = {
	active: { tone: "accent", label: "Goal" },
	paused: { tone: "neutral", label: "Goal paused" },
	met: { tone: "success", label: "Goal met" },
	blocked: { tone: "warning", label: "Goal blocked" },
};

/**
 * The thread's goal over the composer: what done means, how many turns it has taken, and the
 * controls that fit where it stands (pause a running goal, resume a stopped one, clear it).
 */
export function GoalBar(props: {
	goal: GoalState;
	onPause: () => void;
	onResume: () => void;
	onClear: () => void;
}): JSX.Element {
	const look = () => GOAL_TONE[props.goal.status];
	return (
		<div class="flex min-w-0 items-center gap-2 rounded-kit-lg border border-line bg-surface px-3 py-2">
			<Badge tone={look().tone}>{look().label}</Badge>
			<span class="min-w-0 flex-1 truncate text-body text-fg" title={props.goal.objective}>
				{props.goal.objective}
			</span>
			<span class="shrink-0 text-caption text-fg-subtle tabular-nums">
				{props.goal.turns}/{props.goal.maxTurns}
			</span>
			<Show
				when={props.goal.status === "active"}
				fallback={
					<Show when={props.goal.status !== "met"}>
						<Button variant="ghost" size="sm" onClick={() => props.onResume()}>
							Resume
						</Button>
					</Show>
				}
			>
				<Button variant="ghost" size="sm" onClick={() => props.onPause()}>
					Pause
				</Button>
			</Show>
			<IconButton size="xs" label="Clear the goal" onClick={() => props.onClear()}>
				<CloseIcon size="sm" />
			</IconButton>
		</div>
	);
}

/** The thread waits for its usage limit to reset, then carries on: when, and a way to say no. */
export function LimitWaitBar(props: { resetsAt: string; onCancel: () => void }): JSX.Element {
	const when = () =>
		new Date(props.resetsAt).toLocaleString(undefined, {
			weekday: "short",
			hour: "numeric",
			minute: "2-digit",
		});
	return (
		<div class="flex min-w-0 items-center gap-2 rounded-kit-lg border border-line bg-surface px-3 py-2">
			<RestoreIcon size="sm" class="shrink-0 text-fg-subtle" />
			<span class="min-w-0 flex-1 text-body text-fg-muted">
				Usage limit reached. Carries on by itself {when()}.
			</span>
			<Button variant="ghost" size="sm" onClick={() => props.onCancel()}>
				Don't
			</Button>
		</div>
	);
}

export type QueuedItem = { id: string; text: string; files: number };

/**
 * Messages that wait for the agent to finish, in the order they go. Held after a stop or a
 * failure, until the person goes on. Each can be dropped, or sent into the turn now (steer).
 */
export function QueueList(props: {
	items: QueuedItem[];
	paused: boolean;
	/** The agent is working: "Send now" steers rather than starts a turn. */
	running: boolean;
	/** Steering stops the turn and starts the next (an agent that cannot take it mid-turn). */
	steerRestarts?: boolean;
	onRemove: (id: string) => void;
	onSendNow: (id: string) => void;
	onResume: () => void;
	onClear: () => void;
}): JSX.Element {
	return (
		<div class="surface-card flex flex-col p-1">
			<div class="flex items-center gap-2 px-2 py-1.5">
				<span class="min-w-0 flex-1 truncate text-caption text-fg-subtle">
					{props.paused
						? `${props.items.length} waiting · held after the last turn stopped`
						: `${props.items.length} waiting for the agent`}
				</span>
				<Show when={props.paused}>
					<Button variant="primary" size="sm" onClick={() => props.onResume()}>
						Resume
					</Button>
				</Show>
				<Button variant="ghost" size="sm" onClick={() => props.onClear()}>
					Clear
				</Button>
			</div>
			<ol class="flex flex-col">
				<For each={props.items}>
					{(item, index) => (
						<li class="flex min-h-11 items-center gap-2 border-line border-t px-2 md:min-h-9">
							<span class="w-4 shrink-0 text-caption text-fg-subtle tabular-nums">
								{index() + 1}
							</span>
							<span class="min-w-0 flex-1 truncate text-body text-fg" title={item.text}>
								{item.text || "(files only)"}
							</span>
							<Show when={item.files > 0}>
								<span class="shrink-0 text-caption text-fg-subtle">
									{item.files} file{item.files === 1 ? "" : "s"}
								</span>
							</Show>
							<IconButton
								size="xs"
								label={props.running ? "Send into this turn now" : "Send now"}
								tooltip={
									!props.running
										? "Send now"
										: props.steerRestarts
											? "Steer: stop this turn and carry on with this"
											: "Steer: send into this turn now"
								}
								onClick={() => props.onSendNow(item.id)}
							>
								<SendIcon size="sm" />
							</IconButton>
							<IconButton
								size="xs"
								label="Remove from queue"
								onClick={() => props.onRemove(item.id)}
							>
								<CloseIcon size="sm" />
							</IconButton>
						</li>
					)}
				</For>
			</ol>
		</div>
	);
}

/** The subagents at work now, each a chip that takes the reader to its card. */
export function SubagentStrip(props: {
	agents: { id: string; title: string; activity?: string }[];
	onOpen: (id: string) => void;
}): JSX.Element {
	return (
		<ul class="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Subagents working">
			<For each={props.agents}>
				{(agent) => (
					<li class="shrink-0">
						<button
							type="button"
							onClick={() => props.onOpen(agent.id)}
							title={agent.activity ?? agent.title}
							class="focus-ring inline-flex h-8 max-w-64 items-center gap-1.5 rounded-full bg-surface px-2.5 text-caption text-fg-muted ring-line-strong transition-colors duration-fast hover:text-fg pointer-coarse:h-10"
						>
							<SpinnerIcon class="size-3 shrink-0 animate-spin" />
							<span class="truncate">{agent.title}</span>
						</button>
					</li>
				)}
			</For>
		</ul>
	);
}

/**
 * The files a turn changed, at its end: how many, and Undo, which puts them back to how the turn
 * found them (with every later turn's changes). Once undone it says so instead.
 */
export function ChangedFilesRow(props: {
	files: { path: string; added: number; removed: number }[];
	undone?: boolean;
	/** Undo is offered only while the agent is not working. */
	canUndo: boolean;
	onUndo: () => void;
}): JSX.Element {
	const added = () => props.files.reduce((sum, file) => sum + file.added, 0);
	const removed = () => props.files.reduce((sum, file) => sum + file.removed, 0);
	return (
		<div class="flex min-h-9 items-center gap-2 border-line border-y px-1 text-caption text-fg-subtle">
			<span class="min-w-0 flex-1 truncate" title={props.files.map((file) => file.path).join("\n")}>
				{props.undone ? "Undone · " : ""}
				{props.files.length} file{props.files.length === 1 ? "" : "s"} changed in this turn
			</span>
			<span class="shrink-0 tabular-nums">
				<span class="text-success">+{added()}</span> <span class="text-danger">−{removed()}</span>
			</span>
			<Show when={!props.undone}>
				<Button
					variant="ghost"
					size="sm"
					icon={<RestoreIcon size="sm" />}
					disabled={!props.canUndo}
					onClick={() => props.onUndo()}
				>
					Undo
				</Button>
			</Show>
		</div>
	);
}

/** A thread named in a divider: a link to it when it can be opened. */
function ThreadName(props: { title: string; href?: string }): JSX.Element {
	return (
		<Show when={props.href} fallback={props.title}>
			<a class="focus-ring text-fg-muted underline-offset-2 hover:underline" href={props.href}>
				{props.title}
			</a>
		</Show>
	);
}

/**
 * Where a forked thread's own work begins: everything above came from another thread.
 * `action` offers what can be done with the fork from here (bring its work back).
 */
export function ForkDivider(props: {
	from: string;
	href?: string;
	action?: JSX.Element;
}): JSX.Element {
	return (
		<div class="flex flex-col items-center gap-1.5">
			<div class="flex w-full items-center gap-3 text-caption text-fg-subtle">
				<span class="h-px flex-1 bg-line" />
				<span class="inline-flex min-w-0 items-center gap-1.5">
					<BranchIcon size="sm" />
					<span class="truncate">
						Forked from <ThreadName title={props.from} href={props.href} />
					</span>
				</span>
				<span class="h-px flex-1 bg-line" />
			</div>
			{props.action}
		</div>
	);
}

/** Where a fork's work was brought back into the thread it came from. */
export function MergedDivider(props: { into: string; href?: string; turns: number }): JSX.Element {
	return (
		<div class="flex items-center gap-3 text-caption text-fg-subtle">
			<span class="h-px flex-1 bg-line" />
			<span class="inline-flex min-w-0 items-center gap-1.5">
				<BranchIcon size="sm" />
				<span class="truncate">
					{props.turns === 1 ? "1 turn" : `${props.turns} turns`} brought back into{" "}
					<ThreadName title={props.into} href={props.href} />
				</span>
			</span>
			<span class="h-px flex-1 bg-line" />
		</div>
	);
}

/**
 * Where a thread moved from one agent to another; `back` when it went back to one it was with,
 * which carries on its own conversation.
 */
export function HandoffDivider(props: {
	from: JSX.Element;
	to: JSX.Element;
	back?: boolean;
}): JSX.Element {
	return (
		<div class="flex items-center gap-3 text-caption text-fg-subtle">
			<span class="h-px flex-1 bg-line" />
			<span class="inline-flex min-w-0 items-center gap-1.5">
				<span class="truncate">{props.back ? "Handed back from" : "Handed off from"}</span>
				{props.from}
				<span>to</span>
				{props.to}
			</span>
			<span class="h-px flex-1 bg-line" />
		</div>
	);
}

export type CrewMember = {
	id: string;
	key: string;
	title: string;
	state: "queued" | "working" | "done" | "failed" | "stopped" | "needs_you";
	running: boolean;
	waiting: boolean;
	href?: string;
};

const MEMBER_STATE: Record<CrewMember["state"], { tone: Tone; label: string }> = {
	queued: { tone: "neutral", label: "Queued" },
	working: { tone: "accent", label: "Working" },
	done: { tone: "success", label: "Done" },
	failed: { tone: "danger", label: "Failed" },
	stopped: { tone: "neutral", label: "Stopped" },
	needs_you: { tone: "warning", label: "Waiting on you" },
};

/**
 * A crew, over its coordinator's composer: its members and where each stands (needing the person
 * first), with Retry and Stop; members' approvals, answered here or in their own thread; and the
 * crew's pause and settings. Folds to its summary line.
 */
export function CrewPanel(props: {
	name: string;
	members: CrewMember[];
	parallel: number;
	paused: boolean;
	/** Members' approvals, drawn by the screen. */
	approvals?: JSX.Element;
	onRetry: (id: string) => void;
	onStop: (id: string) => void;
	onPause: (paused: boolean) => void;
	onSettings: () => void;
}): JSX.Element {
	const order: CrewMember["state"][] = [
		"needs_you",
		"working",
		"queued",
		"failed",
		"stopped",
		"done",
	];
	const sorted = () =>
		[...props.members].sort(
			(a, b) =>
				Number(b.waiting) - Number(a.waiting) || order.indexOf(a.state) - order.indexOf(b.state),
		);
	const working = () => props.members.filter((member) => member.state === "working").length;
	const attention = () =>
		props.members.filter((member) => member.waiting || member.state === "needs_you").length;
	return (
		<details
			class="surface-card group/crew flex flex-col"
			open={attention() > 0 ? true : undefined}
		>
			<summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 md:min-h-9 [&::-webkit-details-marker]:hidden">
				<span class="min-w-0 flex-1 truncate text-body text-fg">
					{props.name}
					<span class="text-fg-subtle">
						{" · "}
						{props.members.length
							? `${working()} of ${props.parallel} working · ${props.members.length} member${props.members.length === 1 ? "" : "s"}`
							: "no members yet"}
					</span>
				</span>
				<Show when={attention() > 0}>
					<Badge tone="warning" dot>
						{attention()} need{attention() === 1 ? "s" : ""} you
					</Badge>
				</Show>
				<Show when={props.paused}>
					<Badge tone="neutral">Paused</Badge>
				</Show>
			</summary>
			<div class="flex flex-col border-line border-t">
				<Show when={props.approvals}>
					<div class="flex flex-col gap-2 p-2">{props.approvals}</div>
				</Show>
				<ol class="flex flex-col">
					<For each={sorted()}>
						{(member) => {
							const look = () =>
								member.waiting
									? { tone: "warning" as Tone, label: "Needs approval" }
									: MEMBER_STATE[member.state];
							return (
								<li class="flex min-h-11 items-center gap-2 border-line border-b px-3 last:border-b-0 md:min-h-9">
									<Show when={member.running} fallback={<span class="size-3 shrink-0" />}>
										<SpinnerIcon class="size-3 shrink-0 animate-spin text-fg-subtle" />
									</Show>
									<span class="min-w-0 flex-1 truncate text-body text-fg" title={member.key}>
										<Show when={member.href} fallback={member.title}>
											<a class="focus-ring underline-offset-2 hover:underline" href={member.href}>
												{member.title}
											</a>
										</Show>
									</span>
									<Badge tone={look().tone}>{look().label}</Badge>
									<Show when={["needs_you", "failed", "stopped"].includes(member.state)}>
										<Button variant="ghost" size="sm" onClick={() => props.onRetry(member.id)}>
											Retry
										</Button>
									</Show>
									<Show when={member.state === "working" || member.state === "queued"}>
										<Button variant="ghost" size="sm" onClick={() => props.onStop(member.id)}>
											Stop
										</Button>
									</Show>
								</li>
							);
						}}
					</For>
				</ol>
				<div class="flex items-center justify-end gap-1 border-line border-t px-2 py-1">
					<Button variant="ghost" size="sm" onClick={() => props.onPause(!props.paused)}>
						{props.paused ? "Resume crew" : "Pause crew"}
					</Button>
					<Button variant="ghost" size="sm" onClick={() => props.onSettings()}>
						Crew settings
					</Button>
				</div>
			</div>
		</details>
	);
}
