import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../types/project.types";
import { groupByStatus } from "./board";

function task(number: number, status: TaskStatus, position = number): Task {
	return {
		key: `TASK-${number}`,
		number,
		title: `Task ${number}`,
		description: null,
		status,
		owner: null,
		branch: null,
		position,
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
	};
}

describe("groupByStatus", () => {
	it("keeps every stage present when there is no work in it", () => {
		const columns = groupByStatus([]);
		expect(Object.keys(columns)).toEqual([
			"backlog",
			"ready",
			"in_progress",
			"review",
			"qa",
			"blocked",
			"done",
		]);
		expect(Object.values(columns).every((column) => column.length === 0)).toBe(true);
	});

	it("files each task under its own stage", () => {
		const columns = groupByStatus([task(1, "backlog"), task(2, "review"), task(3, "backlog")]);
		expect(columns.backlog.map((t) => t.key)).toEqual(["TASK-1", "TASK-3"]);
		expect(columns.review.map((t) => t.key)).toEqual(["TASK-2"]);
		expect(columns.done).toEqual([]);
	});

	it("preserves the order the api returned", () => {
		const columns = groupByStatus([task(9, "ready", 1), task(4, "ready", 2)]);
		expect(columns.ready.map((t) => t.key)).toEqual(["TASK-9", "TASK-4"]);
	});

	it("ignores a stage the api does not know about", () => {
		const rogue = { ...task(1, "backlog"), status: "archived" as TaskStatus };
		expect(() => groupByStatus([rogue])).not.toThrow();
		expect(Object.values(groupByStatus([rogue])).flat()).toEqual([]);
	});
});
