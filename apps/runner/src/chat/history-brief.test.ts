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
			"Person: Round drive times\nYou: Done.\nFiles changed: src/job-card.ts",
		);
		expect(brief?.indexOf("What does this do?")).toBeLessThan(brief?.indexOf("Round drive") ?? 0);
	});

	it("keeps the first request and the newest turns when the budget runs out", () => {
		const events = [1, 2, 3, 4].flatMap((n) => turn(`question ${n}`, "x".repeat(100)));
		const brief = historyBrief(events, { budget: 300 }) ?? "";
		expect(brief).toContain("question 1");
		expect(brief).toContain("question 4");
		expect(brief).not.toContain("question 2");
		expect(brief).toContain("(2 earlier turns left out.)");
		// In order: the first request, the gap, then the newest.
		expect(brief.indexOf("question 1")).toBeLessThan(brief.indexOf("left out"));
		expect(brief.indexOf("left out")).toBeLessThan(brief.indexOf("question 4"));
	});

	it("names the turns left out so the agent can read them with thread_read", () => {
		const events = [1, 2, 3, 4, 5].flatMap((n) => turn(`question ${n}`, "x".repeat(100)));
		const brief = historyBrief(events, { budget: 300, thread: "t-1" }) ?? "";
		expect(brief).toContain(
			`(Turns 2–4 left out. Read them with Grid's thread_read tool: thread "t-1", from turn 2.)`,
		);
	});

	it("leaves out a first request too long to keep, rather than the newest turns", () => {
		const events = [...turn("y".repeat(400), "ok"), ...turn("latest", "fine")];
		const brief = historyBrief(events, { budget: 300 }) ?? "";
		expect(brief).toContain("latest");
		expect(brief).not.toContain("yyyy");
	});

	it("tells commands run, and work from turns that were stopped or failed", () => {
		const brief =
			historyBrief([
				{ type: "user", text: "Fix the build" },
				{ type: "turn_start" },
				{
					type: "tool",
					id: "c1",
					kind: "execute",
					title: "Run",
					input: "bun test",
					status: "pending",
				},
				{ type: "tool", id: "c1", status: "failed" },
				{ type: "message", text: "Half done" },
				{ type: "turn_end", reason: "cancelled" },
				{ type: "user", text: "Try again" },
				{ type: "turn_start" },
				{ type: "turn_end", reason: "error", error: "Overloaded" },
			]) ?? "";
		expect(brief).toContain("Commands: `bun test` (failed)");
		expect(brief).toContain("You: Half done\n(This turn was stopped before it finished.)");
		expect(brief).toContain("(This turn failed: Overloaded)");
	});

	it("tells only the turns after `after`, for an agent handed a thread back", () => {
		const events = [1, 2, 3].flatMap((n) => turn(`question ${n}`, "ok"));
		const brief = historyBrief(events, { after: 2 }) ?? "";
		expect(brief).toContain("question 3");
		expect(brief).not.toContain("question 2");
	});

	it("names who a message came from when the person did not type it", () => {
		const brief =
			historyBrief([
				{ type: "user", text: "Continue", origin: { kind: "grid", reason: "restart" } },
				{
					type: "user",
					text: "Check auth",
					origin: { kind: "agent", thread: { id: "a", title: "Lead" } },
				},
			]) ?? "";
		expect(brief).toContain("Grid: Continue");
		expect(brief).toContain('The agent in "Lead": Check auth');
	});

	it("is null for a thread with nothing earlier", () => {
		expect(historyBrief([])).toBeNull();
		expect(historyBrief([{ type: "turn_start" }])).toBeNull();
	});
});
