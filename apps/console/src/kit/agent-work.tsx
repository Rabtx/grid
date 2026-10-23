import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { Button, IconButton } from "./button";
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
								tooltip={props.running ? "Steer: send into this turn now" : "Send now"}
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

/** Where a forked thread's own work begins: everything above came from another thread. */
export function ForkDivider(props: { from: string; href?: string }): JSX.Element {
	return (
		<div class="flex items-center gap-3 text-caption text-fg-subtle">
			<span class="h-px flex-1 bg-line" />
			<span class="inline-flex min-w-0 items-center gap-1.5">
				<BranchIcon size="sm" />
				<span class="truncate">
					Forked from{" "}
					<Show when={props.href} fallback={props.from}>
						<a
							class="focus-ring text-fg-muted underline-offset-2 hover:underline"
							href={props.href}
						>
							{props.from}
						</a>
					</Show>
				</span>
			</span>
			<span class="h-px flex-1 bg-line" />
		</div>
	);
}
