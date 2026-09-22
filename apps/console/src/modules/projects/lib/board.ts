import { TASK_STATUSES, type Task, type TaskStatus } from "../types/project.types";

export type BoardColumns = Record<TaskStatus, Task[]>;

/**
 * Buckets tasks into one column per workflow stage, preserving the order the API
 * returned them in (position, then task number). Every stage is present even when
 * empty, so the board always renders the full workflow rather than only the
 * stages that happen to have work in them.
 */
export function groupByStatus(tasks: Task[]): BoardColumns {
	const columns = Object.fromEntries(
		TASK_STATUSES.map((status) => [status, [] as Task[]]),
	) as BoardColumns;
	for (const task of tasks) {
		const column = columns[task.status];
		if (column) column.push(task);
	}
	return columns;
}
