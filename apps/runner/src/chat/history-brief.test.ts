import { describe, expect, it } from "bun:test";

import type { ChatEvent } from "../agents/events";
import { historyBrief } from "./history-brief";

const turn = (asked: string, replied: string, files: string[] = []): ChatEvent[] => [
	{ type: "user", text: asked },
	{ type: "turn_start" },
	{ type: "message", text: replied.slice(0, 3) },
	{ type: "message", text: replied.slice(3) },
	...(files.length
		? [
				{
					type: "tool" as const,
					id: "t",
					diffs: files.map((path) => ({ path, patch: "", added: 1, removed: 0 })),
				},
			]
		: []),
	{ type: "turn_end", reason: "done" },
];

describe("historyBrief", () => {
	it("tells each earlier turn, oldest first, with the files changed", () => {
		const brief = historyBrief([
			...turn("What does this do?", "It schedules jobs."),
			...turn("Round drive times", "Done.", ["src/job-card.ts"]),
		]);
		expect(brief).toContain("no memory of it");
		expect(brief).toContain("Person: What does this do?\nYou: It schedules jobs.");
		expect(brief).toContain(
			"Person: Round drive times\nYou: Done.\nFiles you changed: src/job-card.ts",
		);
		expect(brief?.indexOf("What does this do?")).toBeLessThan(brief?.indexOf("Round drive") ?? 0);
	});

	it("keeps the newest turns when the budget runs out, and says how many were left out", () => {
		const events = [1, 2, 3, 4].flatMap((n) => turn(`question ${n}`, "x".repeat(100)));
		const brief = historyBrief(events, 300);
		expect(brief).toContain("question 4");
		expect(brief).not.toContain("question 1");
		expect(brief).toMatch(/\(\d earlier turns? left out\.\)/);
	});

	it("is null for a thread with nothing earlier", () => {
		expect(historyBrief([])).toBeNull();
		expect(historyBrief([{ type: "turn_start" }])).toBeNull();
	});
});
