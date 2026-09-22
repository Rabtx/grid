import type { Task, TaskOwnerKind, TaskStatus, UpdateTaskInput } from "../types/project.types";

export type TaskFormValues = {
	title: string;
	description: string;
	status: TaskStatus;
	ownerKind: TaskOwnerKind;
	ownerName: string;
	branch: string;
	position: string;
};

/** Unowned tasks default to the agent kind so assigning one matches the quick-add form. */
export function toTaskFormValues(task: Task): TaskFormValues {
	return {
		title: task.title,
		description: task.description ?? "",
		status: task.status,
		ownerKind: task.owner?.kind ?? "agent",
		ownerName: task.owner?.name ?? "",
		branch: task.branch ?? "",
		position: String(task.position),
	};
}

/** Returns a safe integer the API accepts, or null when the field is not valid yet. */
export function parsePosition(position: string): number | null {
	const trimmed = position.trim();
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || String(parsed) !== trimmed) return null;
	if (parsed < 0 || parsed > 1_000_000) return null;
	return parsed;
}

export function buildUpdateTaskInput(values: TaskFormValues): UpdateTaskInput {
	const title = values.title.trim();
	const description = values.description.trim();
	const ownerName = values.ownerName.trim();
	const branch = values.branch.trim();
	const position = parsePosition(values.position);
	return {
		title,
		description: description ? description : null,
		status: values.status,
		ownerKind: ownerName ? values.ownerKind : null,
		ownerName: ownerName ? ownerName : null,
		branch: branch ? branch : null,
		...(position === null ? {} : { position }),
	};
}
