import type { ContextPart } from "@/kit";

import type { Block } from "./transcript";

/** About four characters to a token, as most tokenizers come out on code and English. */
const CHARS_PER_TOKEN = 4;

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/**
 * What fills a thread's context, estimated: agents report only the total, so the thread's own text
 * is sized (its messages, and its tool calls with what they returned) and the rest of the total is
 * the agent's setup (its instructions and tool definitions). After a compact the thread's text is
 * more than the context holds; it is scaled down to fit, setup then being too small to tell.
 */
export function contextSplit(blocks: readonly Block[], used: number): ContextPart[] {
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
	const setup = used - conversation - tools;
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
