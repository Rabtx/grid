import type { JSX } from "@solidjs/web";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Match,
	Show,
	Switch,
	untrack,
} from "solid-js";

import {
	AgentHeader,
	AgentLogo,
	AgentMessage,
	Badge,
	Button,
	CheckIcon,
	CloseIcon,
	CodeChip,
	CopyIcon,
	DecisionCard,
	DiffCard,
	DiffStat,
	Disclosure,
	EditIcon,
	FileIcon,
	GlobeIcon,
	IconButton,
	IdeaIcon,
	InlineNotice,
	Menu,
	NoteAddIcon,
	NoticeCard,
	PlanList,
	type PopoverControl,
	Pre,
	Prose,
	RestoreIcon,
	RunStatus,
	SearchIcon,
	SpinnerIcon,
	Stack,
	StepGlyph,
	type StepTone,
	TerminalIcon,
	ToolIcon,
	TurnHeader,
	UserMessage,
	WorkCard,
	WorkStep,
} from "@/kit";

import { relativeTime } from "@/modules/projects/lib/relative-time";

import { diffRows } from "../lib/diff";
import { copyCodeFrom, renderMarkdown } from "../lib/markdown";
import {
	type Block,
	countWork,
	formatDuration,
	groupTurns,
	type Row as TranscriptRow,
	summariseTools,
	toolFile,
	type Turn,
} from "../lib/transcript";
import type { ChatAttachment, FileDiff, ToolKind } from "../types/chat.types";
import { MessageAttachments, type LoadAttachment } from "./message-attachments";

type ToolBlock = Extract<Block, { kind: "tool" }>;

const TOOL_ICONS: Record<ToolKind, () => JSX.Element> = {
	read: () => <FileIcon size="sm" />,
	edit: () => <EditIcon size="sm" />,
	execute: () => <TerminalIcon size="sm" />,
	search: () => <SearchIcon size="sm" />,
	fetch: () => <GlobeIcon size="sm" />,
	think: () => <IdeaIcon size="sm" />,
	other: () => <ToolIcon size="sm" />,
};

/** How a call reads in the expanded list: a quiet verb, then what it acted on. */
function toolParts(tool: ToolBlock): [verb: string, target: string] {
	const file = toolFile(tool);
	switch (tool.tool) {
		case "read":
			return ["Read", file ?? tool.title];
		case "edit":
			return ["Edited", file ?? tool.title];
		case "execute":
			return ["Ran", tool.title];
		case "search":
			return ["Find", tool.title];
		case "fetch":
			return ["Fetch", tool.title];
		default:
			return [tool.title, ""];
	}
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

// A run of more tool calls than this folds into one counted line; fewer show one per line.
const OPEN_STEPS = 3;

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
}): JSX.Element {
	const turns = createMemo(() => groupTurns(props.blocks));

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the code cards' own buttons
		<div class="flex flex-col gap-10" onClick={copyCodeFrom}>
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
					/>
				)}
			</For>
		</div>
	);
}

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
}): JSX.Element {
	const now = useNow(() => props.live);
	const header = () => {
		const user = props.turn.user;
		const started = user?.startedAt ? Date.parse(user.startedAt) : null;
		if (props.live) return started ? `Working for ${formatDuration(now() - started)}` : "Working…";
		const ended = user?.endedAt ? Date.parse(user.endedAt) : null;
		return started && ended ? `Worked for ${formatDuration(ended - started)}` : null;
	};

	return (
		<section class="flex flex-col gap-3">
			<Show when={props.turn.user}>
				{(user) => (
					<UserMessageView
						text={user().text}
						meta={
							props.people
								? [props.people.you, user().startedAt ? relativeTime(user().startedAt ?? "") : null]
										.filter(Boolean)
										.join(" · ")
								: undefined
						}
						attachments={user().attachments}
						loadAttachment={props.loadAttachment}
						onNote={props.onNote}
					/>
				)}
			</Show>
			{/* No steps to carry the turn's time (a plain answer, or still thinking): it gets its own line. */}
			<Show
				when={props.live || !props.turn.rows.some((row) => row.kind === "work") ? header() : null}
			>
				{(line) => <TurnHeader live={props.live}>{line()}</TurnHeader>}
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
				{(row) => (
					<Switch>
						<Match
							when={row().kind === "work" && (row() as Extract<TranscriptRow, { kind: "work" }>)}
						>
							{(work) => (
								<WorkGroup
									tools={work().tools}
									live={props.live}
									title={
										props.turn.rows.find((item) => item.kind === "work") === row() ? header() : null
									}
								/>
							)}
						</Match>
						<Match
							when={
								row().kind === "block" && (row() as Extract<TranscriptRow, { kind: "block" }>).block
							}
						>
							{(block) => (
								<BlockView
									block={block()}
									blocks={props.blocks}
									running={props.running}
									onApprove={props.onApprove}
									onRegenerate={props.onRegenerate}
									onNote={props.onNote}
								/>
							)}
						</Match>
					</Switch>
				)}
			</For>
		</section>
	);
}

