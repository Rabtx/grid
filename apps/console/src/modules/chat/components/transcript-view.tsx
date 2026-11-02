import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import {
	AgentHeader,
	AgentLogo,
	AgentMessage,
	BotIcon,
	BrainIcon,
	BranchIcon,
	Button,
	ButtonLink,
	ChangedFilesRow,
	CheckIcon,
	CodeChip,
	CopyIcon,
	DecisionCard,
	DiffCard,
	DiffStat,
	EditIcon,
	EyeIcon,
	ForkDivider,
	GlobeIcon,
	HandoffDivider,
	IconButton,
	iconButton,
	InlineNotice,
	InlineVisual,
	LinkButton,
	LiveActivityRow,
	Menu,
	MergedDivider,
	NoteAddIcon,
	PlanList,
	type PopoverControl,
	Prose,
	QuestionCard,
	RestoreIcon,
	RunFailedCard,
	SearchIcon,
	Skeleton,
	TerminalIcon,
	ThinkingLoader,
	ToolIcon,
	TurnFold,
	TurnHeader,
	UserMessage,
	type VisualBlock,
	VisualFrame,
	WorkGroupHeader,
	WorkLogChevron,
	WorkLogDetails,
	WorkLogFailedMark,
	WorkLogIcon,
	WorkLogList,
	WorkLogOutput,
	WorkLogRow,
} from "@/kit";
import { splitReply, type Visual } from "@grid/visuals";

import { workspaceHref } from "@/lib/active-workspace";
import { relativeTime } from "@/modules/projects/lib/relative-time";
import { useTerminalAccess } from "@/modules/workspaces";

import { diffRows } from "../lib/diff";
import { copyCodeFrom, renderMarkdown, threadLinkFrom } from "../lib/markdown";
import {
	type BackgroundItem,
	type Block,
	formatDuration,
	groupTurns,
	messageSource,
	type Row as TranscriptRow,
	type Turn,
	turnPhase,
	turnSummary,
	turnTiming,
} from "../lib/transcript";
import type { ChatAttachment, FileDiff } from "../types/chat.types";
import {
	liveWorkLabel,
	summarizeWork,
	thoughtLine,
	type WorkAction,
	workAction,
	workKind,
	workLabel,
} from "../lib/work-log";
import { MessageAttachments, type LoadAttachment } from "./message-attachments";

type ToolBlock = Extract<Block, { kind: "tool" }>;

/** Each kind of work by its icon, as T3 Code's work log draws it. */
const WORK_ICONS: Record<WorkAction | "mixed", () => JSX.Element> = {
	read: () => <EyeIcon />,
	edit: () => <EditIcon />,
	command: () => <TerminalIcon />,
	"code-search": () => <SearchIcon />,
	web: () => <GlobeIcon />,
	thought: () => <BrainIcon />,
	other: () => <ToolIcon />,
	mixed: () => <ToolIcon />,
};

/** The turn's last reply, which the minimap previews under the message. */
function finalReply(turn: Turn): string | undefined {
	for (let index = turn.rows.length - 1; index >= 0; index -= 1) {
		const row = turn.rows[index];
		if (row?.kind === "block" && row.block.kind === "assistant") return row.block.text;
	}
	return undefined;
}

/** What Regenerate sends again: the message's text and the ids of the files it came with. */
export type UserPrompt = { text: string; attachments: string[] };

function findPrecedingUserPrompt(blocks: Block[], target: Block): UserPrompt | null {
	let index = blocks.indexOf(target);
	if (index === -1) index = blocks.findIndex((b) => b.key === target.key);
	if (index === -1) return null;
	for (let i = index - 1; i >= 0; i--) {
		const b = blocks[i];
		if (b && b.kind === "user") {
			const attachments = (b.attachments ?? []).map((item) => item.id);
			return b.text || attachments.length ? { text: b.text, attachments } : null;
		}
	}
	return null;
}

/** Now, ticking each second while `active`: for a turn's running clock. */
function useNow(active: () => boolean): () => number {
	const [now, setNow] = createSignal(Date.now());
	createEffect(active, (on) => {
		if (!on) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	});
	return now;
}

/** Who works this thread and who asks: for the agent's line and the message's sender. */
export type ThreadPeople = {
	agentId: string;
	agentName: string;
	model?: string;
	you: string;
};

/**
 * The conversation, turn by turn: what you asked on the right, the agent's line, its steps as one
 * card with the change that matters most under it, and its reply.
 */
