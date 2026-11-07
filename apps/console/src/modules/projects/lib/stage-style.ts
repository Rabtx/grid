import type { BuiltInStatus, TaskStatus, WorkflowCategory } from "../types/project.types";

/**
 * Stage colour classes spelled out in full: Tailwind only generates classes it can find as
 * literal strings, so `text-status-${status}` would never reach the stylesheet.
 */
export const STATUS_TEXT_CLASS: Record<BuiltInStatus, string> = {
	backlog: "text-status-backlog",
	ready: "text-status-ready",
	in_progress: "text-status-in_progress",
	review: "text-status-review",
	qa: "text-status-qa",
	blocked: "text-status-blocked",
	done: "text-status-done",
};

/** The built-in a status of a project's own looks like: the first of its kind. */
export const CATEGORY_LOOK: Record<WorkflowCategory, BuiltInStatus> = {
	backlog: "backlog",
	unstarted: "ready",
	started: "in_progress",
	review: "review",
	done: "done",
};

/** How a status is drawn: its own look if it is a built-in, else the look of its kind. */
export function lookOf(status: TaskStatus, category?: WorkflowCategory): BuiltInStatus {
	if (status in STATUS_TEXT_CLASS) return status as BuiltInStatus;
	return CATEGORY_LOOK[category ?? "backlog"];
}
