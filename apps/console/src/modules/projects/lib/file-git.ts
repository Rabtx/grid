import { diffLines } from "@/kit/diff";

import type { FileChange } from "../services/files.service";

export type LineMark = "added" | "modified";

/**
 * Which lines of `after` differ from `before`: a run of new lines with nothing taken out beside
 * it is added; a run that replaces lines is modified.
 */
export function lineMarks(before: string, after: string): Map<number, LineMark> {
	const marks = new Map<number, LineMark>();
	// A line of context between changes is what separates one run from the next; hunk headers
	// are not (with no context every line would be its own hunk).
	const lines = diffLines(before, after, 1);
	let run: { added: number[]; removed: boolean } = { added: [], removed: false };
	const flush = () => {
		for (const line of run.added) marks.set(line, run.removed ? "modified" : "added");
		run = { added: [], removed: false };
	};
	for (const line of lines) {
		if (line.kind === "add" && typeof line.new === "number") run.added.push(line.new);
		else if (line.kind === "del") run.removed = true;
		else if (line.kind === "context") flush();
	}
	flush();
	return marks;
}

/** The changes inside a folder ("" is the whole project). */
export function changesIn(changes: readonly FileChange[], folder: string): FileChange[] {
	return folder ? changes.filter((change) => change.path.startsWith(`${folder}/`)) : [...changes];
}

/** How a path stands: its own change, or (for a folder) whether anything inside it changed. */
export function changeOf(
	changes: readonly FileChange[],
	path: string,
	folder: boolean,
): FileChange["status"] | null {
	if (!folder) return changes.find((change) => change.path === path)?.status ?? null;
	return changes.some((change) => change.path.startsWith(`${path}/`)) ? "modified" : null;
}
