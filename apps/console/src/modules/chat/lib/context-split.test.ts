import { describe, expect, it } from "vitest";

import { contextUsage } from "./context-split";
import type { Block } from "./transcript";

const blocks: Block[] = [
	{ kind: "user", key: "u", text: "a".repeat(400) },
	{ kind: "assistant", key: "a", text: "b".repeat(400) },
	{
		kind: "tool",
		key: "t",
		id: "t",
		title: "Read",
		tool: "read",
		status: "completed",
		output: "c".repeat(2000),
	},
];

describe("contextUsage", () => {
	it("sizes the thread's text and leaves the rest of the total to the agent's setup", () => {
		const { parts, estimated } = contextUsage(blocks, 10_000);
		expect(estimated).toBe(false);
		expect(parts.map((part) => [part.id, part.tokens, part.detail])).toEqual([
			["setup", 9300, "The agent's own"],
			["conversation", 200, "2 messages"],
			["tools", 500, "1 call"],
		]);
	});

	it("scales the thread's text down to the total after a compact, with no setup left", () => {
		const { parts } = contextUsage(blocks, 350);
		expect(parts.map((part) => part.id)).toEqual(["conversation", "tools"]);
		expect(parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(350);
		expect(parts[0]?.tokens).toBe(100);
	});

	it("sizes the thread's own text when the agent reports no total", () => {
		const usage = contextUsage(blocks);
		expect(usage).toMatchObject({ used: 700, estimated: true });
		expect(usage.parts.map((part) => part.id)).toEqual(["conversation", "tools"]);
	});

	it("never estimates more than the agent says it read and wrote", () => {
		const usage = contextUsage(blocks, undefined, 400);
		expect(usage.used).toBe(400);
		expect(usage.parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(400);
	});

	it("has nothing to show for an empty thread", () => {
		expect(contextUsage([])).toEqual({ used: 0, estimated: true, parts: [] });
	});
});
