import type { FileDiff } from "../types/chat.types";

import { highlightLines, languageFor } from "./markdown";

/** One line of a diff as it is drawn: its kind, its numbers in the old and new file, its HTML. */
export type DiffRow =
	| { kind: "hunk"; text: string }
	| { kind: "context" | "add" | "del"; old: number | null; new: number | null; html: string };

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * A file's hunks as rows, highlighted as code. Each hunk's old side (context and removals) and
 * new side (context and additions) are highlighted as whole pieces of code, so a string or comment
 * that spans lines is coloured right, then the lines are laid back in diff order.
 */
export function diffRows(diff: FileDiff): DiffRow[] {
	const language = languageFor(diff.path);
	const rows: DiffRow[] = [];
	const lines = diff.patch ? diff.patch.split("\n") : [];
	let i = 0;
	while (i < lines.length) {
		const header = lines[i]!.match(HUNK);
		if (!header) {
			i++;
			continue;
		}
		rows.push({ kind: "hunk", text: lines[i]! });
		i++;
		const body: string[] = [];
		while (i < lines.length && !lines[i]!.startsWith("@@")) body.push(lines[i++]!);
		// "\ No newline at end of file" and stray lines are not code.
		const code = body.filter((line) => /^[ +-]/.test(line));
		const oldSide = highlightLines(
			code
				.filter((line) => line[0] !== "+")
				.map((line) => line.slice(1))
				.join("\n"),
			language,
		);
		const newSide = highlightLines(
			code
				.filter((line) => line[0] !== "-")
				.map((line) => line.slice(1))
				.join("\n"),
			language,
		);
		let oldLine = Number(header[1]);
		let newLine = Number(header[2]);
		let o = 0;
		let n = 0;
		for (const line of code) {
			if (line[0] === "+") {
				rows.push({ kind: "add", old: null, new: newLine++, html: newSide[n++] ?? "" });
			} else if (line[0] === "-") {
				rows.push({ kind: "del", old: oldLine++, new: null, html: oldSide[o++] ?? "" });
			} else {
				rows.push({ kind: "context", old: oldLine++, new: newLine++, html: newSide[n++] ?? "" });
				o++;
			}
		}
	}
	return rows;
}
