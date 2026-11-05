import type { ContextPart } from "@/kit";

import type { Block } from "./transcript";

/** About four characters to a token, as most tokenizers come out on code and English. */
const CHARS_PER_TOKEN = 4;

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** How full a thread's context is, and what fills it. */
export type ContextUsage = {
	/** Tokens in the context: the agent's own count, or the thread's text sized when it gives none. */
	used: number;
	/** The thread's text sized: the agent did not say. */
	estimated: boolean;
	parts: ContextPart[];
};

/**
 * What fills a thread's context: the agent's own total when it reports one (Codex, Claude Code,
 * opencode), else the thread's text sized, no more than the agent says it read and wrote
 * (Antigravity and Grok say only what each turn cost). The split
 * is always estimated: the thread's text is sized (its messages, and its tool calls with what they
 * returned) and the rest of the agent's total is its setup (instructions and tool definitions).
 * After a compact the thread's text is more than the context holds; it is scaled down to fit.
 */
export function contextUsage(
	blocks: readonly Block[],
	reported?: number,
	/**
	 * What the agent says it read and wrote (input plus output, per turn or all told): every
	 * request carries the conversation, so the context never holds more. It caps the estimate.
	 */
	billed?: number,
): ContextUsage {
	const estimated = !reported || reported <= 0;
	const sized = textTokens(blocks);
	const used = estimated ? (billed && billed > 0 ? Math.min(sized, billed) : sized) : reported;
	return { used, estimated, parts: contextSplit(blocks, used, estimated) };
}

/** The thread's own text, in tokens. */
function textTokens(blocks: readonly Block[]): number {
	const parts = contextSplit(blocks, Number.MAX_SAFE_INTEGER, true);
	return parts.reduce((sum, part) => sum + part.tokens, 0);
}

function contextSplit(blocks: readonly Block[], used: number, estimated: boolean): ContextPart[] {
	if (used <= 0) return [];
	let talk = 0;
	let messages = 0;
	let results = 0;
	let calls = 0;
	for (const block of blocks) {
		if (block.kind === "user" || block.kind === "assistant") {
			talk += block.text.length;
			messages++;
		} else if (block.kind === "reasoning" || block.kind === "steer") {
			talk += block.text.length;
		} else if (block.kind === "subagent") {
			talk += (block.prompt?.length ?? 0) + (block.result?.length ?? 0);
		} else if (block.kind === "tool") {
			results += (block.input?.length ?? 0) + (block.output?.length ?? 0);
			calls++;
		}
	}
	let conversation = Math.ceil(talk / CHARS_PER_TOKEN);
	let tools = Math.ceil(results / CHARS_PER_TOKEN);
	if (conversation + tools > used) {
		const scale = used / (conversation + tools);
		conversation = Math.round(conversation * scale);
		tools = used - conversation;
	}
	const setup = estimated ? 0 : used - conversation - tools;
	const parts: ContextPart[] = [];
	if (setup > 0)
		parts.push({
			id: "setup",
			label: "System & tools",
			detail: "The agent's own",
			tokens: setup,
			tone: "neutral",
			fixed: true,
		});
	parts.push({
		id: "conversation",
		label: "Conversation",
		detail: plural(messages, "message"),
		tokens: conversation,
		tone: "accent",
	});
	if (tools > 0)
		parts.push({
			id: "tools",
			label: "Tool results",
			detail: plural(calls, "call"),
			tokens: tools,
			tone: "violet",
		});
	return parts;
}
