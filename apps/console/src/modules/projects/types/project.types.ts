export const TASK_STATUSES = [
	"backlog",
	"ready",
	"in_progress",
	"review",
	"qa",
	"blocked",
	"done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskOwnerKind = "human" | "agent";

/** Column headings for the board, in workflow order. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
	backlog: "Backlog",
	ready: "Ready",
	in_progress: "In progress",
	review: "Review",
	qa: "QA",
	blocked: "Blocked",
	done: "Done",
};

export type Project = {
	slug: string;
	name: string;
	summary: string | null;
	repoUrl: string | null;
	status: "active" | "archived";
	createdAt: string;
	updatedAt: string;
};

export type CreateProjectInput = {
	slug: string;
	name: string;
	summary?: string | null;
	repoUrl?: string | null;
};

export type Task = {
	key: string;
	number: number;
	title: string;
	description: string | null;
	status: TaskStatus;
	owner: { kind: TaskOwnerKind; name: string | null } | null;
	branch: string | null;
	position: number;
	createdAt: string;
	updatedAt: string;
};

export type CreateTaskInput = {
	title: string;
	description?: string | null;
	status?: TaskStatus;
	ownerKind?: TaskOwnerKind | null;
	ownerName?: string | null;
	branch?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & { position?: number };
