import type { Block } from "./transcript";

/** One file the thread changed, with every change to it summed. */
export type ChangedFile = { path: string; added: number; removed: number };

/** What a thread's transcript adds up to, for its header and its Run panel. */
export type ThreadFacts = {
	files: ChangedFile[];
	added: number;
	removed: number;
	/** Time the agent spent working across finished turns, in milliseconds. */
	workedMs: number;
	/** An approval is waiting on someone. */
	waiting: boolean;
	/** The latest turn ended in an error. */
	failed: boolean;
};

export function threadFacts(blocks: readonly Block[]): ThreadFacts {
	const files = new Map<string, ChangedFile>();
	let workedMs = 0;
	let waiting = false;
	let lastOutcome: string | undefined;
	for (const block of blocks) {
		if (block.kind === "tool") {
			for (const diff of block.diffs ?? []) {
				const file = files.get(diff.path) ?? { path: diff.path, added: 0, removed: 0 };
				file.added += diff.added;
				file.removed += diff.removed;
				files.set(diff.path, file);
			}
		} else if (block.kind === "user") {
			lastOutcome = block.outcome;
			const started = block.startedAt ? Date.parse(block.startedAt) : Number.NaN;
			const ended = block.endedAt ? Date.parse(block.endedAt) : Number.NaN;
			if (Number.isFinite(started) && Number.isFinite(ended) && ended > started) {
				workedMs += ended - started;
			}
		} else if (block.kind === "approval" && block.resolved === undefined) {
			waiting = true;
		}
	}
	const list = [...files.values()];
	return {
		files: list,
		added: list.reduce((sum, file) => sum + file.added, 0),
		removed: list.reduce((sum, file) => sum + file.removed, 0),
		workedMs,
		waiting,
		failed: lastOutcome === "error",
	};
}