export function TranscriptView(props: {
	loadAttachment?: LoadAttachment;
	people?: ThreadPeople;
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: UserPrompt) => void;
	/** Save a message to the project's notes; no action is shown without it. */
	onNote?: (text: string) => void;
	/** Undo a turn's changes (its checkpoint's turn number); no action is shown without it. */
	onUndo?: (turn: number) => void;
	/** Fork the thread from a message (its id), here or in a new worktree. */
	onFork?: (at: string, worktree: boolean) => void;
	/** Send a visual's choice as the next message. */
	onChoose?: (message: string) => void;
	/** Where the thread a fork came from opens. */
	forkedHref?: (id: string) => string | undefined;
	/** An agent's name as people know it, for a handoff's line. */
	agentName?: (id: string) => string;
	/** Bring this fork's work back into the thread it came from; offered on the fork's divider. */
	onMergeBack?: () => void;
	/** Open a thread an agent linked to (`grid-thread://`); without it the link loads the page. */
	onOpenThread?: (id: string) => void;
}): JSX.Element {
	const turns = createMemo(() => groupTurns(props.blocks));

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the code cards' own buttons and thread links
		<div
			class="flex flex-col gap-10"
			onClick={(event) => {
				copyCodeFrom(event);
				const thread = threadLinkFrom(event);
				if (thread) props.onOpenThread?.(thread);
			}}
		>
			{/* keyed={false}: turns only ever append or update in place, so each keeps its DOM (and an open <details>). */}
			<For each={turns()} keyed={false}>
				{(turn, index) => (
					<TurnView
						turn={turn()}
						people={props.people}
						loadAttachment={props.loadAttachment}
						live={props.running && index === turns().length - 1}
						blocks={props.blocks}
						running={props.running}
						onApprove={props.onApprove}
						onRegenerate={props.onRegenerate}
						onNote={props.onNote}
						extras={props}
					/>
				)}
			</For>
		</div>
	);
}

/** What the newer blocks need from the conversation: Undo, Fork, a visual's choices. */
type Extras = {
	onUndo?: (turn: number) => void;
	onFork?: (at: string, worktree: boolean) => void;
	onChoose?: (message: string) => void;
	forkedHref?: (id: string) => string | undefined;
	agentName?: (id: string) => string;
	onMergeBack?: () => void;
};

function TurnView(props: {
	loadAttachment?: LoadAttachment;
	people?: ThreadPeople;
	turn: Turn;
	/** The agent is working on this turn now. */
	live: boolean;
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: UserPrompt) => void;
	onNote?: (text: string) => void;
	extras: Extras;
}): JSX.Element {
	const now = useNow(() => props.live);
	// A settled turn can be forked from; one still going, or a message from an older log, cannot.
	const forkable = () => {
		const user = props.turn.user;
		return user?.id && user.outcome && props.extras.onFork ? user.id : null;
	};
	const timing = () => turnTiming(props.turn.user, props.live, now());
	// How long a live turn has been going, beside what it is doing.
	const elapsed = () => {
		const started = props.turn.user?.startedAt ? Date.parse(props.turn.user.startedAt) : null;
		return started ? formatDuration(now() - started) : null;
	};
	const summary = () => turnSummary(props.turn);
	const ended = () =>
		props.live
			? undefined
			: props.turn.user?.outcome === "cancelled"
				? ("stopped" as const)
				: props.turn.user?.outcome === "error"
					? ("failed" as const)
					: undefined;
	// A finished turn folds its work away under one line, as T3 Code's timeline does: what stays
	// open is the reply and what the person must see (visuals, plans, changes, notices, steers,
	// dividers). The work opens again from the fold.
	const [unfolded, setUnfolded] = createSignal(false);
	const reply = createMemo(() => {
		for (let index = props.turn.rows.length - 1; index >= 0; index -= 1) {
			const row = props.turn.rows[index];
			if (row?.kind === "block" && row.block.kind === "assistant") return index;
		}
		return -1;
	});
	const keeps = (row: TranscriptRow) => row.kind === "block" && STAYS_OPEN.has(row.block.kind);
	const foldable = createMemo(
		() => !props.live && props.turn.rows.some((row, index) => index !== reply() && !keeps(row)),
	);
	const shown = (row: TranscriptRow, index: number) =>
		!foldable() || unfolded() || index === reply() || keeps(row);
	// Every turn the agent answered gets a header: its time (or how it ended) and what it did.
	const header = () => {
		if (!props.live && !props.turn.rows.length) return null;
		const time = timing();
		const what = summary();
		if (time) return { time, summary: what };
		return what ? { time: what, summary: "" } : null;
	};

	return (
		<section
			class="flex flex-col gap-3"
			data-minimap-mark={props.turn.user ? "" : undefined}
			data-minimap-prompt={props.turn.user?.text}
			data-minimap-reply={finalReply(props.turn)}
		>
			<Show when={props.turn.user}>
				{(user) => (
					<UserMessageView
						text={user().text}
						meta={
							props.people || messageSource(user())
								? [
										messageSource(user()) ?? props.people?.you,
										user().startedAt ? relativeTime(user().startedAt ?? "") : null,
									]
										.filter(Boolean)
										.join(" · ")
								: undefined
						}
						attachments={user().attachments}
						loadAttachment={props.loadAttachment}
						onNote={props.onNote}
						onFork={
							forkable()
								? (worktree) => {
										const at = forkable();
										if (at) props.extras.onFork?.(at, worktree);
									}
								: undefined
						}
					/>
				)}
			</Show>
			<Show when={header()}>
				{(line) => (
					<Show
						when={foldable()}
						fallback={
							<TurnHeader summary={line().summary} ended={ended()}>
								<Show when={props.live} fallback={line().time}>
									<ThinkingLoader
										phase={turnPhase(props.turn.rows)}
										elapsed={elapsed() ?? undefined}
									/>
								</Show>
							</TurnHeader>
						}
					>
						<TurnFold
							label={line().time}
							summary={line().summary}
							ended={ended()}
							time={props.turn.user?.endedAt ? relativeTime(props.turn.user.endedAt) : undefined}
							expanded={unfolded()}
							onToggle={() => setUnfolded((now) => !now)}
						/>
					</Show>
				)}
			</Show>
			<Show when={props.people && props.turn.rows.length > 0 ? props.people : null}>
				{(people) => (
					<div class="pt-3">
						<AgentHeader
							logo={<AgentLogo id={people().agentId} name={people().agentName} />}
							name={people().agentName}
							model={people().model}
							time={
								props.turn.user?.endedAt
									? relativeTime(props.turn.user.endedAt)
									: props.live
										? "now"
										: undefined
							}
						/>
					</div>
				)}
			</Show>
			<For each={props.turn.rows} keyed={false}>
				{(row, index) => (
					<Show when={shown(row(), index)}>
						<Switch>
							<Match
								when={row().kind === "work" && (row() as Extract<TranscriptRow, { kind: "work" }>)}
							>
								{(work) => <WorkGroup tools={work().tools} live={props.live} />}
							</Match>
							<Match
								when={
									row().kind === "background" &&
									(row() as Extract<TranscriptRow, { kind: "background" }>)
								}
							>
								{(background) => <BackgroundWork items={background().items} live={props.live} />}
							</Match>
							<Match
								when={
									row().kind === "block" &&
									(row() as Extract<TranscriptRow, { kind: "block" }>).block
								}
							>
								{(block) => (
									<BlockView
										block={block()}
										people={props.people}
										blocks={props.blocks}
										running={props.running}
										live={props.live}
										onApprove={props.onApprove}
										onRegenerate={props.onRegenerate}
										onNote={props.onNote}
										extras={props.extras}
									/>
								)}
							</Match>
						</Switch>
					</Show>
				)}
			</For>
		</section>
	);
}