function BlockView(props: {
	block: Block;
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: UserPrompt) => void;
	onNote?: (text: string) => void;
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
					<Disclosure icon={<IdeaIcon size="sm" />} summary="Thinking" chevron>
						<p class="mt-1.5 ml-2 whitespace-pre-wrap border-line border-l-2 pl-3 text-body text-fg-subtle">
							{(block() as Extract<Block, { kind: "reasoning" }>).text}
						</p>
					</Disclosure>
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
				when={props.block.kind === "notice" && (props.block as Extract<Block, { kind: "notice" }>)}
			>
				{(notice) => (
					<Show
						when={notice().tone === "error"}
						fallback={<InlineNotice tone="info">{notice().text}</InlineNotice>}
					>
						<Stack gap={2}>
							<RunStatus status="error">Needs a fix</RunStatus>
							<NoticeCard
								title="The agent stopped"
								actions={
									retry() ? (
										<Button
											size="sm"
											disabled={props.running}
											onClick={() => {
												const prompt = retry();
												if (prompt) props.onRegenerate?.(prompt);
											}}
										>
											Try again
										</Button>
									) : undefined
								}
							>
								{notice().text}
							</NoticeCard>
						</Stack>
					</Show>
				)}
			</Match>
		</Switch>
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
				]}
				control={(control) => {
					menu = control;
				}}
				onSelect={(id) => {
					if (id === "note") props.onNote?.(props.text);
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
				<Prose html={renderMarkdown(props.text)} />
			</AgentMessage>
		</>
	);
}

