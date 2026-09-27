import { describe, expect, it } from "vitest";

import { diffLines } from "./diff";

describe("diffLines", () => {
	it("says nothing when the text is the same", () => {
		expect(diffLines("a\nb\n", "a\nb\n")).toEqual([]);
	});

	it("marks a changed line and keeps the numbers of both files", () => {
		expect(diffLines("one\ntwo\nthree\n", "one\nTWO\nthree\n")).toEqual([
			{ kind: "hunk", text: "@@ line 1 @@" },
			{ kind: "context", old: 1, new: 1, text: "one" },
			{ kind: "del", old: 2, new: null, text: "two" },
			{ kind: "add", old: null, new: 2, text: "TWO" },
			{ kind: "context", old: 3, new: 3, text: "three" },
		]);
	});

	it("keeps a few lines of context and starts a new hunk for a distant change", () => {
		const before = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");
		const after = before
			.replace("line 2\n", "line 2 edited\n")
			.replace("line 30\n", "line 30 edited\n");
		const lines = diffLines(before, after, 2);
		expect(lines.filter((line) => line.kind === "hunk")).toHaveLength(2);
		expect(lines.filter((line) => line.kind === "add").map((line) => line.text)).toEqual([
			"line 2 edited",
			"line 30 edited",
		]);
		// Nothing between the two hunks is carried along.
		expect(lines.some((line) => line.text === "line 15")).toBe(false);
	});

	it("shows an added and a removed line where text was inserted", () => {
		const lines = diffLines("a\nc\n", "a\nb\nc\n");
		expect(lines.filter((line) => line.kind === "add")).toEqual([
			{ kind: "add", old: null, new: 2, text: "b" },
		]);
		expect(lines.filter((line) => line.kind === "del")).toEqual([]);
	});

	it("does not count a trailing newline as a line", () => {
		expect(diffLines("a", "a\n")).toEqual([]);
		expect(diffLines("a\nb", "a\nb\n")).toEqual([]);
	});

	it("falls back to whole blocks rather than aligning a very large change", () => {
		const before = Array.from({ length: 900 }, (_, i) => `a${i}`).join("\n");
		const after = Array.from({ length: 900 }, (_, i) => `b${i}`).join("\n");
		const lines = diffLines(before, after);
		expect(lines.filter((line) => line.kind === "add")).toHaveLength(900);
		expect(lines.filter((line) => line.kind === "del")).toHaveLength(900);
	});
});
