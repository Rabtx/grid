import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, For, Match, onSettled, Show, Switch } from "solid-js";

import {
	AlertIcon,
	attachContextMenu,
	Button,
	CheckIcon,
	CloseIcon,
	CopyIcon,
	EditIcon,
	FileIcon,
	GlobeIcon,
	IdeaIcon,
	Menu,
	type MenuControl,
	NoteAddIcon,
	RestoreIcon,
	SearchIcon,
	SpinnerIcon,
	TerminalIcon,
	ToolIcon,
} from "@/ui";

import { copyCodeFrom, renderMarkdown } from "../lib/markdown";
import { type Block, groupRows, type Row, summariseTools, toolFile } from "../lib/transcript";
import type { ToolKind } from "../types/chat.types";

type ToolBlock = Extract<Block, { kind: "tool" }>;

const TOOL_ICONS: Record<ToolKind, (props: { class?: string }) => JSX.Element> = {
	read: FileIcon,
	edit: EditIcon,
	execute: TerminalIcon,
	search: SearchIcon,
	fetch: GlobeIcon,
	think: IdeaIcon,
	other: ToolIcon,
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
		<div class="flex flex-col gap-3" onClick={copyCodeFrom}>
			{/* keyed={false}: rows only ever append or update in place, so each keeps its DOM (and an open <details>). */}
			<For each={grouped()} keyed={false}>
				{(row) => (
					<Switch>
						<Match when={row().kind === "work" && (row() as Extract<Row, { kind: "work" }>)}>
							{(work) => <WorkGroup tools={work().tools} />}
						</Match>
						<Match
							when={row().kind === "block" && (row() as Extract<Row, { kind: "block" }>).block}
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
				<p class="flex items-center gap-2 px-1 text-ink/50 text-ui-sm">
					<span class="working-dots">
						<i />
						<i />
						<i />
					</span>
					<span class="thread-running">Working</span>
				</p>
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
					<UserMessage
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
					<details class="group text-ink/50 text-ui-sm">
						<summary class="flex cursor-pointer list-none items-center gap-1.5 hover:text-ink/70">
							<IdeaIcon class="size-3.5" />
							Thinking
						</summary>
						<p class="mt-1.5 whitespace-pre-wrap border-ink/10 border-l-2 pl-3">
							{(block() as Extract<Block, { kind: "reasoning" }>).text}
						</p>
					</details>
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
				{(plan) => (
					<ol class="flex flex-col gap-1 rounded-lg border border-ink/10 px-3 py-2.5 text-ui-sm">
						<For each={plan().entries}>
							{(entry) => (
								<li
									class={`flex items-start gap-2 ${entry.status === "completed" ? "text-ink/40 line-through" : "text-ink/80"}`}
								>
									<span class="mt-0.5 grid size-4 shrink-0 place-items-center">
										<Show
											when={entry.status === "completed"}
											fallback={
												<span
													class={`size-2.5 rounded-full border ${entry.status === "in_progress" ? "border-accent bg-accent/30" : "border-ink/30"}`}
												/>
											}
										>
											<CheckIcon class="size-3.5 text-success" />
										</Show>
									</span>
									{entry.text}
								</li>
							)}
						</For>
					</ol>
				)}
			</Match>
			<Match
				when={props.block.kind === "notice" && (props.block as Extract<Block, { kind: "notice" }>)}
			>
				{(notice) => (
					<p
						class={`flex items-start gap-2 text-ui-sm ${notice().tone === "error" ? "text-danger" : "text-ink/45"}`}
					>
						<Show when={notice().tone === "error"}>
							<AlertIcon class="mt-0.5 size-3.5 shrink-0" />
						</Show>
						{notice().text}
					</p>
				)}
			</Match>
		</Switch>
	);
}

const ACTION_BTN =
	"focus-ring grid size-6 place-items-center rounded-md text-ink/40 transition-[background-color,color,transform] duration-fast ease-out-grid hover:bg-ink/8 hover:text-ink/70 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30 pointer-coarse:size-9";

/** Copy text, briefly confirming on the button that asked. */
function copyText(text: string, done: () => void): void {
	void navigator.clipboard?.writeText(text).then(done);
}

/** The "Add as note" button in a message's hover bar. */
function NoteButton(props: { onNote?: (text: string) => void; text: string }): JSX.Element {
	return (
		<Show when={props.onNote}>
			{(save) => (
				<button
					type="button"
					aria-label="Add as note"
					title="Add as note"
					class={ACTION_BTN}
					onClick={() => save()(props.text)}
				>
					<NoteAddIcon class="size-3.5" />
				</button>
			)}
		</Show>
	);
}

/** What you sent: a right-aligned bubble, clamped to four lines until opened, with copy & note actions. */
function UserMessage(props: { text: string; onNote?: (text: string) => void }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const [copied, setCopied] = createSignal(false);
	// Touch screens: a long press opens the actions (the hover bar is for pointers).
	let menu: MenuControl | undefined;
	let row: HTMLDivElement | undefined;
	onSettled(() =>
		row ? attachContextMenu(row, (point) => menu?.open(point), { touchOnly: true }) : undefined,
	);
	const long = () => props.text.split("\n").length > 4 || props.text.length > 400;

	return (
		<div
			class="group/user flex flex-col items-end"
			ref={(el) => {
				row = el;
			}}
		>
			<Menu
				label="Message actions"
				trigger={<span />}
				triggerClass="hidden"
				items={[
					{ id: "copy", label: "Copy message" },
					...(props.onNote ? [{ id: "note", label: "Add as note" }] : []),
				]}
				control={(control) => {
					menu = control;
				}}
				onSelect={(id) => {
					if (id === "note") props.onNote?.(props.text);
					else copyText(props.text, () => undefined);
				}}
			/>
			<div class="max-w-[85%] rounded-2xl rounded-br-sm border border-ink/10 bg-ink/8 px-3.5 py-2.5 shadow-xs sm:max-w-[75%]">
				<p
					class={`whitespace-pre-wrap break-words text-ink text-ui ${open() ? "" : "line-clamp-4"}`}
				>
					{props.text}
				</p>
			</div>
			<div class="flex h-6 items-center justify-end gap-1 px-1 pt-1 opacity-0 transition-opacity duration-fast group-hover/user:opacity-100 group-focus-within/user:opacity-100 pointer-coarse:hidden">
				<Show when={long()}>
					<button
						type="button"
						class="focus-ring rounded-md px-1.5 text-ink/45 text-ui-xs hover:bg-ink/8 hover:text-ink/70 pointer-coarse:min-h-9"
						onClick={() => setOpen(!open())}
					>
						{open() ? "Show less" : "Show more"}
					</button>
				</Show>
				<button
					type="button"
					aria-label="Copy message"
					title={copied() ? "Copied" : "Copy"}
					class={ACTION_BTN}
					onClick={() =>
						void navigator.clipboard?.writeText(props.text).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						})
					}
				>
					<Show when={copied()} fallback={<CopyIcon class="size-3.5" />}>
						<CheckIcon class="size-3.5 text-success" />
					</Show>
				</button>
				<NoteButton text={props.text} onNote={props.onNote} />
			</div>
		</div>
	);
}

