import type {
	ApprovalOption,
	ChatEvent,
	Choice,
	FileDiff,
	PlanEntry,
	ToolKind,
	ToolStatus,
} from "../types/chat.types";

/** One row of the conversation as the screen draws it. */
export type Block =
	| { kind: "user"; key: string; text: string }
	| { kind: "assistant"; key: string; text: string }
	| { kind: "reasoning"; key: string; text: string }
	| {
			kind: "tool";
			key: string;
			id: string;
			title: string;
			tool: ToolKind;
			status: ToolStatus;
			input?: string;
			output?: string;
			diffs?: FileDiff[];
	  }
	| {
			kind: "approval";
			key: string;
			id: string;
			title: string;
			detail?: string;
			options: ApprovalOption[];
			/** undefined while waiting; the chosen option, or null when dismissed. */
			resolved?: string | null;
	  }
	| { kind: "plan"; key: string; entries: PlanEntry[] }
	| { kind: "notice"; key: string; tone: "error" | "muted"; text: string };

export type Transcript = {
	blocks: Block[];
	models: Choice[];
	model: string | null;
	modes: Choice[];
	mode: string | null;
	/** Effort levels the agent reported live for the current model (ACP agents), if any. */
	efforts: Choice[] | null;
	effort: string | null;
	/** The latest usage the agent reported. */
	usage: Extract<ChatEvent, { type: "usage" }> | null;
};

export function emptyTranscript(): Transcript {
	return {
		blocks: [],
		models: [],
		model: null,
		modes: [],
		mode: null,
		efforts: null,
		effort: null,
		usage: null,
	};
}

/**
 * Fold one event into the transcript, returning a new one. Text and reasoning deltas extend the
 * block they continue; tools and approvals update their earlier block by id; a plan replaces the
 * current turn's plan. Pure, so the whole log can be replayed with `reduce`.
 */
export function applyEvent(transcript: Transcript, event: ChatEvent): Transcript {
	const blocks = transcript.blocks;
	const last = blocks.at(-1);
	const key = `b${blocks.length}`;

	switch (event.type) {
		case "user":
			return { ...transcript, blocks: [...blocks, { kind: "user", key, text: event.text }] };
		case "message":
		case "reasoning": {
			const kind = event.type === "message" ? "assistant" : "reasoning";
			if (last?.kind === kind) {
				return {
					...transcript,
					blocks: [...blocks.slice(0, -1), { ...last, text: last.text + event.text }],
				};
			}
			return { ...transcript, blocks: [...blocks, { kind, key, text: event.text }] };
		}
		case "tool": {
			const index = blocks.findIndex((block) => block.kind === "tool" && block.id === event.id);
			if (index >= 0) {
				const earlier = blocks[index] as Extract<Block, { kind: "tool" }>;
				const updated: Block = {
					...earlier,
					title: event.title ?? earlier.title,
					tool: event.kind ?? earlier.tool,
					status: event.status ?? earlier.status,
					input: event.input ?? earlier.input,
					output: event.output ?? earlier.output,
					diffs: event.diffs ?? earlier.diffs,
				};
				return { ...transcript, blocks: blocks.map((block, i) => (i === index ? updated : block)) };
			}
			return {
				...transcript,
				blocks: [
					...blocks,
					{
						kind: "tool",
						key,
						id: event.id,
						title: event.title ?? "Tool",
						tool: event.kind ?? "other",
						status: event.status ?? "running",
						input: event.input,
						output: event.output,
						diffs: event.diffs,
					},
				],
			};
		}
		case "approval":
			return {
				...transcript,
				blocks: [
					...blocks,
					{
						kind: "approval",
						key,
						id: event.id,
						title: event.title,
						detail: event.detail,
						options: event.options,
					},
				],
			};
		case "approval_resolved":
			return {
				...transcript,
				blocks: blocks.map((block) =>
					block.kind === "approval" && block.id === event.id
						? { ...block, resolved: event.optionId }
						: block,
				),
			};
		case "plan": {
			// One plan per turn: a newer version replaces the one shown since the last message.
			const since = lastIndexOf(blocks, (block) => block.kind === "user");
			const planIndex = lastIndexOf(blocks, (block) => block.kind === "plan");
			if (planIndex > since) {
				return {
					...transcript,
					blocks: blocks.map((block, i) =>
						i === planIndex ? ({ ...block, entries: event.entries } as Block) : block,
					),
				};
			}
			return { ...transcript, blocks: [...blocks, { kind: "plan", key, entries: event.entries }] };
		}
		case "usage":
			return { ...transcript, usage: { ...transcript.usage, ...event } };
		case "info":
			return {
				...transcript,
				models: event.models?.length ? event.models : transcript.models,
				model: event.model ?? transcript.model,
				modes: event.modes?.length ? event.modes : transcript.modes,
				mode: event.mode ?? transcript.mode,
				efforts: event.efforts ?? transcript.efforts,
				effort: event.effort ?? transcript.effort,
			};
		case "turn_end":
			if (event.reason === "error") {
				return {
					...transcript,
					blocks: [
						...blocks,
						{
							kind: "notice",
							key,
							tone: "error",
							text: event.error ?? "The agent stopped with an error.",
						},
					],
				};
			}
			if (event.reason === "cancelled") {
				return {
					...transcript,
					blocks: [...blocks, { kind: "notice", key, tone: "muted", text: "Stopped." }],
				};
			}
			// Tools still marked running when the turn ends did finish; the agent just never said.
			return {
				...transcript,
				blocks: blocks.map((block) =>
					block.kind === "tool" && (block.status === "running" || block.status === "pending")
						? { ...block, status: "completed" }
						: block,
				),
			};
		case "error":
			return {
				...transcript,
				blocks: [...blocks, { kind: "notice", key, tone: "error", text: event.message }],
			};
		default:
			return transcript;
	}
}

