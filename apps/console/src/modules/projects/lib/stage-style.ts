import type { TaskStatus } from "../types/project.types";

/**
 * Status dot classes spelled out in full: Tailwind only generates classes it can find as
 * literal strings, so `bg-status-${status}` would never reach the stylesheet.
 */
export const STATUS_DOT_CLASS: Record<TaskStatus, string> = {
	backlog: "bg-status-backlog",
	ready: "bg-status-ready",
	in_progress: "bg-status-in_progress",
	review: "bg-status-review",
	qa: "bg-status-qa",
	blocked: "bg-status-blocked",
	done: "bg-status-done",
};

export function laneId(status: TaskStatus): string {
	return `lane-${status}`;
}
