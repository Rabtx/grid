import { describe, expect, it } from "vitest";

import { TASK_STATUSES, type Task } from "../types/project.types";
import {
	filterTasks,
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
