import type { TaskStatus } from "../types/project.types";

/**
 * Stage colour classes spelled out in full: Tailwind only generates classes it can find as
 * literal strings, so `text-status-${status}` would never reach the stylesheet.
 */
export const STATUS_TEXT_CLASS: Record<TaskStatus, string> = {
	backlog: "text-status-backlog",
	ready: "text-status-ready",
	in_progress: "text-status-in_progress",
	review: "text-status-review",
	qa: "text-status-qa",
	blocked: "text-status-blocked",
	done: "text-status-done",
};
