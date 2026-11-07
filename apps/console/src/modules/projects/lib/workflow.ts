import {
	type Project,
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type Task,
	type TaskStatus,
	type WorkflowCategory,
	type WorkflowState,
} from "../types/project.types";

/**
 * A project's workflow: its statuses in order, each one board column (after Linear's workflow
 * states). The seven built-ins are always there, since agents move cards by them; a project can
 * rename, reorder and hide them, and add statuses of its own. Mirrors the API's default.
 */
export const DEFAULT_WORKFLOW: readonly WorkflowState[] = [
	{ key: "backlog", name: "Backlog", category: "backlog" },
	{ key: "ready", name: "Todo", category: "unstarted" },
	{ key: "in_progress", name: "In progress", category: "started" },
	{ key: "blocked", name: "Blocked", category: "started", hidden: true },
	{ key: "review", name: "In review", category: "review" },
	{ key: "qa", name: "QA", category: "review", hidden: true },
	{ key: "done", name: "Done", category: "done" },
];

/** The kinds a status can be, in the order a new one is offered them. */
export const CATEGORIES: readonly { value: WorkflowCategory; label: string; hint: string }[] = [
	{ value: "backlog", label: "Backlog", hint: "Not planned yet" },
	{ value: "unstarted", label: "Todo", hint: "Planned, not started" },
	{ value: "started", label: "In progress", hint: "Being worked on" },
	{ value: "review", label: "In review", hint: "Waiting to be checked" },
	{ value: "done", label: "Done", hint: "Finished" },
];

export function workflowOf(project: Pick<Project, "workflow"> | null | undefined): WorkflowState[] {
	return project?.workflow?.length ? project.workflow : [...DEFAULT_WORKFLOW];
}

export function isBuiltIn(key: TaskStatus): boolean {
	return (TASK_STATUSES as readonly string[]).includes(key);
}

/** A status's state, or one made up for a key the workflow has lost (shown, never hidden). */
export function stateOf(workflow: readonly WorkflowState[], key: TaskStatus): WorkflowState {
	return (
		workflow.find((state) => state.key === key) ??
		DEFAULT_WORKFLOW.find((state) => state.key === key) ?? {
			key,
			name: humanize(key),
			category: "backlog",
		}
	);
}

export function statusName(workflow: readonly WorkflowState[], key: TaskStatus): string {
	return stateOf(workflow, key).name;
}

/** A built-in's name for a project whose workflow is not at hand (lists across projects). */
export function defaultStatusName(key: TaskStatus): string {
	return isBuiltIn(key)
		? TASK_STATUS_LABELS[key as keyof typeof TASK_STATUS_LABELS]
		: humanize(key);
}

function humanize(key: string): string {
	const words = key.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The board's columns: the shown states in order, plus a hidden one while a task is in it (so no
 * task is ever out of sight), plus any status a task has that the workflow does not know.
 */
export function boardStates(
	workflow: readonly WorkflowState[],
	tasks: readonly Pick<Task, "status">[],
): WorkflowState[] {
	const used = new Set(tasks.map((task) => task.status));
	const states = workflow.filter((state) => !state.hidden || used.has(state.key));
	for (const key of used)
		if (!workflow.some((state) => state.key === key)) states.push(stateOf(workflow, key));
	return states;
}

/** Where a new task in a status category goes: the first state of that kind the board shows. */
export function firstOf(
	workflow: readonly WorkflowState[],
	category: WorkflowCategory,
): WorkflowState | undefined {
	return workflow.find((state) => state.category === category && !state.hidden);
}

/** A key for a new status from its name, unlike any the workflow already has. */
export function newStateKey(workflow: readonly WorkflowState[], name: string): string {
	const base =
		name
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.replace(/^(\d)/, "s_$1")
			.slice(0, 40) || "status";
	const taken = new Set(workflow.map((state) => state.key));
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Add a status after the last of its kind (or at the end), shown. */
export function addState(
	workflow: readonly WorkflowState[],
	name: string,
	category: WorkflowCategory,
): WorkflowState[] {
	const state: WorkflowState = { key: newStateKey(workflow, name), name: name.trim(), category };
	const order = CATEGORIES.map((item) => item.value);
	let at = workflow.length;
	for (let index = workflow.length - 1; index >= 0; index--) {
		const here = order.indexOf(workflow[index]?.category ?? "backlog");
		if (here <= order.indexOf(category)) {
			at = index + 1;
			break;
		}
		at = index;
	}
	return [...workflow.slice(0, at), state, ...workflow.slice(at)];
}

export function renameState(
	workflow: readonly WorkflowState[],
	key: TaskStatus,
	name: string,
): WorkflowState[] {
	return workflow.map((state) => (state.key === key ? { ...state, name: name.trim() } : state));
}

/** Hide or show a status's column. The last shown one stays. */
export function setHidden(
	workflow: readonly WorkflowState[],
	key: TaskStatus,
	hidden: boolean,
): WorkflowState[] {
	const shown = workflow.filter((state) => !state.hidden && state.key !== key);
	if (hidden && shown.length === 0) return [...workflow];
	return workflow.map((state) => {
		if (state.key !== key) return state;
		if (hidden) return { ...state, hidden: true };
		const { hidden: _gone, ...rest } = state;
		return rest;
	});
}

/** Move a status one place left (-1) or right (1) among the shown ones. */
export function moveState(
	workflow: readonly WorkflowState[],
	key: TaskStatus,
	by: -1 | 1,
): WorkflowState[] {
	const list = [...workflow];
	const from = list.findIndex((state) => state.key === key);
	if (from < 0) return list;
	let to = from + by;
	while (to >= 0 && to < list.length && list[to]?.hidden) to += by;
	if (to < 0 || to >= list.length) return list;
	const [state] = list.splice(from, 1);
	if (state) list.splice(to, 0, state);
	return list;
}

/** Take out a status of the project's own; the API moves its tasks to Backlog. */
export function removeState(workflow: readonly WorkflowState[], key: TaskStatus): WorkflowState[] {
	if (isBuiltIn(key)) return [...workflow];
	return workflow.filter((state) => state.key !== key);
}
