import { describe, expect, it } from "vitest";

import { TASK_STATUSES, type Task } from "../types/project.types";
import {
	BOARD_LANES,
	doneByDay,
	filterTasks,
	laneOf,
	laneStatus,
	ownedBy,
	groupByOwner,
	groupByStatus,
	ownerKey,
	ownerLabel,
	ownerOptions,
} from "./board";

function task(overrides: Partial<Task> & Pick<Task, "number" | "status">): Task {
	return {
		key: `GRID-${overrides.number}`,
		title: `Task ${overrides.number}`,
		description: null,
		owner: null,
		branch: null,
		position: overrides.number,
		createdAt: "2026-09-22T00:00:00.000Z",
		updatedAt: "2026-09-22T00:00:00.000Z",
		...overrides,
	};
}

describe("groupByStatus", () => {
	it("returns every stage even when the board is empty", () => {
		const columns = groupByStatus([]);
		expect(Object.keys(columns)).toEqual([...TASK_STATUSES]);
		expect(Object.values(columns).every((column) => column.length === 0)).toBe(true);
	});

	it("buckets tasks into their own stage", () => {
		const columns = groupByStatus([
			task({ number: 1, status: "backlog" }),
			task({ number: 2, status: "done" }),
			task({ number: 3, status: "backlog" }),
		]);
		expect(columns.backlog.map((t) => t.number)).toEqual([1, 3]);
		expect(columns.done.map((t) => t.number)).toEqual([2]);
		expect(columns.review).toEqual([]);
	});

	it("preserves the order the API returned", () => {
		const columns = groupByStatus([
			task({ number: 9, status: "ready" }),
			task({ number: 2, status: "ready" }),
		]);
		expect(columns.ready.map((t) => t.number)).toEqual([9, 2]);
	});

	it("ignores a status the client does not know about", () => {
		const columns = groupByStatus([
			task({ number: 1, status: "archived" as Task["status"] }),
			task({ number: 2, status: "qa" }),
		]);
		expect(columns.qa.map((t) => t.number)).toEqual([2]);
		expect(Object.values(columns).flat()).toHaveLength(1);
	});
});

describe("filterTasks", () => {
	const tasks = [
		task({
			number: 1,
			status: "backlog",
			key: "GRID-17",
			title: "Launch checklist",
			owner: { kind: "human", name: "Avery" },
		}),
		task({ number: 2, status: "ready", key: "GRID-8", title: "Fix parser", owner: null }),
		task({
			number: 3,
			status: "done",
			owner: { kind: "agent", name: null },
		}),
	];

	it("matches trimmed titles and keys without case sensitivity", () => {
		expect(filterTasks(tasks, { query: "  LAUNCH ", owner: "all" })).toEqual([tasks[0]]);
		expect(filterTasks(tasks, { query: " grid-8 ", owner: "all" })).toEqual([tasks[1]]);
	});

	it("matches all tasks for an empty query and all owners", () => {
		expect(filterTasks(tasks, { query: "  ", owner: "all" })).toEqual(tasks);
	});

	it("filters by owner keys and unassigned tasks", () => {
		expect(filterTasks(tasks, { query: "", owner: "human:Avery" })).toEqual([tasks[0]]);
		expect(filterTasks(tasks, { query: "", owner: "agent:agent" })).toEqual([tasks[2]]);
		expect(filterTasks(tasks, { query: "", owner: "unassigned" })).toEqual([tasks[1]]);
	});
});

describe("task owners", () => {
	it("derives stable owner keys and labels", () => {
		const unassigned = task({ number: 1, status: "backlog", owner: null });
		const namedHuman = task({
			number: 2,
			status: "backlog",
			owner: { kind: "human", name: "Avery" },
		});
		const unnamedAgent = task({
			number: 3,
			status: "backlog",
			owner: { kind: "agent", name: null },
		});

		expect(ownerKey(unassigned)).toBe("unassigned");
		expect(ownerLabel(unassigned)).toBe("Unassigned");
		expect(ownerKey(namedHuman)).toBe("human:Avery");
		expect(ownerLabel(namedHuman)).toBe("Avery");
		expect(ownerKey(unnamedAgent)).toBe("agent:agent");
		expect(ownerLabel(unnamedAgent)).toBe("Agent");
		expect(
			ownerLabel(task({ number: 4, status: "backlog", owner: { kind: "human", name: null } })),
		).toBe("Human");
	});
});

