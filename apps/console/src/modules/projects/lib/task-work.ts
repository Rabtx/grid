import type { Task, TaskOwnerKind } from "../types/project.types";

/**
 * What a task knows about the work on it, before tasks and threads are linked in the data: the
 * threads started from it (their first message, and so their title, begins with its key), and who
 * of the people and agents Grid knows it is assigned to.
 */

/** The threads about a task: a thread started from it is titled "TASK-3: …". Newest first. */
export function threadsForTask<T extends { title: string; updatedAt: string }>(
	threads: readonly T[],
	key: string,
): T[] {
	const pattern = new RegExp(
		`(^|[^A-Za-z0-9-])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`,
		"i",
	);
	return threads
		.filter((thread) => pattern.test(thread.title))
		.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** A thread's title without the task's key it starts with: "TASK-3: Fix login" reads "Fix login". */
export function withoutKey(title: string, key: string): string {
	const rest = title.replace(new RegExp(`^\\s*${key}\\s*[:·-]?\\s*`, "i"), "");
	return rest || title;
}

/** One choice in the assignee picker. */
export type Assignee =
	| { value: "none" }
	| { value: "me" }
	/** An agent or role Grid knows, by the name the task stores. */
	| { value: `agent:${string}`; name: string }
	/** Someone, or some agent, named by hand. */
	| { value: "human" | "agent" };

/** The picker's value for a task's owner, given who you are and the agents and roles Grid knows. */
export function assigneeValue(
	owner: { kind: TaskOwnerKind | null; name: string },
	me: string | null,
	known: readonly string[],
): string {
	if (owner.kind === null) return "none";
	if (owner.kind === "human")
		return me !== null && owner.name.toLowerCase() === me.toLowerCase() ? "me" : "human";
	const match = known.find((name) => name.toLowerCase() === owner.name.toLowerCase());
	return match ? `agent:${match}` : "agent";
}

/** What the task saves for a picker value: its owner's kind and name. */
export function ownerFor(
	value: string,
	me: string | null,
): { ownerKind: TaskOwnerKind | null; ownerName?: string | null } | null {
	if (value === "none") return { ownerKind: null, ownerName: null };
	if (value === "me") return me ? { ownerKind: "human", ownerName: me } : null;
	if (value.startsWith("agent:")) return { ownerKind: "agent", ownerName: value.slice(6) };
	if (value === "human" || value === "agent") return { ownerKind: value };
	return null;
}

/**
 * The status a task moves to when an agent starts on it: work begins, so anything not yet started
 * goes to In progress; a task already further along stays where it is.
 */
export function statusOnStart(status: Task["status"]): Task["status"] | null {
	return status === "backlog" || status === "ready" ? "in_progress" : null;
}
