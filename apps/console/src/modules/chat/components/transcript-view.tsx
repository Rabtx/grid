import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import {
	AgentMessage,
	AlertIcon,
	CheckIcon,
	CloseIcon,
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
	PlanList,
	type PopoverControl,
	Pre,
	Prose,
	Rail,
	RestoreIcon,
	Row,
	SearchIcon,
	Shimmer,
	SpinnerIcon,
	Stack,
	TerminalIcon,
	Text,
	ToolIcon,
	UserMessage,
	WorkingDots,
} from "@/kit";

import { diffRows } from "../lib/diff";
import { copyCodeFrom, renderMarkdown } from "../lib/markdown";
import {
	type Block,
	groupRows,
	type Row as TranscriptRow,
	summariseTools,
	toolFile,
} from "../lib/transcript";
import type { FileDiff, ToolKind } from "../types/chat.types";

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

function findPrecedingUserPrompt(blocks: Block[], target: Block): string | null {
	const index = blocks.indexOf(target);
	if (index === -1) {
		const keyIndex = blocks.findIndex((b) => b.key === target.key);
		if (keyIndex !== -1) {
			for (let i = keyIndex - 1; i >= 0; i--) {
				const b = blocks[i];
				if (b && b.kind === "user") return b.text;
			}
		}
		return null;
	}
	for (let i = index - 1; i >= 0; i--) {
		const b = blocks[i];
		if (b && b.kind === "user") return b.text;
	}
	return null;
}

export function TranscriptView(props: {
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: string) => void;
	/** Save a message to the project's notes; no action is shown without it. */
	onNote?: (text: string) => void;
}): JSX.Element {
	const grouped = createMemo(() => groupRows(props.blocks));

	return (
		// oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- delegates clicks from the code cards' own buttons
		<div class="flex flex-col gap-2" onClick={copyCodeFrom}>
			{/* keyed={false}: rows only ever append or update in place, so each keeps its DOM (and an open <details>). */}
			<For each={grouped()} keyed={false}>
				{(row) => (
					<Switch>
						<Match
							when={row().kind === "work" && (row() as Extract<TranscriptRow, { kind: "work" }>)}
						>
							{(work) => <WorkGroup tools={work().tools} />}
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
			<Show when={props.running && props.blocks.at(-1)?.kind !== "assistant"}>
				<Row gap={2} class="px-1">
					<WorkingDots />
					<Text as="span" tone="subtle">
						<Shimmer active>Working</Shimmer>
					</Text>
				</Row>
			</Show>
		</div>
	);
}

function BlockView(props: {
	block: Block;
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
	onRegenerate?: (prompt: string) => void;
	onNote?: (text: string) => void;
}): JSX.Element {
	const userPrompt = createMemo(() => {
		if (props.block.kind !== "assistant") return null;
		return findPrecedingUserPrompt(props.blocks, props.block);
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
					<Disclosure icon={<IdeaIcon size="sm" />} summary="Thinking">
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
				{(approval) => <ApprovalCard approval={approval()} onApprove={props.onApprove} />}
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
					<InlineNotice tone={notice().tone === "error" ? "error" : "info"}>
						{notice().text}
					</InlineNotice>
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
function UserMessageView(props: { text: string; onNote?: (text: string) => void }): JSX.Element {
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

/**
 * A run of tool calls as one quiet line — "Read density.ts · Edited density.ts · Ran a command" —
 * live while any is working, opening to a rail that lists each call.
 */
function WorkGroup(props: { tools: ToolBlock[] }): JSX.Element {
	const busy = () =>
		props.tools.some((tool) => tool.status === "running" || tool.status === "pending");
	const failed = () => props.tools.some((tool) => tool.status === "failed");
	return (
		<Disclosure
			icon={
				<Show
					when={busy()}
					fallback={
						<Show when={failed()} fallback={TOOL_ICONS[props.tools[0]?.tool ?? "other"]()}>
							<AlertIcon size="sm" class="text-danger" />
						</Show>
					}
				>
					<SpinnerIcon size="sm" class="animate-spin" />
				</Show>
			}
			summary={
				<Text as="span" size="inherit" tone="inherit" truncate>
					{busy() ? (props.tools.at(-1)?.title ?? "Working…") : summariseTools(props.tools)}
				</Text>
			}
		>
			<Rail>
				<For each={props.tools} keyed={false}>
					{(tool) => <ToolRow tool={tool()} />}
				</For>
			</Rail>
		</Disclosure>
	);
}

function ToolRow(props: { tool: ToolBlock }): JSX.Element {
	const parts = () => toolParts(props.tool);
	// Lines an edit added and removed, across its files.
	const changed = () => {
		const diffs = props.tool.diffs;
		if (!diffs?.length) return null;
		return diffs.reduce(
			(sum, diff) => ({ added: sum.added + diff.added, removed: sum.removed + diff.removed }),
			{ added: 0, removed: 0 },
		);
	};
	return (
		<li>
			<Disclosure
				icon={TOOL_ICONS[props.tool.tool]()}
				summary={
					<>
						<Text as="span" size="inherit" tone="subtle" class="shrink-0">
							{parts()[0]}
						</Text>
						<Text as="span" tone="default" mono truncate class="flex-1 pl-1">
							{parts()[1]}
						</Text>
						<Show when={changed()}>
							{(count) => <DiffStat added={count().added} removed={count().removed} />}
						</Show>
						<Show when={props.tool.status === "failed"}>
							<CloseIcon size="sm" class="text-danger" />
						</Show>
						<Show when={props.tool.status === "running" || props.tool.status === "pending"}>
							<SpinnerIcon size="xs" class="animate-spin" />
						</Show>
					</>
				}
			>
				<Show when={props.tool.input || props.tool.output || props.tool.diffs?.length}>
					<Stack gap={1.5} class="mt-1 mb-1.5">
						<Show
							when={!props.tool.diffs?.length}
							fallback={<For each={props.tool.diffs}>{(diff) => <FileChange diff={diff} />}</For>}
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
			</Disclosure>
		</li>
	);
}

/** The agent is waiting: what it wants to do, and the choices it offered. */
function ApprovalCard(props: {
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
					<Pre tone="input">{props.approval.detail}</Pre>
				</Show>
			}
			options={props.approval.options.map((option) => ({
				id: option.id,
				label: option.label,
				primary: option.kind !== "deny",
			}))}
			resolved={resolved()}
			onChoose={(id) => props.onApprove(props.approval.id, id)}
		/>
	);
}
