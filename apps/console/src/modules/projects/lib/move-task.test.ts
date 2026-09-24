import { describe, expect, it } from "vitest";

import type { Task } from "../types/project.types";
import { applyMove, nextPosition } from "./move-task";

function task(overrides: Partial<Task> & Pick<Task, "number" | "status">): Task {
	return {
		key: `GRID-${overrides.number}`,
		title: `Task ${overrides.number}`,
		description: null,
		owner: null,
		branch: null,
		position: 0,
		createdAt: "2026-09-22T00:00:00.000Z",
		updatedAt: "2026-09-22T00:00:00.000Z",
		...overrides,
	};
}

describe("nextPosition", () => {
	it("starts an empty stage at 0", () => {
		expect(nextPosition([], "in_progress")).toBe(0);
		expect(nextPosition([task({ number: 1, status: "backlog", position: 3 })], "ready")).toBe(0);
	});

	it("appends after the highest position in the target stage", () => {
		const tasks = [
			task({ number: 1, status: "review", position: 0 }),
			task({ number: 2, status: "review", position: 5 }),
			task({ number: 3, status: "review", position: 2 }),
		];
		expect(nextPosition(tasks, "review")).toBe(6);
	});

	it("ignores positions in the other stages", () => {
		const tasks = [
			task({ number: 1, status: "done", position: 9 }),
			task({ number: 2, status: "blocked", position: 4 }),
		];
		expect(nextPosition(tasks, "blocked")).toBe(5);
	});

	it("is count-independent: gaps and duplicate positions still append", () => {
		const tasks = [
			task({ number: 1, status: "qa", position: 0 }),
			task({ number: 2, status: "qa", position: 0 }),
		];
		expect(nextPosition(tasks, "qa")).toBe(1);
	});
});

describe("applyMove", () => {
	const backlogTask = task({ number: 1, status: "backlog", position: 0 });
	const reviewTask = task({ number: 2, status: "review", position: 4 });

	it("moves the task to the target stage at its next position", () => {
		const moved = applyMove([backlogTask, reviewTask], 1, "review");
		expect(moved[0]).toMatchObject({ number: 1, status: "review", position: 5 });
	});

	it("lands first in an empty stage", () => {
		const moved = applyMove([backlogTask], 1, "done");
		expect(moved[0]).toMatchObject({ number: 1, status: "done", position: 0 });
	});

	it("leaves every other task identical and does not mutate the input", () => {
		const tasks = [backlogTask, reviewTask];
		const moved = applyMove(tasks, 1, "review");
		expect(moved[1]).toBe(reviewTask);
		expect(tasks[0].status).toBe("backlog");
		expect(tasks[0].position).toBe(0);
	});

	it("returns the same array when the task is already in that stage", () => {
		const tasks = [backlogTask, reviewTask];
		expect(applyMove(tasks, 2, "review")).toBe(tasks);
	});

	it("returns the same array when the task is not on the board", () => {
		const tasks = [backlogTask, reviewTask];
		expect(applyMove(tasks, 99, "done")).toBe(tasks);
	});
});
