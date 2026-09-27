import type {
	ApprovalOption,
	ChatAttachment,
	ChatEvent,
	Choice,
	FileDiff,
	PlanEntry,
	ToolKind,
	ToolStatus,
} from "../types/chat.types";

/** One row of the conversation as the screen draws it. */
export type Block =
	| {
			kind: "user";
			attachments?: ChatAttachment[];
			key: string;
			text: string;
			/** When the turn this message started began and ended (ISO times, when logged). */
			startedAt?: string;
			endedAt?: string;
			/** How the turn ended; undefined while it is still going. */
			outcome?: "done" | "cancelled" | "error";
	  }
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
	| {
			kind: "notice";
			key: string;
			tone: "error" | "muted";
			text: string;
			/** The turn itself failed: sending the message again is the way out. */
			retry?: boolean;
	  };

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
			return {
				...transcript,
				blocks: [
					...blocks,
					{
						kind: "user",
						key,
						text: event.text,
						...(event.attachments ? { attachments: event.attachments } : {}),
					},
				],
			};
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
		case "turn_start":
			return { ...transcript, blocks: markTurn(blocks, { startedAt: event.at }) };
		case "turn_end":
			return endTurn(
				{ ...transcript, blocks: markTurn(blocks, { endedAt: event.at, outcome: event.reason }) },
				event,
				key,
			);
		case "error":
			return {
				...transcript,
				blocks: [...blocks, { kind: "notice", key, tone: "error", text: event.message }],
			};
		case "turn_rewrite": {
			// Text and reasoning since the last message give way to the exact reply; tools stay.
			const since = lastIndexOf(blocks, (block) => block.kind === "user");
			const kept = blocks.filter(
				(block, i) => i <= since || (block.kind !== "assistant" && block.kind !== "reasoning"),
			);
			const rewritten = event.events.reduce(applyEvent, { ...transcript, blocks: kept });
			// A block's key is its position; keep it so now that some were taken out.
			return {
				...rewritten,
				blocks: rewritten.blocks.map((block, i) => ({ ...block, key: `b${i}` })),
			};
		}
		default:
			return transcript;
	}
}

type UserBlock = Extract<Block, { kind: "user" }>;

/** Note the current turn's timing and outcome on the message that started it. */
function markTurn(
	blocks: Block[],
	patch: Partial<Omit<UserBlock, "kind" | "key" | "text">>,
): Block[] {
	const at = lastIndexOf(blocks, (block) => block.kind === "user");
	if (at < 0) return blocks;
	// Only what the event carried: an older log's missing times leave the fields unset.
	const known = Object.fromEntries(
		Object.entries(patch).filter(([, value]) => value !== undefined),
	);
	return blocks.map((block, i) => (i === at ? ({ ...block, ...known } as Block) : block));
}

/** A turn's end: an error or a stop says so; a finished turn settles tools left running. */
function endTurn(
	transcript: Transcript,
	event: Extract<ChatEvent, { type: "turn_end" }>,
	key: string,
): Transcript {
	const blocks = transcript.blocks;
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
					retry: true,
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

/**
 * The conversation as turns: each message you sent, then everything the agent did in answer to
 * it, grouped into rows. Anything before the first message (a resumed log) is a turn of its own.
 */
export type Turn = { key: string; user: UserBlock | null; rows: Row[] };

export function groupTurns(blocks: Block[]): Turn[] {
	const turns: { key: string; user: UserBlock | null; blocks: Block[] }[] = [];
	for (const block of blocks) {
		if (block.kind === "user") turns.push({ key: block.key, user: block, blocks: [] });
		else if (turns.length === 0) turns.push({ key: block.key, user: null, blocks: [block] });
		else turns[turns.length - 1].blocks.push(block);
	}
	return turns.map((turn) => ({ key: turn.key, user: turn.user, rows: groupRows(turn.blocks) }));
}

/** "48s", "1m 28s", "2h 5m": how long a turn took, or has been going. */
export function formatDuration(ms: number): string {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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

/**
 * A long run of tool calls counted, the way a changelog reads: "18 steps, edited 5 files, ran 2
 * commands". Edits count distinct files.
 */
export function countWork(tools: Pick<ToolBlock, "title" | "input" | "tool">[]): string {
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
	const files = new Set(
		tools.filter((tool) => tool.tool === "edit").map((tool) => toolFile(tool) ?? tool.title),
	).size;
	const commands = tools.filter((tool) => tool.tool === "execute").length;
	return [
		plural(tools.length, "step"),
		...(files ? [`edited ${plural(files, "file")}`] : []),
		...(commands ? [`ran ${plural(commands, "command")}`] : []),
	].join(", ");
}

const KIND_TAGS: Record<ToolBlock["tool"], string | null> = {
	read: "file",
	edit: "file",
	execute: "command",
	search: "search",
	fetch: "web",
	think: null,
	other: null,
};

/**
 * The short tag at the end of a step's line: what sort of thing it touched. Null when that would
 * only say "tool" again.
 */
export function toolTag(tool: Pick<ToolBlock, "tool">): string | null {
	return KIND_TAGS[tool.tool];
}