/**
 * The agent's response: Markdown with its actions (copy, note, regenerate) under it on hover; on touch a
 * long press opens them instead, so nothing is drawn at rest.
 */
function AssistantMessage(props: {
	text: string;
	running?: boolean;
	canRegenerate?: boolean;
	onRegenerate?: () => void;
	onNote?: (text: string) => void;
}): JSX.Element {
	const [copied, setCopied] = createSignal(false);
	let menu: MenuControl | undefined;
	let row: HTMLDivElement | undefined;
	onSettled(() =>
		row ? attachContextMenu(row, (point) => menu?.open(point), { touchOnly: true }) : undefined,
	);

	return (
		<div
			class="group/assistant flex flex-col items-start"
			ref={(el) => {
				row = el;
			}}
		>
			<Menu
				label="Response actions"
				trigger={<span />}
				triggerClass="hidden"
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
					if (id === "copy") copyText(props.text, () => undefined);
					else if (id === "note") props.onNote?.(props.text);
					else props.onRegenerate?.();
				}}
			/>
			<div
				class="chat-prose min-w-0 max-w-full break-words px-1 text-ink text-ui"
				innerHTML={renderMarkdown(props.text)}
			/>
			<div class="flex h-6 items-center gap-1 px-1 pt-1 opacity-0 transition-opacity duration-fast group-hover/assistant:opacity-100 group-focus-within/assistant:opacity-100 pointer-coarse:hidden">
				<button
					type="button"
					aria-label="Copy response"
					title={copied() ? "Copied" : "Copy"}
					class={ACTION_BTN}
					onClick={() =>
						void navigator.clipboard?.writeText(props.text).then(() => {
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						})
					}
				>
					<Show when={copied()} fallback={<CopyIcon class="size-3.5" />}>
						<CheckIcon class="size-3.5 text-success" />
					</Show>
				</button>
				<NoteButton text={props.text} onNote={props.onNote} />
				<Show when={props.canRegenerate}>
					<button
						type="button"
						aria-label="Regenerate response"
						title={props.running ? "Cannot regenerate while running" : "Regenerate response"}
						disabled={props.running}
						class={ACTION_BTN}
						onClick={() => props.onRegenerate?.()}
					>
						<RestoreIcon class="size-3.5" />
					</button>
				</Show>
			</div>
		</div>
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
	const Icon = () => TOOL_ICONS[props.tools[0]?.tool ?? "other"] ?? ToolIcon;

	return (
		<details class="group/work">
			<summary class="flex min-h-7 cursor-pointer list-none items-center gap-1.5 px-1 py-1 text-ink/50 text-ui transition-colors duration-fast hover:text-ink/80 pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
				<span class="grid size-3.5 shrink-0 place-items-center">
					<Show
						when={busy()}
						fallback={
							<Show when={failed()} fallback={Icon()({ class: "size-3.5 text-ink/45" })}>
								<AlertIcon class="size-3.5 text-danger" />
							</Show>
						}
					>
						<SpinnerIcon class="size-3.5" />
					</Show>
				</span>
				<span class="min-w-0 flex-1 truncate">
					{busy() ? (props.tools.at(-1)?.title ?? "Working…") : summariseTools(props.tools)}
				</span>
			</summary>
			<ul class="mt-0.5 mb-1 ml-2.5 flex flex-col border-ink/10 border-l pl-3.5">
				<For each={props.tools} keyed={false}>
					{(tool) => <ToolRow tool={tool()} />}
				</For>
			</ul>
		</details>
	);
}

