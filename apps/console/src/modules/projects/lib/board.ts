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

export function filterTasks(
	tasks: Task[],
	filters: { query: string; owner: string; me?: string | null },
): Task[] {
	const query = filters.query.trim().toLowerCase();
	return tasks.filter((task) => {
		const matchesQuery =
			query.length === 0 ||
			task.title.toLowerCase().includes(query) ||
			task.key.toLowerCase().includes(query);
		const matchesOwner = ownedBy(task, filters.owner, filters.me ?? null);
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

/**
 * The board's four columns (Figma 12 · Board) and the stages each holds: waiting work, work
 * under way (or stuck), work to look at, and what is finished. A task dropped on a column takes
 * its first stage.
 */
export const BOARD_LANES = [
	{ id: "todo", title: "Todo", short: "Todo", statuses: ["ready", "backlog"] },
	{ id: "doing", title: "In progress", short: "Doing", statuses: ["in_progress", "blocked"] },
	{ id: "review", title: "In review", short: "Review", statuses: ["review", "qa"] },
	{ id: "done", title: "Done", short: "Done", statuses: ["done"] },
] as const satisfies readonly {
	id: string;
	title: string;
	short: string;
	statuses: readonly TaskStatus[];
}[];

export type BoardLaneId = (typeof BOARD_LANES)[number]["id"];

/** Which column a stage sits in. */
export function laneOf(status: TaskStatus): BoardLaneId {
	return (
		BOARD_LANES.find((lane) => (lane.statuses as readonly TaskStatus[]).includes(status))?.id ??
		"todo"
	);
}

/** The stage a task takes when it is dropped on (or added to) a column. */
export function laneStatus(lane: string): TaskStatus | null {
	const found = BOARD_LANES.find((item) => item.id === lane);
	return found ? found.statuses[0] : null;
}

/**
 * The board's own views of who has a task: everything, what agents hold, and what is yours.
 * Any other value is one owner (`human:Sam`, `agent:claude`) or `unassigned`.
 */
export function ownedBy(task: Task, owner: string, me: string | null): boolean {
	if (owner === "all") return true;
	if (owner === "agents") return task.owner?.kind === "agent";
	if (owner === "me")
		return (
			task.owner?.kind === "human" &&
			me !== null &&
			(task.owner.name ?? "").toLowerCase() === me.toLowerCase()
		);
	return ownerKey(task) === owner;
}

/**
 * Done tasks per calendar day for the last `days` days, oldest first, by when each was last
 * changed — the closest the API comes to when it was finished, so the board says "touched".
 */
export function doneByDay(tasks: readonly Task[], now: Date, days = 7): number[] {
	const keys: string[] = [];
	for (let back = days - 1; back >= 0; back--) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
		keys.push(day.toDateString());
	}
	const counts = keys.map(() => 0);
	for (const task of tasks) {
		if (task.status !== "done") continue;
		const index = keys.indexOf(new Date(task.updatedAt).toDateString());
		if (index >= 0) counts[index] += 1;
	}
	return counts;
}
