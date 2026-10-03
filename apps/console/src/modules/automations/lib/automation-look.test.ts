import { describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS, type Automation } from "../services/automations.service";
import {
	nextLine,
	runDuration,
	runMark,
	stepKind,
	stripMarks,
	stripNote,
	triggerLine,
	triggerRecipe,
	whenWord,
} from "./automation-look";

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime();
const item = (patch: Partial<Automation>): Automation => ({
	id: "a",
	workspace: "w",
	ownerId: "o",
	name: "Nightly",
	prompt: "Test",
	provider: "claude",
	model: null,
	effort: null,
	mode: null,
	project: "grid",
	workspaceMode: "folder",
	enabled: true,
	triggers: [{ kind: "schedule", cadence: "daily", time: "02:00", timezone: "UTC" }],
	options: { ...DEFAULT_OPTIONS },
	nextRunAt: null,
	createdAt: "",
	updatedAt: "",
	...patch,
});

describe("automation look", () => {
	it("says when it runs in a word, and in a line", () => {
		const now = at(3, 15);
		const tonight = item({ nextRunAt: new Date(at(4, 2)).toISOString() });
		expect(whenWord(tonight, now)).toBe("Tonight");
		expect(nextLine(tonight, now)).toBe("Next run tonight at 02:00");
		expect(whenWord(item({ nextRunAt: new Date(at(4, 9)).toISOString() }), now)).toBe("Tomorrow");
		expect(whenWord(item({ nextRunAt: new Date(at(6, 9)).toISOString() }), now)).toMatch(/^\w{3}$/);
		expect(whenWord(item({ enabled: false }), now)).toBe("Paused");
		const github = item({
			triggers: [{ kind: "event", event: "pull_opened" }],
			recent: [
				{ status: "succeeded", pullNumber: null, startedAt: new Date(at(3, 9)).toISOString() },
				{ status: "failed", pullNumber: null, startedAt: new Date(at(2, 9)).toISOString() },
			],
		});
		expect(whenWord(github, now)).toBe("1 today");
	});
	it("reads triggers as the panel's line and the recipe's sentence", () => {
		expect(triggerLine({ kind: "event", event: "pull_opened" })).toBe("When a PR is opened");
		expect(
			triggerLine({ kind: "schedule", cadence: "weekly", day: 1, time: "09:00", timezone: "UTC" }),
		).toBe("Mondays at 09:00");
		expect(
			triggerRecipe({ kind: "schedule", cadence: "daily", time: "02:00", timezone: "UTC" }),
		).toEqual({ lead: "Every", token: "day at 02:00" });
	});
	it("marks runs, fills the strip and counts how they went", () => {
		expect(runMark({ status: "succeeded", pullNumber: 4 })).toBe("pr");
		expect(runMark({ status: "succeeded", pullNumber: null })).toBe("passed");
		const recent = [
			{ status: "succeeded" as const, pullNumber: 4, startedAt: null },
			{ status: "failed" as const, pullNumber: null, startedAt: null },
			{ status: "succeeded" as const, pullNumber: null, startedAt: null },
			{ status: "succeeded" as const, pullNumber: null, startedAt: null },
		];
		expect(stripMarks(recent)).toHaveLength(28);
		expect(stripMarks(recent).slice(0, 5)).toEqual(["pr", "failed", "passed", "passed", "empty"]);
		expect(stripNote(recent)).toBe("75% passed · 1 PR");
		expect(stripNote([])).toBeUndefined();
	});
	it("gives durations and step glyphs", () => {
		expect(
			runDuration({ startedAt: "2026-10-03T02:00:00Z", finishedAt: "2026-10-03T02:03:05Z" }),
		).toBe("3m 05s");
		expect(runDuration({ startedAt: "2026-10-03T02:00:00Z", finishedAt: null })).toBe("—");
		expect(stepKind("git pull origin main", null)).toBe("branch");
		expect(stepKind("bun test", "214 pass")).toBe("terminal");
		expect(stepKind("Edit src/eta.ts", null)).toBe("code");
		expect(stepKind("grep -rn eta", null)).toBe("search");
		expect(stepKind("bun test", "failed")).toBe("failed");
	});
});
