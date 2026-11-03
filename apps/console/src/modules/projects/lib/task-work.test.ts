import { describe, expect, it } from "vitest";

import { assigneeValue, ownerFor, statusOnStart, threadsForTask, withoutKey } from "./task-work";

const thread = (title: string, updatedAt = "2026-11-03T10:00:00.000Z") => ({ title, updatedAt });

describe("threadsForTask", () => {
	it("finds the threads started from a task by its key, newest first, and no others", () => {
		const threads = [
			thread("TASK-3: Fix the login", "2026-11-03T09:00:00.000Z"),
			thread("TASK-31: Ship the docs"),
			thread("Follow up on task-3 tests", "2026-11-03T11:00:00.000Z"),
			thread("Plan the release"),
		];
		expect(threadsForTask(threads, "TASK-3").map((item) => item.title)).toEqual([
			"Follow up on task-3 tests",
			"TASK-3: Fix the login",
		]);
	});

	it("reads a thread without the key it starts with", () => {
		expect(withoutKey("TASK-3: Fix the login", "TASK-3")).toBe("Fix the login");
		expect(withoutKey("Plan it", "TASK-3")).toBe("Plan it");
	});
});

describe("assignee", () => {
	const known = ["Claude Code", "Frontend"];

	it("names the owner as the picker shows it", () => {
		expect(assigneeValue({ kind: null, name: "" }, "ada", known)).toBe("none");
		expect(assigneeValue({ kind: "human", name: "Ada" }, "ada", known)).toBe("me");
		expect(assigneeValue({ kind: "human", name: "Grace" }, "ada", known)).toBe("human");
		expect(assigneeValue({ kind: "agent", name: "claude code" }, "ada", known)).toBe(
			"agent:Claude Code",
		);
		expect(assigneeValue({ kind: "agent", name: "backend agent" }, "ada", known)).toBe("agent");
	});

	it("saves what the picker chose", () => {
		expect(ownerFor("none", "ada")).toEqual({ ownerKind: null, ownerName: null });
		expect(ownerFor("me", "ada")).toEqual({ ownerKind: "human", ownerName: "ada" });
		expect(ownerFor("me", null)).toBeNull();
		expect(ownerFor("agent:Frontend", "ada")).toEqual({
			ownerKind: "agent",
			ownerName: "Frontend",
		});
		expect(ownerFor("human", "ada")).toEqual({ ownerKind: "human" });
	});
});

it("moves a task not yet started to In progress when an agent starts on it", () => {
	expect(statusOnStart("backlog")).toBe("in_progress");
	expect(statusOnStart("ready")).toBe("in_progress");
	expect(statusOnStart("review")).toBeNull();
});
