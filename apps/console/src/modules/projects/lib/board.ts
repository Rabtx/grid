import {
	TASK_STATUSES,
	type Task,
	type TaskOwnerKind,
	type TaskStatus,
} from "../types/project.types";

export type BoardColumns = Record<TaskStatus, Task[]>;
export type OwnerOption = { value: string; label: string };
export type OwnerLane = { id: string; title: string; tasks: Task[] };

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

export function filterTasks(tasks: Task[], filters: { query: string; owner: string }): Task[] {
	const query = filters.query.trim().toLowerCase();
	return tasks.filter((task) => {
		const matchesQuery =
			query.length === 0 ||
			task.title.toLowerCase().includes(query) ||
			task.key.toLowerCase().includes(query);
		const matchesOwner = filters.owner === "all" || ownerKey(task) === filters.owner;
		return matchesQuery && matchesOwner;
	});
}

export function ownerKey(task: Task): string {
	if (!task.owner) return "unassigned";
	return `${task.owner.kind}:${task.owner.name ?? task.owner.kind}`;
}

export function ownerLabel(task: Task): string {
	if (!task.owner) return "Unassigned";
	return task.owner.name ?? (task.owner.kind === "human" ? "Human" : "Agent");
}

export function groupByOwner(tasks: Task[]): OwnerLane[] {
	const lanes = new Map<
		string,
		{ id: string; title: string; kind: TaskOwnerKind | null; tasks: Task[] }
	>();

	for (const task of tasks) {
		const id = ownerKey(task);
		const lane = lanes.get(id);
		if (lane) {
			lane.tasks.push(task);
			continue;
		}
		lanes.set(id, {
			id,
			title: ownerLabel(task),
			kind: task.owner?.kind ?? null,
			tasks: [task],
		});
	}

	return [...lanes.values()]
		.sort((left, right) => {
			if (left.kind === null || right.kind === null) {
				if (left.kind === right.kind) return 0;
				return left.kind === null ? -1 : 1;
			}
			if (left.kind !== right.kind) return left.kind === "human" ? -1 : 1;
			return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
		})
		.map(({ id, title, tasks }) => ({ id, title, tasks }));
}

export function ownerOptions(tasks: Task[]): OwnerOption[] {
	return [
		{ value: "all", label: "All owners" },
		{ value: "unassigned", label: "Unassigned" },
		...groupByOwner(tasks)
			.filter((lane) => lane.id !== "unassigned")
			.map((lane) => ({ value: lane.id, label: lane.title })),
	];
}