function ToolRow(props: { tool: ToolBlock }): JSX.Element {
	const Icon = () => TOOL_ICONS[props.tool.tool] ?? ToolIcon;
	const parts = () => toolParts(props.tool);
	return (
		<li>
			<details class="group/tool">
				<summary class="flex min-h-7 cursor-pointer list-none items-center gap-1.5 py-1 hover:text-ink pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
					{Icon()({ class: "size-3.5 shrink-0 text-ink/40" })}
					<span class="shrink-0 text-ink/50 text-ui">{parts()[0]}</span>
					<span class="min-w-0 flex-1 truncate pl-1 font-mono text-ink/70 text-ui-sm">
						{parts()[1]}
					</span>
					<Show when={props.tool.status === "failed"}>
						<CloseIcon class="size-3.5 shrink-0 text-danger" />
					</Show>
					<Show when={props.tool.status === "running" || props.tool.status === "pending"}>
						<SpinnerIcon class="size-3 shrink-0" />
					</Show>
				</summary>
				<Show when={props.tool.input || props.tool.output}>
					<div class="mt-1 mb-1.5 flex flex-col gap-1.5">
						<Show when={props.tool.input}>
							<pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-ink/6 px-2.5 py-1.5 font-mono text-ink/80 text-ui-xs">
								{props.tool.input}
							</pre>
						</Show>
						<Show when={props.tool.output}>
							<pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-ink/4 px-2.5 py-1.5 font-mono text-ink/60 text-ui-xs">
								{props.tool.output}
							</pre>
						</Show>
					</div>
				</Show>
			</details>
		</li>
	);
}

/** The agent is waiting: what it wants to do, and the choices it offered. */
function ApprovalCard(props: {
	approval: Extract<Block, { kind: "approval" }>;
	onApprove: (id: string, optionId: string | null) => void;
}): JSX.Element {
	const chosen = () =>
		props.approval.options.find((option) => option.id === props.approval.resolved);
	return (
		<div
			class={`rounded-xl border px-3.5 py-3 ${props.approval.resolved === undefined ? "border-warning/50 bg-warning/5" : "border-ink/10"}`}
		>
			<p class="font-medium text-ink text-ui-sm">{props.approval.title}</p>
			<Show when={props.approval.detail}>
				<pre class="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-ink/6 px-2.5 py-1.5 font-mono text-ink/80 text-ui-xs">
					{props.approval.detail}
				</pre>
			</Show>
			<Show
				when={props.approval.resolved === undefined}
				fallback={
					<p class="mt-2 text-ink/45 text-ui-xs">
						{props.approval.resolved === null ? "Dismissed" : `${chosen()?.label ?? "Answered"}`}
					</p>
				}
			>
				<div class="mt-2.5 flex flex-wrap gap-2">
					<For each={props.approval.options}>
						{(option) => (
							<Button
								size="md"
								variant={option.kind === "deny" ? "secondary" : "primary"}
								onClick={() => props.onApprove(props.approval.id, option.id)}
							>
								{option.label}
							</Button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}