/** A file's change, highlighted: the diff rows of the chat model drawn by the kit's DiffCard. */
function FileChange(props: { diff: FileDiff }): JSX.Element {
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

/** How each kind of step is drawn: its glyph and tint. */
function stepLook(tool: ToolBlock): { tone: StepTone; glyph: () => JSX.Element; verb: string } {
	const created =
		tool.tool === "edit" &&
		(tool.diffs ?? []).length > 0 &&
		(tool.diffs ?? []).every((diff) => diff.removed === 0) &&
		/^(write|create)/i.test(tool.title);
	if (tool.status === "failed")
		return { tone: "danger", glyph: () => <CloseIcon />, verb: toolParts(tool)[0] };
	if (created) return { tone: "success", glyph: () => <NoteAddIcon />, verb: "Created" };
	switch (tool.tool) {
		case "edit":
			return { tone: "accent", glyph: () => <EditIcon />, verb: "Edited" };
		case "execute":
			return { tone: "violet", glyph: () => <TerminalIcon />, verb: "Ran" };
		case "fetch":
			return { tone: "accent", glyph: () => <GlobeIcon />, verb: toolParts(tool)[0] };
		default:
			return { tone: "neutral", glyph: TOOL_ICONS[tool.tool], verb: toolParts(tool)[0] };
	}
}

/** What a step reports on the right: lines changed, or a command's last line. */
function stepFigure(tool: ToolBlock): JSX.Element | undefined {
	const diffs = tool.diffs;
	if (diffs?.length) {
		const added = diffs.reduce((sum, diff) => sum + diff.added, 0);
		const removed = diffs.reduce((sum, diff) => sum + diff.removed, 0);
		return <DiffStat added={added} removed={removed} />;
	}
	if (tool.tool === "execute" && tool.output) {
		const last = tool.output.trim().split("\n").at(-1) ?? "";
		return last.length > 40 ? `${last.slice(0, 40)}…` : last;
	}
	return undefined;
}

/**
 * A run of tool calls as one card (Figma "Worked for 1m 12s · 3 steps"): the kinds of step as small
 * tiles, the turn's time or a summary, and each step as a row that opens to its detail. A short run
 * is open; a long one is closed to its count. After it, the biggest change it made, as a diff.
 */
function WorkGroup(props: {
	tools: ToolBlock[];
	live: boolean;
	title: string | null;
}): JSX.Element {
	// A stopped or failed turn leaves its last tools "running" in the log: only a live turn spins.
	const busy = () =>
		props.live &&
		props.tools.some((tool) => tool.status === "running" || tool.status === "pending");
	const failed = () => props.tools.some((tool) => tool.status === "failed");
	// One glyph per kind of step, in the order they first happen, at most three.
	const glyphs = () => {
		const seen = new Map<StepTone, ToolBlock>();
		for (const tool of props.tools) {
			const look = stepLook(tool);
			if (!seen.has(look.tone)) seen.set(look.tone, tool);
		}
		return [...seen.values()].slice(0, 3);
	};
	// The change worth seeing without opening anything: the edit that changed the most lines.
	const highlight = () => {
		if (busy()) return null;
		// An edit to existing code says more than a new file, so it wins over a bigger new one.
		const size = (diff: FileDiff) => diff.added + diff.removed + (diff.removed > 0 ? 10_000 : 0);
		let best: FileDiff | null = null;
		for (const tool of props.tools) {
			for (const diff of tool.diffs ?? []) {
				if (!best || size(diff) > size(best)) best = diff;
			}
		}
		return best;
	};
	const steps = () => `${props.tools.length} step${props.tools.length === 1 ? "" : "s"}`;
	return (
		<>
			<WorkCard
				open={untrack(() => props.tools.length <= OPEN_STEPS)}
				glyphs={
					<Show
						when={!busy()}
						fallback={
							<StepGlyph tone="neutral">
								<SpinnerIcon class="animate-spin" />
							</StepGlyph>
						}
					>
						<For each={glyphs()}>
							{(tool) => {
								const look = stepLook(tool);
								return <StepGlyph tone={look.tone}>{look.glyph()}</StepGlyph>;
							}}
						</For>
					</Show>
				}
				title={
					busy()
						? (props.tools.at(-1)?.title ?? "Working…")
						: (props.title ??
							(props.tools.some((tool) => tool.tool === "edit" || tool.tool === "execute")
								? countWork(props.tools)
								: summariseTools(props.tools)))
				}
				detail={props.title || busy() ? steps() : undefined}
				trailing={
					<Show when={failed()}>
						<Badge tone="danger">Failed</Badge>
					</Show>
				}
			>
				<For each={props.tools} keyed={false}>
					{(tool) => <StepView tool={tool()} live={props.live} hide={highlight()} />}
				</For>
			</WorkCard>
			<Show when={highlight()}>{(diff) => <FileChange diff={diff()} />}</Show>
		</>
	);
}

function StepView(props: { tool: ToolBlock; live: boolean; hide: FileDiff | null }): JSX.Element {
	const look = () => stepLook(props.tool);
	// The change already shown under the card is not drawn again inside its step.
	const diffs = () => (props.tool.diffs ?? []).filter((diff) => diff !== props.hide);
	const hasDetail = () => Boolean(props.tool.input || props.tool.output || diffs().length);
	return (
		<WorkStep
			glyph={
				<Show
					when={props.live && (props.tool.status === "running" || props.tool.status === "pending")}
					fallback={<StepGlyph tone={look().tone}>{look().glyph()}</StepGlyph>}
				>
					<StepGlyph tone="neutral">
						<SpinnerIcon class="animate-spin" />
					</StepGlyph>
				</Show>
			}
			verb={look().verb}
			failed={props.tool.status === "failed"}
			target={toolParts(props.tool)[1]}
			trailing={stepFigure(props.tool)}
		>
			<Show when={hasDetail()}>
				<Stack gap={1.5}>
					<Show
						when={!props.tool.diffs?.length}
						fallback={<For each={diffs()}>{(diff) => <FileChange diff={diff} />}</For>}
					>
						<Show when={props.tool.input}>
							<Pre tone="input">{props.tool.input}</Pre>
						</Show>
					</Show>
					<Show when={props.tool.output}>
						<Pre tone="output">{props.tool.output}</Pre>
					</Show>
				</Stack>
			</Show>
		</WorkStep>
	);
}

/** The agent is waiting: what it wants to do, and the choices it offered. */
export function ApprovalCard(props: {
	approval: Extract<Block, { kind: "approval" }>;
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
