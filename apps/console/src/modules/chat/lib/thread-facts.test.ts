import { describe, expect, it } from "vitest";

import { threadFacts } from "./thread-facts";
import type { Block } from "./transcript";

describe("threadFacts", () => {
	it("sums each file's changes, the time worked and what is waiting", () => {
		const blocks: Block[] = [
			{
				kind: "user",
				key: "u1",
				text: "go",
				startedAt: "2026-10-02T10:00:00.000Z",
				endedAt: "2026-10-02T10:01:12.000Z",
				outcome: "done",
			},
			{
				kind: "tool",
				key: "t1",
				id: "t1",
				title: "Edit a.ts",
				tool: "edit",
				status: "completed",
				diffs: [{ path: "a.ts", patch: "", added: 3, removed: 1 }],
			},
			{
				kind: "tool",
				key: "t2",
				id: "t2",
				title: "Edit a.ts",
				tool: "edit",
				status: "completed",
				diffs: [
					{ path: "a.ts", patch: "", added: 1, removed: 0 },
					{ path: "b.ts", patch: "", added: 28, removed: 0 },
				],
			},
			{ kind: "approval", key: "a1", id: "a1", title: "Push", options: [] },
		];
		expect(threadFacts(blocks)).toEqual({
			files: [
				{ path: "a.ts", added: 4, removed: 1 },
				{ path: "b.ts", added: 28, removed: 0 },
			],
			added: 32,
			removed: 1,
			workedMs: 72_000,
			waiting: true,
			failed: false,
		});
	});
});
