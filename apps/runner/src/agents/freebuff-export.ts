import { clip, type ToolKind, type TurnEvent } from "./events";

/**
 * Freebuff's conversation as JSON (its chat file, the same shape `/export` writes): the exact
 * Markdown of each reply, its reasoning and its tool calls, which the rendered screen only
 * approximates. After each turn the adapter restates the turn from it.
 */

type Block = Record<string, unknown> & { type?: unknown };
type Message = { id?: unknown; variant?: unknown; content?: unknown; blocks?: unknown };

const TOOL_KINDS: Record<string, ToolKind> = {
	read_files: "read",
	read_file: "read",
	str_replace: "edit",
	write_file: "edit",
	run_terminal_command: "execute",
	code_search: "search",
	glob: "search",
	list_directory: "search",
	web_search: "fetch",
	read_url: "fetch",
	think_deeply: "think",
};

function text(value: unknown): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value === "string") return value;
	return JSON.stringify(value, null, 2);
}

function toolName(block: Block): string | undefined {
	for (const key of ["toolName", "tool_name", "name", "tool"]) {
		if (typeof block[key] === "string") return block[key] as string;
	}
	return undefined;
}

/** A tool block as a transcript step. Its exact shape is Freebuff's; read it defensively. */
function toolEvent(block: Block, id: string): TurnEvent {
	const name = toolName(block) ?? String(block.type);
	const input = text(block.input ?? block.params ?? block.parameters ?? block.args);
	const output = text(block.output ?? block.result ?? block.content);
	const failed = block.status === "error" || block.isError === true || block.error !== undefined;
	return {
		type: "tool",
		id,
		title: name.replace(/_/g, " "),
		kind: TOOL_KINDS[name] ?? "other",
		status: failed ? "failed" : "completed",
		...(input ? { input: clip(input) } : {}),
		...(output ? { output: clip(output) } : {}),
	};
}

/** One reply's blocks as events, in order. */
function blockEvents(blocks: Block[], messageId: string): TurnEvent[] {
	const events: TurnEvent[] = [];
	blocks.forEach((block, index) => {
		if (block.type === "mode-divider") return;
		if (block.type === "text") {
			const content = typeof block.content === "string" ? block.content : "";
			if (!content.trim()) return;
			const kind = block.textType === "reasoning" ? "reasoning" : "message";
			const previous = events.at(-1);
			// Consecutive blocks of one kind read as one; keep a paragraph break between them.
			events.push({ type: kind, text: previous?.type === kind ? `\n\n${content}` : content });
			return;
		}
		if (toolName(block) || String(block.type).includes("tool")) {
			events.push(toolEvent(block, `${messageId}-${index}`));
		}
	});
	return events;
}

/**
 * The events for the last turn in an export: everything the agent said after the last message
 * the person sent. Freebuff's own notices (ids starting `sys-`) are not part of the reply.
 */
export function exportedTurn(raw: unknown): TurnEvent[] {
	if (!Array.isArray(raw)) return [];
	const messages = raw as Message[];
	const lastUser = messages.findLastIndex((message) => message.variant === "user");
	const events: TurnEvent[] = [];
	for (const message of messages.slice(lastUser + 1)) {
		const id = String(message.id ?? "");
		if (message.variant !== "ai" || id.startsWith("sys-")) continue;
		if (Array.isArray(message.blocks)) {
			events.push(...blockEvents(message.blocks as Block[], id));
		} else if (typeof message.content === "string" && message.content.trim()) {
			events.push({ type: "message", text: message.content });
		}
	}
	return events;
}