describe("groupByOwner", () => {
	it("orders unassigned, humans, then agents and preserves task order", () => {
		const lanes = groupByOwner([
			task({ number: 1, status: "ready", owner: { kind: "agent", name: "Zoe" } }),
			task({ number: 2, status: "backlog", owner: null }),
			task({ number: 3, status: "done", owner: { kind: "human", name: "Zoe" } }),
			task({ number: 4, status: "review", owner: { kind: "human", name: "Avery" } }),
			task({ number: 5, status: "qa", owner: { kind: "human", name: "Avery" } }),
			task({ number: 6, status: "blocked", owner: { kind: "agent", name: "Blake" } }),
		]);

		expect(lanes.map((lane) => lane.id)).toEqual([
			"unassigned",
			"human:Avery",
			"human:Zoe",
			"agent:Blake",
			"agent:Zoe",
		]);
		expect(lanes[0].title).toBe("Unassigned");
		expect(lanes[1].tasks.map((item) => item.number)).toEqual([4, 5]);
	});

	it("omits unassigned when it has no tasks", () => {
		const lanes = groupByOwner([
			task({ number: 1, status: "backlog", owner: { kind: "agent", name: "Blake" } }),
		]);
		expect(lanes.map((lane) => lane.id)).toEqual(["agent:Blake"]);
	});
});

describe("ownerOptions", () => {
	it("includes fixed choices and one ordered option per distinct owner", () => {
		const options = ownerOptions([
			task({ number: 1, status: "backlog", owner: { kind: "agent", name: "Zoe" } }),
			task({ number: 2, status: "backlog", owner: { kind: "human", name: "Zoe" } }),
			task({ number: 3, status: "backlog", owner: { kind: "human", name: "Avery" } }),
			task({ number: 4, status: "backlog", owner: { kind: "human", name: "Avery" } }),
			task({ number: 5, status: "backlog", owner: null }),
		]);

		expect(options).toEqual([
			{ value: "all", label: "All owners" },
			{ value: "unassigned", label: "Unassigned" },
			{ value: "human:Avery", label: "Avery" },
			{ value: "human:Zoe", label: "Zoe" },
			{ value: "agent:Zoe", label: "Zoe" },
		]);
	});
});

describe("the board's columns", () => {
	const task = (status: Task["status"], over: Partial<Task> = {}): Task => ({
		key: "TASK-1",
		number: 1,
		title: "A task",
		description: null,
		status,
		owner: null,
		branch: null,
		position: 0,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		...over,
	});

	it("puts every stage in one of four columns, and a dropped task takes the column's first", () => {
		expect(
			(["backlog", "ready", "in_progress", "blocked", "review", "qa", "done"] as const).map(laneOf),
		).toEqual(["todo", "todo", "doing", "doing", "review", "review", "done"]);
		expect(BOARD_LANES.map((lane) => laneStatus(lane.id))).toEqual([
			"ready",
			"in_progress",
			"review",
			"done",
		]);
		expect(laneStatus("human:Sam")).toBeNull();
	});

	it("knows what agents hold and what is yours", () => {
		const agent = task("ready", { owner: { kind: "agent", name: "claude" } });
		const mine = task("ready", { owner: { kind: "human", name: "Person" } });
		expect(ownedBy(agent, "agents", "person")).toBe(true);
		expect(ownedBy(mine, "agents", "person")).toBe(false);
		expect(ownedBy(mine, "me", "person")).toBe(true);
		expect(ownedBy(mine, "me", null)).toBe(false);
		expect(ownedBy(agent, "agent:claude", null)).toBe(true);
	});

	it("counts finished tasks per day, oldest first", () => {
		const now = new Date("2026-10-02T12:00:00");
		const counts = doneByDay(
			[
				task("done", { updatedAt: new Date("2026-10-02T09:00:00").toISOString() }),
				task("done", { updatedAt: new Date("2026-10-01T09:00:00").toISOString() }),
				task("done", { updatedAt: new Date("2026-09-01T09:00:00").toISOString() }),
				task("ready", { updatedAt: new Date("2026-10-02T09:00:00").toISOString() }),
			],
			now,
		);
		expect(counts).toEqual([0, 0, 0, 0, 0, 1, 1]);
	});
});