export function replay(events: ChatEvent[]): Transcript {
	return events.reduce(applyEvent, emptyTranscript());
}

function lastIndexOf<T>(items: T[], test: (item: T) => boolean): number {
	for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
	return -1;
}

/** Approvals still waiting for an answer. */
export function pendingApprovals(transcript: Transcript): Extract<Block, { kind: "approval" }>[] {
	return transcript.blocks.filter(
		(block): block is Extract<Block, { kind: "approval" }> =>
			block.kind === "approval" && block.resolved === undefined,
	);
}

type ToolBlock = Extract<Block, { kind: "tool" }>;

/** A conversation row: one block, or a run of consecutive tool calls shown as one line. */
export type Row =
	| { kind: "block"; block: Block }
	| { kind: "work"; key: string; tools: ToolBlock[] };

/** Group consecutive tool calls; every other block (approvals included) stands on its own. */
export function groupRows(blocks: Block[]): Row[] {
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

const PATH = /(?:^|[\s"'`(=:])((?:[\w.@~-]+\/)*[\w@-][\w.@-]*\.[a-z][\w]{0,7})(?=$|[\s"'`),:])/i;

/** The file a tool touched: a `path`/`file_path` field in its input, or a path in its title. */
export function toolFile(tool: Pick<ToolBlock, "title" | "input">): string | null {
	if (tool.input) {
		try {
			const input: unknown = JSON.parse(tool.input);
			if (input && typeof input === "object") {
				const fields = input as Record<string, unknown>;
				for (const name of ["file_path", "path", "filePath", "notebook_path"]) {
					const value = fields[name];
					if (typeof value === "string" && value) return value.split("/").pop() ?? value;
				}
			}
		} catch {
			// Not JSON; fall back to the title.
		}
	}
	const match = tool.title.match(PATH);
	return match ? (match[1].split("/").pop() ?? match[1]) : null;
}

function toolHost(tool: Pick<ToolBlock, "title" | "input">): string | null {
	const match = `${tool.title} ${tool.input ?? ""}`.match(/https?:\/\/([^/\s"']+)/);
	return match ? match[1] : null;
}

/** One tool call in words: "Read density.ts", "Ran a command", "Searched the project". */
export function toolLabel(tool: Pick<ToolBlock, "title" | "input" | "tool">): string {
	const file = toolFile(tool);
	switch (tool.tool) {
		case "read":
			return file ? `Read ${file}` : "Read a file";
		case "edit":
			return file ? `Edited ${file}` : "Edited a file";
		case "execute":
			return "Ran a command";
		case "search":
			return "Searched the project";
		case "fetch": {
			const host = toolHost(tool);
			return host ? `Fetched ${host}` : "Fetched a page";
		}
		case "think":
			return "Thought";
		default:
			return tool.title || "Used a tool";
	}
}

const COUNTED: Record<ToolBlock["tool"], [one: string, many: string]> = {
	read: ["Read a file", "Read {n} files"],
	edit: ["Edited a file", "Edited {n} files"],
	execute: ["Ran a command", "Ran {n} commands"],
	search: ["Searched the project", "Searched {n} times"],
	fetch: ["Fetched a page", "Fetched {n} pages"],
	think: ["Thought", "Thought {n} times"],
	other: ["Used a tool", "Used {n} tools"],
};

/**
 * What a run of tool calls did, in one line: each distinct action once, joined with " · "
 * ("Read density.ts · Edited density.ts · Ran a command"). Long runs are counted per kind instead,
 * so the line stays short.
 */
export function summariseTools(tools: Pick<ToolBlock, "title" | "input" | "tool">[]): string {
	const labels = [...new Set(tools.map(toolLabel))];
	if (labels.length <= 3) return labels.join(" · ");
	const counts = new Map<ToolBlock["tool"], number>();
	for (const tool of tools) counts.set(tool.tool, (counts.get(tool.tool) ?? 0) + 1);
	return [...counts]
		.map(([kind, n]) => (n === 1 ? COUNTED[kind][0] : COUNTED[kind][1].replace("{n}", String(n))))
		.join(" · ");
}
