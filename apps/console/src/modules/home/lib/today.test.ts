import { describe, expect, it } from "vitest";

import type { Automation } from "@/modules/automations/services/automations.service";
import type { InboxItem } from "@/modules/inbox";
import type { Task } from "@/modules/projects";

import { greeting, LIMITS, movingTasks, needsYou, ownerLabel, summary, upcoming } from "./today";

const at = (hour: number) => new Date(2026, 9, 1, hour, 0, 0);

const task = (over: Partial<Task>): Task => ({
	key: "T-1",
	number: 1,
	title: "A task",
	description: null,
	status: "in_progress",
	owner: null,
	branch: null,
	position: 0,
	createdAt: "2026-10-01T08:00:00.000Z",
	updatedAt: "2026-10-01T08:00:00.000Z",
	...over,
});

const item = (over: Partial<InboxItem>): InboxItem => ({
	id: "a",
	kind: "approval",
	project: "grid",
	title: "Needs approval",
	body: "Wants to run a command",
	url: "/chat/grid/s1",
	createdAt: "2026-10-01T08:00:00.000Z",
	readAt: null,
	...over,
});

const job = (over: Partial<Automation>): Automation =>
	({
		id: "j",
		name: "Digest",
		enabled: true,
		nextRunAt: "2026-10-01T10:00:00.000Z",
		project: "grid",
		...over,
	}) as Automation;

describe("greeting", () => {
	it("follows the time of day", () => {
		expect(greeting(at(8))).toBe("Good morning");
		expect(greeting(at(12))).toBe("Good afternoon");
		expect(greeting(at(16))).toBe("Good afternoon");
		expect(greeting(at(17))).toBe("Good evening");
	});
});

describe("summary", () => {
	it("says what needs you and what is moving, in the singular when there is one", () => {
		expect(summary(1, 1)).toBe("1 thing needs you · 1 task moving");
		expect(summary(3, 2)).toBe("3 things need you · 2 tasks moving");
	});

	it("says nothing needs you, and leaves out moving work when there is none", () => {
		expect(summary(0, 0)).toBe("Nothing needs you");
		expect(summary(0, 4)).toBe("Nothing needs you · 4 tasks moving");
	});
});

describe("needsYou", () => {
	it("keeps only unread items, newest first, up to the limit", () => {
		const items = [
			item({ id: "old", createdAt: "2026-10-01T07:00:00.000Z" }),
			item({ id: "read", readAt: "2026-10-01T09:00:00.000Z" }),
			item({ id: "new", createdAt: "2026-10-01T09:30:00.000Z" }),
			...Array.from({ length: 6 }, (_, i) =>
				item({ id: `x${i}`, createdAt: "2026-09-30T00:00:00.000Z" }),
			),
		];
		const result = needsYou(items);
		expect(result.map((row) => row.id).slice(0, 2)).toEqual(["new", "old"]);
		expect(result).toHaveLength(LIMITS.needs);
		expect(result.some((row) => row.id === "read")).toBe(false);
	});
});

describe("movingTasks", () => {
	const project = { slug: "grid", name: "grid" };
	it("puts blocked work first, then review and QA, then in progress, newest first within each", () => {
		const entries = [
			{
				project,
				task: task({ number: 1, status: "in_progress", updatedAt: "2026-10-01T08:00:00.000Z" }),
			},
			{ project, task: task({ number: 2, status: "review" }) },
			{ project, task: task({ number: 3, status: "blocked" }) },
			{
				project,
				task: task({ number: 4, status: "in_progress", updatedAt: "2026-10-01T09:00:00.000Z" }),
			},
			{ project, task: task({ number: 5, status: "backlog" }) },
			{ project, task: task({ number: 6, status: "done" }) },
			{ project, task: task({ number: 7, status: "qa" }) },
		];
		expect(movingTasks(entries).map((entry) => entry.task.number)).toEqual([3, 2, 7, 4, 1]);
	});
});

describe("ownerLabel", () => {
	it("names whoever has the task, or says nobody does", () => {
		expect(ownerLabel(task({ owner: { kind: "agent", name: "Claude Code" } }))).toBe("Claude Code");
		expect(ownerLabel(task({ owner: { kind: "agent", name: null } }))).toBe("An agent");
		expect(ownerLabel(task({ owner: { kind: "human", name: null } }))).toBe("Someone");
		expect(ownerLabel(task({ owner: null }))).toBe("Unassigned");
	});
});

describe("upcoming", () => {
	it("keeps enabled jobs with a next run, soonest first", () => {
		const result = upcoming([
			job({ id: "later", nextRunAt: "2026-10-02T09:00:00.000Z" }),
			job({ id: "off", enabled: false }),
			job({ id: "event", nextRunAt: null }),
			job({ id: "soon", nextRunAt: "2026-10-01T09:00:00.000Z" }),
		]);
		expect(result.map((row) => row.id)).toEqual(["soon", "later"]);
	});
});
