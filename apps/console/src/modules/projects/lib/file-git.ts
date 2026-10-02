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

/**
 * How a file is indented, as an editor's status bar says it: "Tabs", "Spaces: 2", or null when
 * nothing in it is indented. Spaces are measured by the step most lines indent by.
 */
export function indentation(text: string): string | null {
	let tabs = 0;
	const steps = new Map<number, number>();
	let previous = 0;
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		if (line.startsWith("\t")) {
			tabs++;
			continue;
		}
		const width = line.length - line.trimStart().length;
		const step = Math.abs(width - previous);
		if (step > 0 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1);
		previous = width;
	}
	const spaced = [...steps.values()].reduce((sum, count) => sum + count, 0);
	if (tabs === 0 && spaced === 0) return null;
	if (tabs >= spaced) return "Tabs";
	const [step] = [...steps.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
	return `Spaces: ${step}`;
}

/** A run of lines written in one commit, 1-based and inclusive, for Blame. */
export type BlameRun<T> = { commit: T; from: number; to: number };

/** Consecutive lines with the same commit, as runs. */
export function blameRuns<T>(commits: readonly T[], lines: readonly number[]): BlameRun<T>[] {
	const runs: BlameRun<T>[] = [];
	lines.forEach((at, index) => {
		const last = runs[runs.length - 1];
		if (last && last.commit === commits[at]) last.to = index + 1;
		else runs.push({ commit: commits[at], from: index + 1, to: index + 1 });
	});
	return runs;
}

/**
 * Whether a path's latest change is the signed-in person's own: a change not committed yet that no
 * agent made (it was made on this machine), or a last commit made as this machine's git user.
 */
export function isMine(
	change: Pick<FileChange, "agent"> | null | undefined,
	last: { mine?: boolean } | null | undefined,
): boolean {
	if (change) return !change.agent;
	return last?.mine === true;
}