function BlockView(props: {
	block: Block;
	people?: ThreadPeople;
	blocks: Block[];
	running: boolean;
	live: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: UserPrompt) => void;
	onNote?: (text: string) => void;
	extras: Extras;
}): JSX.Element {
	const userPrompt = createMemo(() => {
		const block = props.block;
		if (block.kind !== "assistant" && block.kind !== "notice") return null;
		return findPrecedingUserPrompt(props.blocks, block);
	});

	/**
	 * A failed turn offered its way out: the message again, once the agent has stopped. Only the
	 * chat's last word gets it; an older failure has been moved past.
	 */
	const retry = createMemo(() => {
		const block = props.block;
		if (block.kind !== "notice" || !block.retry || !props.onRegenerate) return null;
		if (props.blocks.at(-1)?.key !== block.key) return null;
		return userPrompt();
	});

	return (
		<Switch>
			<Match when={props.block.kind === "user" && props.block}>
				{(block) => (
					<UserMessageView
						text={(block() as Extract<Block, { kind: "user" }>).text}
						onNote={props.onNote}
					/>
				)}
			</Match>
			<Match when={props.block.kind === "assistant" && props.block}>
				{(block) => (
					<AssistantMessage
						text={(block() as Extract<Block, { kind: "assistant" }>).text}
						running={props.running}
						onNote={props.onNote}
						onChoose={props.extras.onChoose}
						canRegenerate={Boolean(userPrompt())}
						onRegenerate={() => {
							const prompt = userPrompt();
							if (prompt) props.onRegenerate?.(prompt);
						}}
					/>
				)}
			</Match>
			<Match when={props.block.kind === "reasoning" && props.block}>
				{(block) => (
					<ThoughtRow
						text={(block() as Extract<Block, { kind: "reasoning" }>).text}
						live={props.live && props.blocks.at(-1)?.key === block().key}
					/>
				)}
			</Match>
			<Match
				when={
					props.block.kind === "approval" && (props.block as Extract<Block, { kind: "approval" }>)
				}
			>
				{(approval) => (
					// A waiting approval is docked over the composer (Conversation); answered ones stay
					// here as part of the record.
					<Show when={approval().resolved !== undefined}>
						<ApprovalCard approval={approval()} onApprove={props.onApprove} />
					</Show>
				)}
			</Match>
			<Match
				when={props.block.kind === "plan" && (props.block as Extract<Block, { kind: "plan" }>)}
			>
				{(plan) => <PlanList entries={plan().entries} />}
			</Match>
			<Match
				when={props.block.kind === "steer" && (props.block as Extract<Block, { kind: "steer" }>)}
			>
				{(steer) => (
					<UserMessage
						meta="Sent into this turn"
						actions={<CopyButton text={steer().text} label="Copy message" />}
					>
						{steer().text}
					</UserMessage>
				)}
			</Match>
			<Match
				when={
					props.block.kind === "question" && (props.block as Extract<Block, { kind: "question" }>)
				}
			>
				{(question) => (
					// A waiting question is docked over the composer; answered ones stay as the record.
					<Show when={question().answers !== undefined}>
						<QuestionCard questions={question().questions} answers={question().answers} />
					</Show>
				)}
			</Match>
			<Match
				when={props.block.kind === "visual" && (props.block as Extract<Block, { kind: "visual" }>)}
			>
				{(visual) => (
					<Show
						when={visual().format === "html"}
						fallback={
							<InlineVisual
								title={visual().title}
								blocks={(visual().blocks ?? []) as VisualBlock[]}
								onChoose={props.extras.onChoose}
								markdown={(text) => <Prose html={renderMarkdown(text)} />}
							/>
						}
					>
						<VisualFrame
							title={visual().title}
							html={visual().html ?? ""}
							height={visual().height ?? 360}
						/>
					</Show>
				)}
			</Match>
			<Match
				when={
					props.block.kind === "checkpoint" &&
					(props.block as Extract<Block, { kind: "checkpoint" }>)
				}
			>
				{(checkpoint) => (
					<Show when={props.extras.onUndo}>
						<ChangedFilesRow
							files={checkpoint().files}
							undone={checkpoint().undone}
							canUndo={!props.running}
							onUndo={() => props.extras.onUndo?.(checkpoint().turn)}
						/>
					</Show>
				)}
			</Match>
			<Match
				when={
					props.block.kind === "handoff" && (props.block as Extract<Block, { kind: "handoff" }>)
				}
			>
				{(moved) => {
					const agent = (id: string) => (
						<span class="inline-flex items-center gap-1 text-fg-muted">
							<AgentLogo id={id} name={props.extras.agentName?.(id) ?? id} />
							{props.extras.agentName?.(id) ?? id}
						</span>
					);
					return (
						<HandoffDivider
							from={agent(moved().from.provider)}
							to={agent(moved().to.provider)}
							back={moved().resumes === true}
						/>
					);
				}}
			</Match>
			<Match
				when={props.block.kind === "forked" && (props.block as Extract<Block, { kind: "forked" }>)}
			>
				{(forked) => (
					<ForkDivider
						from={forked().from.title}
						href={props.extras.forkedHref?.(forked().from.id)}
						action={
							<Show when={props.extras.onMergeBack}>
								{(merge) => (
									<Button
										variant="ghost"
										size="sm"
										icon={<BranchIcon size="sm" />}
										onClick={() => merge()()}
									>
										Bring this fork's work back
									</Button>
								)}
							</Show>
						}
					/>
				)}
			</Match>
			<Match
				when={props.block.kind === "merged" && (props.block as Extract<Block, { kind: "merged" }>)}
			>
				{(merged) => (
					<MergedDivider
						into={merged().into.title}
						href={props.extras.forkedHref?.(merged().into.id)}
						turns={merged().turns}
					/>
				)}
			</Match>
			<Match
				when={props.block.kind === "notice" && (props.block as Extract<Block, { kind: "notice" }>)}
			>
				{(notice) => (
					<Show
						when={notice().tone === "error"}
						fallback={<InlineNotice tone="info">{notice().text}</InlineNotice>}
					>
						<RunFailed
							text={notice().text}
							agent={props.people?.agentName}
							running={props.running}
							onRetry={
								retry()
									? () => {
											const prompt = retry();
											if (prompt) props.onRegenerate?.(prompt);
										}
									: undefined
							}
						/>
					</Show>
				)}
			</Match>
		</Switch>
	);
}

