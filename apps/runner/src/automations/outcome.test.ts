import { describe, expect, test } from "bun:test";

import type { ChatEvent } from "../agents/events";
import { automationPrompt, costSoFar, offLimits, runOutcome, touchedOffLimits } from "./outcome";
import { DEFAULT_OPTIONS } from "./store";

const edit = (path: string): ChatEvent => ({
	type: "tool",
	id: path,
	title: `Edit ${path}`,
	status: "completed",
	diffs: [{ path, patch: "", added: 1, removed: 0 }],
});

describe("automation outcome", () => {
	test("the prompt carries its off-limits paths and what to do when done", () => {
		expect(automationPrompt(" Fix it ", DEFAULT_OPTIONS)).toBe("Fix it");
		const prompt = automationPrompt("Fix it", {
			...DEFAULT_OPTIONS,
			offLimits: ["migrations/", ".env"],
			pullRequest: true,
			waitForReview: true,
		});
		expect(prompt).toContain("Do not change these paths: migrations/, .env.");
		expect(prompt).toContain("gh pr create");
		expect(prompt).toContain("stop there");
		expect(automationPrompt("Fix it", { ...DEFAULT_OPTIONS, pullRequest: true })).not.toContain(
			"stop there",
		);
	});
	test("steps, summary and cost come from the last turn", () => {
		const events: ChatEvent[] = [
			{ type: "turn_start" },
			{ type: "message", text: "Earlier reply" },
			{ type: "turn_start" },
			{ type: "tool", id: "a", title: "bun test", status: "running" },
			{ type: "tool", id: "a", output: "running\n214 pass\n" },
			{ type: "tool", id: "b", title: "Edit README.md", status: "failed" },
			{ type: "usage", costUsd: 0.12 },
			{ type: "message", text: "## **All 214 tests passed**\n\nDetails follow." },
			{ type: "usage", costUsd: 0.31 },
		];
		expect(runOutcome(events)).toEqual({
			steps: [
				{ title: "bun test", detail: "214 pass" },
				{ title: "Edit README.md", detail: "failed" },
			],
			summary: "All 214 tests passed",
			costUsd: 0.31,
		});
		expect(costSoFar(events)).toBe(0.31);
		expect(runOutcome([])).toEqual({ steps: [], summary: null, costUsd: null });
	});
	test("off-limits matches folders, files and names anywhere", () => {
		expect(offLimits("migrations/001.sql", ["migrations/"])).toBe(true);
		expect(offLimits("apps/api/.env", [".env"])).toBe(true);
		expect(offLimits("src/migrations/x.ts", ["./migrations"])).toBe(true);
		expect(offLimits("src/main.ts", ["migrations", ".env"])).toBe(false);
		expect(offLimits("src/main.ts", [" "])).toBe(false);
	});
	test("edits to an off-limits path are found, relative to the run's folder", () => {
		const events = [edit("/work/grid/.env"), edit("src/main.ts"), edit("migrations/1.sql")];
		expect(touchedOffLimits(events, [".env", "migrations"], "/work/grid")).toEqual([
			".env",
			"migrations/1.sql",
		]);
		expect(touchedOffLimits(events, [], "/work/grid")).toEqual([]);
	});
});
