import type { DiffLine } from "./message";

/**
 * The lines that turn `before` into `after`, in the shape `DiffCard` draws: each changed line
 * with its number in the old and the new file, the lines around it as context, and a hunk header
 * wherever the changes are more than a few lines apart.
 */

/** Lines of unchanged text kept either side of a change, so a hunk reads in place. */
const CONTEXT = 3;

/** Rows of longest-common-subsequence work before the diff gives up and shows whole blocks. */
const MAX_CELLS = 400_000;

type Op = { kind: "context" | "add" | "del"; old: number | null; new: number | null; text: string };

function lines(text: string): string[] {
	const split = text.split("\n");
	// A file ending in a newline has a trailing empty line that is not a line of its own.
	if (split.length > 1 && split[split.length - 1] === "") split.pop();
	return split;
}

/** The longest common subsequence of two line lists, walked back into operations. */
function operations(before: string[], after: string[]): Op[] {
	const shared = new Int32Array((before.length + 1) * (after.length + 1));
	const at = (row: number, column: number) => row * (after.length + 1) + column;
	for (let row = before.length - 1; row >= 0; row--) {
		for (let column = after.length - 1; column >= 0; column--) {
			shared[at(row, column)] =
				before[row] === after[column]
					? shared[at(row + 1, column + 1)] + 1
					: Math.max(shared[at(row + 1, column)], shared[at(row, column + 1)]);
		}
	}
	const ops: Op[] = [];
	let row = 0;
	let column = 0;
	while (row < before.length && column < after.length) {
		if (before[row] === after[column]) {
			ops.push({ kind: "context", old: row + 1, new: column + 1, text: before[row] });
			row++;
			column++;
		} else if (shared[at(row + 1, column)] >= shared[at(row, column + 1)]) {
			ops.push({ kind: "del", old: row + 1, new: null, text: before[row] });
			row++;
		} else {
			ops.push({ kind: "add", old: null, new: column + 1, text: after[column] });
			column++;
		}
	}
	for (; row < before.length; row++)
		ops.push({ kind: "del", old: row + 1, new: null, text: before[row] });
	for (; column < after.length; column++)
		ops.push({ kind: "add", old: null, new: column + 1, text: after[column] });
	return ops;
}

/** Operations for a pair of texts too big to align line by line: drop the old, add the new. */
function wholeBlocks(before: string[], after: string[]): Op[] {
	return [
		...before.map((text, index): Op => ({ kind: "del", old: index + 1, new: null, text })),
		...after.map((text, index): Op => ({ kind: "add", old: null, new: index + 1, text })),
	];
}

/**
 * What changed between two texts, as `DiffCard` lines. Identical texts give nothing; a text too
 * large to align becomes one block of removals and one of additions rather than a hang.
 */
export function diffLines(before: string, after: string, context = CONTEXT): DiffLine[] {
	if (before === after) return [];
	const oldLines = lines(before);
	const newLines = lines(after);
	// Unchanged head and tail are almost always most of the file; leaving them out keeps the
	// table small and the alignment cheap.
	let head = 0;
	while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head])
		head++;
	let tail = 0;
	while (
		tail < oldLines.length - head &&
		tail < newLines.length - head &&
		oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]
	)
		tail++;

	const middleOld = oldLines.slice(head, oldLines.length - tail);
	const middleNew = newLines.slice(head, newLines.length - tail);
	const middle =
		middleOld.length * middleNew.length > MAX_CELLS
			? wholeBlocks(middleOld, middleNew)
			: operations(middleOld, middleNew);
	// The trimmed head and tail come back as a little context, so a small edit still reads in
	// place in the file.
	const keep = (texts: string[], from: number, to: number): Op[] =>
		texts.slice(from, to).map((text, index): Op => ({
			kind: "context",
			old: from + index + 1,
			new: from + index + 1,
			text,
		}));
	const numbered: Op[] = [
		...keep(oldLines, Math.max(0, head - context), head),
		...middle.map((op) => ({
			...op,
			old: op.old === null ? null : op.old + head,
			new: op.new === null ? null : op.new + head,
		})),
		...keep(
			oldLines,
			oldLines.length - tail,
			Math.min(oldLines.length, oldLines.length - tail + context),
		),
	];

	// A hunk per run of changes, with `context` lines of it either side.
	const changed = numbered.flatMap((op, index) => (op.kind === "context" ? [] : [index]));
	const runs: [number, number][] = [];
	for (const index of changed) {
		const last = runs[runs.length - 1];
		if (last && index - last[1] <= context * 2) last[1] = index;
		else runs.push([index, index]);
	}
	return runs.flatMap(([first, last]): DiffLine[] => {
		const from = Math.max(0, first - context);
		const to = Math.min(numbered.length, last + context + 1);
		return [
			{ kind: "hunk", text: `@@ line ${numbered[from].old ?? numbered[from].new} @@` },
			...numbered.slice(from, to),
		];
	});
}
