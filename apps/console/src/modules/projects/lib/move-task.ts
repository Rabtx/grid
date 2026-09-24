import type { Task, TaskStatus } from "../types/project.types";

/**
 * Where a task lands when it is appended to a stage: after the highest position already there,
 * or 0 when the stage is empty. Reordering inside a stage is out of scope.
 */
export function nextPosition(tasks: Task[], status: TaskStatus): number {
	let highest = -1;
	for (const task of tasks) {
		if (task.status === status && task.position > highest) highest = task.position;
	}
	return highest + 1;
}

/**
 * The board as it would look with one task moved to another stage: a new array in which that
 * task carries the new status and the target stage's next position, and every other task is
 * untouched. Moving a task to the stage it is already in — or naming a task that is not there —
 * returns the same array so callers can skip the work.
 */
export function applyMove(tasks: Task[], number: number, status: TaskStatus): Task[] {
	const moving = tasks.find((task) => task.number === number);
	if (!moving || moving.status === status) return tasks;
	const position = nextPosition(tasks, status);
	return tasks.map((task) => (task.number === number ? { ...task, status, position } : task));
}