const EXCERPT_LINES = 10;

/**
 * A turn that stopped on an error: its first line as what happened, the rest as the error's own
 * lines (the first ten, all of them on asking), and the ways on — the message again, a terminal.
 */
function RunFailed(props: {
	text: string;
	agent?: string;
	running: boolean;
	onRetry?: () => void;
}): JSX.Element {
	const [all, setAll] = createSignal(false);
	const terminals = useTerminalAccess();
	const lines = () => props.text.trim().split("\n");
	const rest = () => lines().slice(1);
	return (
		<RunFailedCard
			title={`${props.agent ?? "The agent"} stopped`}
			summary={lines()[0] ?? "The run stopped."}
			excerpt={
				rest().length ? (all() ? rest() : rest().slice(0, EXCERPT_LINES)).join("\n") : undefined
			}
			actions={
				<>
					<Show when={props.onRetry}>
						<Button
							size="sm"
							variant="primary"
							disabled={props.running}
							onClick={() => props.onRetry?.()}
						>
							Try again
						</Button>
					</Show>
					<Show when={terminals()}>
						<ButtonLink size="sm" href={workspaceHref("/terminal")}>
							Open terminal
						</ButtonLink>
					</Show>
					<Show when={rest().length > EXCERPT_LINES}>
						<LinkButton onClick={() => setAll((open) => !open)}>
							{all() ? "Show less" : "View full log"}
						</LinkButton>
					</Show>
				</>
			}
		/>
	);
}

