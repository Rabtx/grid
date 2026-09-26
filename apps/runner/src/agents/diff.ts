/**
 * File edits as unified diffs, whatever the agent reported: before-and-after text (Claude's edit
 * input, ACP diff content) or a patch it already made (Codex). One shape reaches the console, so
 * every agent's edits read the same way.
 */
export type FileDiff = {
	path: string;
	/** Unified hunks: `@@` headers, then lines starting with " ", "+" or "-". */
	patch: string;
	added: number;
	removed: number;
	/** Cut from the middle of a file (an edit's old and new text), so line numbers are not real. */
	snippet?: boolean;
};

const CONTEXT = 3;
// Past this, a diff costs more than it tells: the counts are kept, the lines are not.
const MAX_LINES = 20_000;
const MAX_EDITS = 2_000;
const MAX_PATCH = 100_000;

type Op = { kind: " " | "+" | "-"; text: string };

function lines(text: string | null | undefined): string[] {
	if (!text) return [];
	const split = text.split("\n");
	if (split.at(-1) === "") split.pop();
	return split;
}

/**
 * Myers' O(ND) diff over lines: the shortest edit script from `a` to `b`, or null past
 * `MAX_EDITS` changes. Each step keeps only the part of the frontier it can reach (2d+3 cells),
 * so memory grows with the number of changes squared, not with the file size.
 */
function editScript(a: string[], b: string[]): Op[] | null {
	const n = a.length;
	const m = b.length;
	const max = Math.min(n + m, MAX_EDITS);
	const offset = max + 1;
	const v = new Int32Array(2 * max + 3);
	const trace: Int32Array[] = [];
	for (let d = 0; d <= max; d++) {
		trace.push(v.slice(offset - d - 1, offset + d + 2));
		for (let k = -d; k <= d; k += 2) {
			let x =
				k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
					? v[offset + k + 1]!
					: v[offset + k - 1]! + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) return backtrack(trace, a, b, d);
		}
	}
	return null;
}

function backtrack(trace: Int32Array[], a: string[], b: string[], end: number): Op[] {
	const ops: Op[] = [];
	let x = a.length;
	let y = b.length;
	for (let d = end; d > 0; d--) {
		// trace[d] holds the frontier before step d, for diagonals -d-1..d+1.
		const v = trace[d]!;
		const at = (k: number) => v[k + d + 1]!;
		const k = x - y;
		const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
		const prevX = at(prevK);
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			ops.push({ kind: " ", text: a[--x]! });
			y--;
		}
		if (x === prevX) ops.push({ kind: "+", text: b[--y]! });
		else ops.push({ kind: "-", text: a[--x]! });
	}
	while (x > 0 && y > 0) {
		ops.push({ kind: " ", text: a[--x]! });
		y--;
	}
	return ops.reverse();
}

/** Group an edit script into hunks with a few lines of context around each change. */
function hunks(ops: Op[]): string {
	const out: string[] = [];
	let i = 0;
	// Line numbers (1-based) in the old and new file at ops[i].
	let oldLine = 1;
	let newLine = 1;
	const advance = (op: Op) => {
		if (op.kind !== "+") oldLine++;
		if (op.kind !== "-") newLine++;
	};
	while (i < ops.length) {
		if (ops[i]!.kind === " ") {
			advance(ops[i]!);
			i++;
			continue;
		}
		// A change at i: start the hunk CONTEXT lines earlier.
		const start = Math.max(0, i - CONTEXT);
		let oldStart = oldLine;
		let newStart = newLine;
		for (let j = start; j < i; j++) {
			oldStart--;
			newStart--;
		}
		// Changes closer than twice the context share a hunk.
		let last = i;
		for (let j = i; j < ops.length && j - last <= CONTEXT * 2; j++) {
			if (ops[j]!.kind !== " ") last = j;
		}
		const stop = Math.min(ops.length, last + 1 + CONTEXT);
		const body = ops.slice(start, stop);
		const oldCount = body.filter((op) => op.kind !== "+").length;
		const newCount = body.filter((op) => op.kind !== "-").length;
		out.push(
			`@@ -${oldCount ? oldStart : oldStart - 1},${oldCount} +${newCount ? newStart : newStart - 1},${newCount} @@`,
		);
		for (const op of body) out.push(`${op.kind}${op.text}`);
		for (let j = i; j < stop; j++) advance(ops[j]!);
		i = stop;
	}
	return out.join("\n");
}

function clipPatch(patch: string): string {
	if (patch.length <= MAX_PATCH) return patch;
	const cut = patch.lastIndexOf("\n", MAX_PATCH);
	return patch.slice(0, cut > 0 ? cut : MAX_PATCH);
}

/** The diff between two versions of a file; `before` is null for a new file. */
export function diffTexts(path: string, before: string | null, after: string): FileDiff {
	const a = lines(before);
	const b = lines(after);
	if (a.length + b.length > MAX_LINES) {
		return { path, patch: "", added: b.length, removed: a.length };
	}
	const ops = editScript(a, b);
	if (!ops) return { path, patch: "", added: b.length, removed: a.length };
	return {
		path,
		patch: clipPatch(hunks(ops)),
		added: ops.filter((op) => op.kind === "+").length,
		removed: ops.filter((op) => op.kind === "-").length,
	};
}

/** A patch the agent already made (git-style or bare hunks), reduced to its hunks. */
export function diffFromPatch(path: string, patch: string): FileDiff {
	const body: string[] = [];
	let added = 0;
	let removed = 0;
	let inHunk = false;
	for (const line of patch.split("\n")) {
		if (line.startsWith("@@")) inHunk = true;
		if (!inHunk) continue;
		if (line.startsWith("+")) added++;
		else if (line.startsWith("-")) removed++;
		body.push(line);
	}
	while (body.length && body.at(-1) === "") body.pop();
	return { path, patch: clipPatch(body.join("\n")), added, removed };
}
