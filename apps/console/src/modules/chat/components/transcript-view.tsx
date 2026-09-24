import type { JSX } from "@solidjs/web";
import { createMemo, For, Match, Show, Switch } from "solid-js";

import {
	AlertIcon,
	Button,
	CheckIcon,
	CloseIcon,
	EditIcon,
	FileIcon,
	GlobeIcon,
	IdeaIcon,
	SearchIcon,
	SpinnerIcon,
	TerminalIcon,
	ToolIcon,
} from "@/ui";

import { renderMarkdown } from "../lib/markdown";
import type { Block } from "../lib/transcript";
import type { ToolKind } from "../types/chat.types";

type ToolBlock = Extract<Block, { kind: "tool" }>;

/** Consecutive tool calls are shown as one group, folded to a single summary line once done. */
type Row = { kind: "block"; block: Block } | { kind: "work"; key: string; tools: ToolBlock[] };

function rows(blocks: Block[]): Row[] {
	const out: Row[] = [];
	for (const block of blocks) {
		const last = out.at(-1);
		if (block.kind === "tool") {
			if (last?.kind === "work") last.tools.push(block);
			else out.push({ kind: "work", key: block.key, tools: [block] });
		} else {
			out.push({ kind: "block", block });
		}
	}
	return out;
}

const TOOL_ICONS: Record<ToolKind, (props: { class?: string }) => JSX.Element> = {
	read: FileIcon,
	edit: EditIcon,
	execute: TerminalIcon,
	search: SearchIcon,
	fetch: GlobeIcon,
	think: IdeaIcon,
	other: ToolIcon,
};

const VERBS: Record<ToolKind, [one: string, many: string]> = {
	read: ["Read a file", "Read {n} files"],
	edit: ["Edited a file", "Edited {n} files"],
	execute: ["Ran a command", "Ran {n} commands"],
	search: ["Searched", "Searched {n} times"],
	fetch: ["Fetched a page", "Fetched {n} pages"],
	think: ["Thought", "Thought {n} times"],
	other: ["Used a tool", "Used {n} tools"],
};

/** "Read 3 files, ran a command" — what a finished group of tool calls did. */
export function summarise(tools: ToolBlock[]): string {
	const counts = new Map<ToolKind, number>();
	for (const tool of tools) counts.set(tool.tool, (counts.get(tool.tool) ?? 0) + 1);
	return [...counts]
		.map(([kind, n]) => (n === 1 ? VERBS[kind][0] : VERBS[kind][1].replace("{n}", String(n))))
		.map((part, index) => (index === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1)))
		.join(", ");
}

export function TranscriptView(props: {
	blocks: Block[];
	running: boolean;
	onApprove: (id: string, optionId: string | null) => void;
}): JSX.Element {
	const grouped = createMemo(() => rows(props.blocks));

	return (
		<div class="flex flex-col gap-4">
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
							{(block) => <BlockView block={block()} onApprove={props.onApprove} />}
						</Match>
					</Switch>
				)}
			</For>
			<Show when={props.running && props.blocks.at(-1)?.kind !== "assistant"}>
				<p class="flex items-center gap-2 text-ink/45 text-ui-sm">
					<SpinnerIcon class="size-3.5" />
					Working…
				</p>
			</Show>
		</div>
	);
}

function BlockView(props: {
	block: Block;
	onApprove: (id: string, optionId: string | null) => void;
}): JSX.Element {
	return (
		<Switch>
			<Match when={props.block.kind === "user" && props.block}>
				{(block) => (
					<div class="whitespace-pre-wrap break-words rounded-xl border border-ink/12 bg-ink/4 px-3.5 py-2.5 text-ink text-ui">
						{(block() as Extract<Block, { kind: "user" }>).text}
					</div>
				)}
			</Match>
			<Match when={props.block.kind === "assistant" && props.block}>
				{(block) => (
					<div
						class="chat-prose min-w-0 break-words text-ink/90 text-ui"
						innerHTML={renderMarkdown((block() as Extract<Block, { kind: "assistant" }>).text)}
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

/** A run of tool calls: live while any is working, then one line that opens to show them all. */
function WorkGroup(props: { tools: ToolBlock[] }): JSX.Element {
	const busy = () =>
		props.tools.some((tool) => tool.status === "running" || tool.status === "pending");
	const failed = () => props.tools.some((tool) => tool.status === "failed");
	return (
		<details class="group rounded-lg text-ui-sm" open={busy()}>
			<summary class="flex cursor-pointer list-none items-center gap-2 text-ink/55 hover:text-ink/80">
				<Show
					when={busy()}
					fallback={
						<Show when={failed()} fallback={<CheckIcon class="size-3.5 text-ink/40" />}>
							<AlertIcon class="size-3.5 text-danger" />
						</Show>
					}
				>
					<SpinnerIcon class="size-3.5" />
				</Show>
				<span class="truncate">
					{busy() ? (props.tools.at(-1)?.title ?? "Working") : summarise(props.tools)}
				</span>
			</summary>
			<ul class="mt-2 flex flex-col gap-1 border-ink/10 border-l-2 pl-3">
				<For each={props.tools} keyed={false}>
					{(tool) => <ToolRow tool={tool()} />}
				</For>
			</ul>
		</details>
	);
}

function ToolRow(props: { tool: ToolBlock }): JSX.Element {
	const Icon = () => TOOL_ICONS[props.tool.tool] ?? ToolIcon;
	return (
		<li>
			<details class="group/tool">
				<summary class="flex cursor-pointer list-none items-center gap-2 py-0.5 text-ink/65 hover:text-ink">
					{Icon()({ class: "size-3.5 shrink-0 text-ink/45" })}
					<span class="min-w-0 flex-1 truncate">{props.tool.title}</span>
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