/** A message's copy button, confirming on itself. */
function CopyButton(props: { text: string; label: string }): JSX.Element {
	const [copied, setCopied] = createSignal(false);
	return (
		<IconButton
			size="xs"
			label={props.label}
			tooltip={copied() ? "Copied" : "Copy"}
			onClick={() =>
				void navigator.clipboard?.writeText(props.text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				})
			}
		>
			<Show when={copied()} fallback={<CopyIcon size="sm" />}>
				<CheckIcon size="sm" class="text-success" />
			</Show>
		</IconButton>
	);
}

/** The long-press menu on touch screens: the same actions as the hover bar. */
function TouchMenu(props: {
	label: string;
	items: { id: string; label: string; disabled?: boolean }[];
	onSelect: (id: string) => void;
	control: (control: PopoverControl) => void;
}): JSX.Element {
	return (
		<Menu
			label={props.label}
			trigger={<span />}
			triggerClass="hidden"
			groups={[{ items: props.items }]}
			control={props.control}
			onSelect={props.onSelect}
		/>
	);
}

/** What you sent: a right-aligned bubble, clamped to four lines until opened, with copy & note actions. */
function UserMessageView(props: {
	text: string;
	meta?: string;
	attachments?: ChatAttachment[];
	loadAttachment?: LoadAttachment;
	onNote?: (text: string) => void;
	/** Fork the thread from the end of this message's turn; in a new worktree when asked. */
	onFork?: (worktree: boolean) => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	const long = () => props.text.split("\n").length > 4 || props.text.length > 400;
	return (
		<>
			<TouchMenu
				label="Message actions"
				items={[
					{ id: "copy", label: "Copy message" },
					...(props.onNote ? [{ id: "note", label: "Add as note" }] : []),
					...(props.onFork
						? [
								{ id: "fork", label: "Fork from here" },
								{ id: "fork-worktree", label: "Fork into a new worktree" },
							]
						: []),
				]}
				control={(control) => {
					menu = control;
				}}
				onSelect={(id) => {
					if (id === "note") props.onNote?.(props.text);
					else if (id === "fork") props.onFork?.(false);
					else if (id === "fork-worktree") props.onFork?.(true);
					else void navigator.clipboard?.writeText(props.text);
				}}
			/>
			<UserMessage
				meta={props.meta}
				attachmentContent={
					<Show when={props.attachments?.length}>
						<MessageAttachments attachments={props.attachments ?? []} load={props.loadAttachment} />
					</Show>
				}
				clamp={long()}
				onMenuAt={(point) => menu?.open(point)}
				actions={
					<>
						<CopyButton text={props.text} label="Copy message" />
						<NoteButton text={props.text} onNote={props.onNote} />
						<Show when={props.onFork}>
							{(fork) => (
								<Menu
									label="Fork from here"
									title="Fork from here"
									placement="top-end"
									triggerClass={iconButton({ size: "xs" })}
									trigger={<BranchIcon size="sm" />}
									groups={[
										{
											items: [
												{ id: "here", label: "Fork in this folder" },
												{ id: "worktree", label: "Fork into a new worktree" },
											],
										},
									]}
									onSelect={(id) => fork()(id === "worktree")}
								/>
							)}
						</Show>
					</>
				}
			>
				{props.text}
			</UserMessage>
		</>
	);
}

/** The "Add as note" button in a message's hover bar. */
function NoteButton(props: { onNote?: (text: string) => void; text: string }): JSX.Element {
	return (
		<Show when={props.onNote}>
			{(save) => (
				<IconButton size="xs" label="Add as note" onClick={() => save()(props.text)}>
					<NoteAddIcon size="sm" />
				</IconButton>
			)}
		</Show>
	);
}

/**
 * The agent's response: Markdown with its actions (copy, note, regenerate) under it on hover; on
 * touch a long press opens them instead, so nothing is drawn at rest.
 */
function AssistantMessage(props: {
	text: string;
	running?: boolean;
	canRegenerate?: boolean;
	onRegenerate?: () => void;
	onNote?: (text: string) => void;
	/** Send a visual's choice as the next message. */
	onChoose?: (message: string) => void;
}): JSX.Element {
	let menu: PopoverControl | undefined;
	return (
		<>
			<TouchMenu
				label="Response actions"
				items={[
					{ id: "copy", label: "Copy response" },
					...(props.onNote ? [{ id: "note", label: "Add as note" }] : []),
					...(props.canRegenerate
						? [{ id: "regenerate", label: "Regenerate", disabled: props.running }]
						: []),
				]}
				control={(control) => {
					menu = control;
				}}
				onSelect={(id) => {
					if (id === "copy") void navigator.clipboard?.writeText(props.text);
					else if (id === "note") props.onNote?.(props.text);
					else props.onRegenerate?.();
				}}
			/>
			<AgentMessage
				onMenuAt={(point) => menu?.open(point)}
				actions={
					<>
						<CopyButton text={props.text} label="Copy response" />
						<NoteButton text={props.text} onNote={props.onNote} />
						<Show when={props.canRegenerate}>
							<IconButton
								size="xs"
								label="Regenerate response"
								tooltip={props.running ? "Cannot regenerate while running" : undefined}
								disabled={props.running}
								onClick={() => props.onRegenerate?.()}
							>
								<RestoreIcon size="sm" />
							</IconButton>
						</Show>
					</>
				}
			>
				<ReplyBody text={props.text} onChoose={props.onChoose} />
			</AgentMessage>
		</>
	);
}

/**
 * A reply's text with its ```grid-visual fences drawn as visuals, where they stand in the text:
 * the way any agent, with Grid's tools or without, answers with charts, tables and cards. A fence
 * still streaming in shows a placeholder; one that does not check out shows as code, with why.
 */
/** A visual's page when it is one self-contained HTML document, or null. */
function pageOf(visual: Visual): Extract<Visual, { format: "html" }> | null {
	return visual.format === "html" ? visual : null;
}

/** A visual's blocks when it is drawn from components. */
function blocksOf(visual: Visual): VisualBlock[] {
	return visual.format === "components" ? (visual.blocks as VisualBlock[]) : [];
}

function ReplyBody(props: { text: string; onChoose?: (message: string) => void }): JSX.Element {
	const parts = createMemo(() => splitReply(props.text));
	return (
		<Show
			when={parts().length > 1 || parts()[0]?.kind !== "text"}
			fallback={<Prose html={renderMarkdown(props.text)} />}
		>
			<div class="flex flex-col gap-4">
				<For each={parts()}>
					{(part) => (
						<Switch>
							<Match when={part.kind === "text" && part}>
								{(text) => <Prose html={renderMarkdown(text().text)} />}
							</Match>
							<Match when={part.kind === "visual" && part.visual}>
								{(visual) => (
									<Show
										when={pageOf(visual())}
										fallback={
											<InlineVisual
												title={visual().title}
												blocks={blocksOf(visual())}
												onChoose={props.onChoose}
												markdown={(text) => <Prose html={renderMarkdown(text)} />}
											/>
										}
									>
										{(page) => (
											<VisualFrame title={page().title} html={page().html} height={page().height} />
										)}
									</Show>
								)}
							</Match>
							<Match when={part.kind === "pending"}>
								<div class="flex flex-col gap-2" aria-label="Drawing a visual">
									<Skeleton class="h-4 w-1/3" />
									<Skeleton class="h-24 w-full" />
								</div>
							</Match>
							<Match when={part.kind === "invalid" && part}>
								{(invalid) => (
									<div class="flex flex-col gap-1.5">
										<p class="text-caption text-fg-subtle">
											Could not draw this visual: {invalid().error}
										</p>
										<Prose html={renderMarkdown(`\`\`\`json\n${invalid().source}\n\`\`\``)} />
									</div>
								)}
							</Match>
						</Switch>
					)}
				</For>
			</div>
		</Show>
	);
}

/** A file's change, highlighted: the diff rows of the chat model drawn by the kit's DiffCard. */
export function FileChange(props: { diff: FileDiff }): JSX.Element {
	const lines = createMemo(() => diffRows(props.diff));
	return (
		<DiffCard
			path={props.diff.path}
			added={props.diff.added}
			removed={props.diff.removed}
			numbered={!props.diff.snippet}
			lines={lines()}
		/>
	);
}

/**
 * What a folded turn keeps open beside its reply: what the person must see without asking, and
 * the decisions they made (answered approvals and questions).
 */
const STAYS_OPEN: ReadonlySet<Block["kind"]> = new Set([
	"approval",
	"question",
	"visual",
	"plan",
	"checkpoint",
	"notice",
	"steer",
	"forked",
	"merged",
	"handoff",
]);

const running = (tool: ToolBlock) => tool.status === "running" || tool.status === "pending";

/**
 * A run of tool calls as the work log draws it (after T3 Code): one summary line ("Read 3 files
 * and ran 2 commands") that opens to a line per call. While the turn works, the call under way
 * takes the summary's place, shining ("Running bun test"). A lone call is just its own line.
 */
function WorkGroup(props: { tools: ToolBlock[]; live: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	// A stopped or failed turn leaves its last tools "running" in the log: only a live turn shines.
	const current = () => (props.live ? props.tools.findLast(running) : undefined);
	const summary = () => summarizeWork(props.tools);
	return (
		<Show
			when={props.tools.length > 1}
			fallback={
				<Show when={props.tools[0]}>
					{(tool) => (
						<WorkLogList>
							<WorkEntry tool={tool()} live={props.live} />
						</WorkLogList>
					)}
				</Show>
			}
		>
			<section aria-label="Activity" class="flex min-w-0 flex-col">
				<Show
					when={!open() && current()}
					fallback={
						<WorkGroupHeader
							icon={WORK_ICONS[workKind(props.tools)]()}
							label={summary().summary}
							failed={summary().failed}
							expanded={open()}
							onToggle={() => setOpen((now) => !now)}
						/>
					}
				>
					{(tool) => (
						<LiveActivityRow
							icon={WORK_ICONS[workAction(tool())]()}
							label={liveWorkLabel(tool())}
							expanded={false}
							onToggle={() => setOpen(true)}
						/>
					)}
				</Show>
				<Show when={open()}>
					<WorkLogList>
						<For each={props.tools} keyed={false}>
							{(tool) => <WorkEntry tool={tool()} live={props.live} />}
						</For>
					</WorkLogList>
				</Show>
			</section>
		</Show>
	);
}

/** Lines a call added and removed, across the files it changed. */
function changedLines(tool: ToolBlock): { added: number; removed: number } | null {
	const diffs = tool.diffs;
	if (!diffs?.length) return null;
	return {
		added: diffs.reduce((sum, diff) => sum + diff.added, 0),
		removed: diffs.reduce((sum, diff) => sum + diff.removed, 0),
	};
}

/**
 * One call as a line: its icon, what it did ("Edited app.ts"), the lines it changed, and a
 * chevron that opens it to its diff, input and output. A failed call fades its icon to red and
 * ends with a cross; one its turn stopped says so.
 */
function WorkEntry(props: { tool: ToolBlock; live: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const live = () => props.live && running(props.tool);
	const failed = () => props.tool.status === "failed";
	const stopped = () => Boolean(props.tool.interrupted) && !props.live;
	const hasDetail = () =>
		Boolean(props.tool.input || props.tool.output || props.tool.diffs?.length);
	const label = () => (live() ? liveWorkLabel(props.tool) : workLabel(props.tool));
	return (
		<WorkLogRow
			expanded={open()}
			onToggle={hasDetail() ? () => setOpen((now) => !now) : undefined}
			ariaLabel={failed() ? `${label()}, tool call failed` : undefined}
			icon={
				<WorkLogIcon
					tone={failed() ? "failed" : "muted"}
					label={failed() ? "Tool call failed" : undefined}
				>
					{WORK_ICONS[workAction(props.tool)]()}
				</WorkLogIcon>
			}
			label={<span class={live() ? "kit-live-shine" : undefined}>{label()}</span>}
			trailing={
				<>
					<Show when={changedLines(props.tool)}>
						{(lines) => <DiffStat added={lines().added} removed={lines().removed} />}
					</Show>
					<Show when={stopped()}>
						<span class="shrink-0 text-caption text-fg-faint">Stopped</span>
					</Show>
					<Show when={failed()}>
						<WorkLogFailedMark />
					</Show>
					<WorkLogChevron expanded={open()} hidden={!hasDetail()} />
				</>
			}
		>
			<Show when={open()}>
				<WorkLogDetails kind="panel">
					<Show
						when={props.tool.diffs?.length}
						fallback={
							<Show when={props.tool.input}>
								<WorkLogOutput>{props.tool.input}</WorkLogOutput>
							</Show>
						}
					>
						<For each={props.tool.diffs}>{(diff) => <FileChange diff={diff} />}</For>
					</Show>
					<Show when={props.tool.output}>
						<WorkLogOutput>{props.tool.output}</WorkLogOutput>
					</Show>
				</WorkLogDetails>
			</Show>
		</WorkLogRow>
	);
}

/**
 * The agent's reasoning as a line: the thought's heading or first sentence, which opens to all
 * of it. While it is still thinking, the line shines and the open text follows the newest words.
 */
function ThoughtRow(props: { text: string; live: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const line = () =>
		open() ? (props.live ? "Thinking" : "Thought") : thoughtLine(props.text) || "Thought";
	return (
		<WorkLogRow
			expanded={open()}
			onToggle={() => setOpen((now) => !now)}
			icon={
				<WorkLogIcon>
					<BrainIcon />
				</WorkLogIcon>
			}
			label={<span class={props.live ? "kit-live-shine" : undefined}>{line()}</span>}
			trailing={<WorkLogChevron expanded={open()} />}
		>
			<Show when={open()}>
				<WorkLogDetails kind="text" followLive={props.live}>
					<p class="whitespace-pre-wrap text-body text-fg-muted">{props.text}</p>
				</WorkLogDetails>
			</Show>
		</WorkLogRow>
	);
}

/** The agent is waiting: what it wants to do, and the choices it offered. */
export function ApprovalCard(props: {
	approval: Extract<Block, { kind: "approval" }>;
	/** Drawn inside the composer's banners: no card of its own. */
	embedded?: boolean;
	onApprove: (id: string, optionId: string | null) => void;
}): JSX.Element {
	const resolved = () => {
		const answer = props.approval.resolved;
		if (answer === undefined) return undefined;
		if (answer === null) return "Dismissed";
		return props.approval.options.find((option) => option.id === answer)?.label ?? "Answered";
	};
	return (
		<DecisionCard
			embedded={props.embedded}
			title={props.approval.title}
			detail={
				<Show when={props.approval.detail}>
					<CodeChip>{props.approval.detail}</CodeChip>
				</Show>
			}
			options={props.approval.options.map((option) => ({
				id: option.id,
				label: option.label,
				primary: option.kind !== "deny",
				kind: option.kind,
			}))}
			resolved={resolved()}
			onChoose={(id) => props.onApprove(props.approval.id, id)}
		/>
	);
}

type SubagentBlock = Extract<Block, { kind: "subagent" }>;

const SUBAGENT_STATUS: Record<SubagentBlock["status"], { label: string; ink: string }> = {
	running: { label: "Running", ink: "text-fg-subtle" },
	completed: { label: "Done", ink: "text-fg-faint" },
	failed: { label: "Failed", ink: "text-danger" },
	cancelled: { label: "Stopped", ink: "text-fg-faint" },
};

/**
 * Work set going beside the agent's own, as lines of the work log: each subagent (what it was
 * asked, its steps, its report, once opened) and each command left running in the background.
 */
function BackgroundWork(props: { items: BackgroundItem[]; live: boolean }): JSX.Element {
	return (
		<section aria-label="Background work" class="flex min-w-0 flex-col">
			<WorkLogList>
				<For each={props.items} keyed={false}>
					{(item) => (
						<Show
							when={item().kind === "subagent" && (item() as SubagentBlock)}
							fallback={<BackgroundCommand tool={item() as ToolBlock} live={props.live} />}
						>
							{(agent) => <SubagentRow agent={agent()} live={props.live} />}
						</Show>
					)}
				</For>
			</WorkLogList>
		</section>
	);
}

/**
 * A subagent as one line of the log: a bot, what it was sent to do, which agent runs it, and how
 * it stands ("Running · Reading app.ts", "Done · 1m 12s"). It opens to its brief, its own steps
 * and what it reported back.
 */
function SubagentRow(props: { agent: SubagentBlock; live: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const status = () => SUBAGENT_STATUS[props.agent.status];
	const took = () => {
		const start = props.agent.at ? Date.parse(props.agent.at) : null;
		const end = props.agent.endedAt ? Date.parse(props.agent.endedAt) : null;
		return start && end ? formatDuration(end - start) : null;
	};
	const working = () => props.agent.status === "running" && props.live;
	const state = () =>
		[status().label, working() ? props.agent.activity : took()].filter(Boolean).join(" · ");
	const hasDetail = () =>
		Boolean(props.agent.prompt || props.agent.tools.length || props.agent.result);
	return (
		<div data-subagent={props.agent.id}>
			<WorkLogRow
				expanded={open()}
				onToggle={hasDetail() ? () => setOpen((now) => !now) : undefined}
				ariaLabel={`Subagent: ${props.agent.title}, ${state()}`}
				icon={
					<WorkLogIcon tone={props.agent.status === "failed" ? "failed" : "muted"}>
						<BotIcon />
					</WorkLogIcon>
				}
				label={
					<span class="flex min-w-0 items-baseline gap-1.5">
						<span class={`min-w-0 truncate ${working() ? "kit-live-shine" : ""}`}>
							{props.agent.title}
						</span>
						<Show when={props.agent.agent}>
							<span class="shrink-0 text-fg-faint">{props.agent.agent}</span>
						</Show>
					</span>
				}
				trailing={
					<>
						<span
							class={`min-w-0 max-w-48 shrink truncate text-caption tabular-nums ${status().ink}`}
						>
							{state()}
						</span>
						<WorkLogChevron expanded={open()} hidden={!hasDetail()} />
					</>
				}
			>
				<Show when={open()}>
					<WorkLogDetails kind="panel">
						<Show when={props.agent.prompt}>
							<p class="whitespace-pre-wrap text-body text-fg-muted">{props.agent.prompt}</p>
						</Show>
						<Show when={props.agent.tools.length}>
							<WorkLogList>
								<For each={props.agent.tools} keyed={false}>
									{(tool) => <WorkEntry tool={tool()} live={props.live} />}
								</For>
							</WorkLogList>
						</Show>
						<Show when={props.agent.result}>
							<Prose html={renderMarkdown(props.agent.result ?? "")} />
						</Show>
					</WorkLogDetails>
				</Show>
			</WorkLogRow>
		</div>
	);
}

/** A command the agent left running on its own, as one line opening to its output. */
function BackgroundCommand(props: { tool: ToolBlock; live: boolean }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const state = (): { label: string; ink: string } => {
		if (props.tool.status === "failed") return { label: "Failed", ink: "text-danger" };
		if (props.tool.interrupted) return { label: "Stopped", ink: "text-fg-faint" };
		if (props.tool.status === "completed" || !props.live)
			return { label: "Started in the background", ink: "text-fg-faint" };
		return { label: "Running in the background", ink: "text-fg-subtle" };
	};
	const detail = () => props.tool.output ?? props.tool.input;
	return (
		<WorkLogRow
			expanded={open()}
			onToggle={detail() ? () => setOpen((now) => !now) : undefined}
			icon={
				<WorkLogIcon tone={props.tool.status === "failed" ? "failed" : "muted"}>
					<TerminalIcon />
				</WorkLogIcon>
			}
			label={workLabel(props.tool)}
			trailing={
				<>
					<span class={`shrink-0 text-caption ${state().ink}`}>{state().label}</span>
					<WorkLogChevron expanded={open()} hidden={!detail()} />
				</>
			}
		>
			<Show when={open() && detail()}>
				{(text) => (
					<WorkLogDetails kind="panel">
						<WorkLogOutput>{text()}</WorkLogOutput>
					</WorkLogDetails>
				)}
			</Show>
		</WorkLogRow>
	);
}
