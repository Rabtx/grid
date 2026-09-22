import { describe, expect, it } from "vitest";

import { TASK_STATUSES, type Task } from "../types/project.types";
import { groupByStatus } from "./board";

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
