import { describe, expect, it } from "bun:test";

import { diffsOf } from "./acp";
import { editDiffs } from "./claude";
import { codexTool } from "./codex";
import { diffFromPatch, diffTexts } from "./diff";

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

describe("diffTexts", () => {
	it("makes a hunk with three lines of context around a change", () => {
		const before = numbered(20);
		const after = [...before];
		after[9] = "changed";
		const diff = diffTexts("a.ts", `${before.join("\n")}\n`, `${after.join("\n")}\n`);
		expect(diff).toMatchObject({ path: "a.ts", added: 1, removed: 1 });
		expect(diff.patch.split("\n")).toEqual([
			"@@ -7,7 +7,7 @@",
			" line 7",
			" line 8",
			" line 9",
			"-line 10",
			"+changed",
			" line 11",
			" line 12",
			" line 13",
		]);
	});

	it("joins nearby changes and splits distant ones", () => {
		const before = numbered(40);
		const near = [...before];
		near[4] = "a";
		near[8] = "b";
		expect(diffTexts("f", before.join("\n"), near.join("\n")).patch.match(/^@@/gm)).toHaveLength(1);
		const far = [...before];
		far[2] = "a";
		far[30] = "b";
		const patch = diffTexts("f", before.join("\n"), far.join("\n")).patch;
		expect(patch.match(/^@@/gm)).toHaveLength(2);
		expect(patch).toContain("@@ -28,7 +28,7 @@");
	});

	it("shows a new file as all additions", () => {
		const diff = diffTexts("new.md", null, "# Title\n\nBody\n");
		expect(diff).toMatchObject({ added: 3, removed: 0 });
		expect(diff.patch).toBe("@@ -0,0 +1,3 @@\n+# Title\n+\n+Body");
	});

	it("handles an insertion at the top and a deletion at the end", () => {
		const diff = diffTexts("f", "b\nc\nd", "a\nb\nc");
		expect(diff.patch).toBe("@@ -1,3 +1,3 @@\n+a\n b\n c\n-d");
	});

	it("keeps only counts for very large files", () => {
		const big = numbered(15_000).join("\n");
		const diff = diffTexts("big", big, `${big}\nmore`);
		expect(diff.patch).toBe("");
		expect(diff.added).toBe(15_001);
	});
});

it("gives up on a rewrite with thousands of changes, keeping the counts", () => {
	const before = numbered(3000).join("\n");
	const after = numbered(3000)
		.map((line) => `${line}!`)
		.join("\n");
	expect(diffTexts("f", before, after)).toMatchObject({ patch: "", added: 3000, removed: 3000 });
});

describe("diffFromPatch", () => {
	it("drops git headers and counts lines", () => {
		const patch = [
			"diff --git a/x.ts b/x.ts",
			"--- a/x.ts",
			"+++ b/x.ts",
			"@@ -1,2 +1,2 @@",
			" keep",
			"-old",
			"+new",
			"",
		].join("\n");
		expect(diffFromPatch("x.ts", patch)).toEqual({
			path: "x.ts",
			patch: "@@ -1,2 +1,2 @@\n keep\n-old\n+new",
			added: 1,
			removed: 1,
		});
	});
});

describe("agent edits as diffs", () => {
	it("reads Claude's Edit, MultiEdit and Write input", () => {
		const [edit] = editDiffs("Edit", {
			file_path: "/p/a.ts",
			old_string: "x = 1",
			new_string: "x = 2",
		});
		expect(edit).toMatchObject({ path: "/p/a.ts", added: 1, removed: 1, snippet: true });
		expect(
			editDiffs("MultiEdit", {
				file_path: "/p/a.ts",
				edits: [
					{ old_string: "a", new_string: "b" },
					{ old_string: "c", new_string: "d" },
				],
			}),
		).toHaveLength(2);
		expect(editDiffs("Write", { file_path: "/p/n.md", content: "hi\n" })[0]).toMatchObject({
			added: 1,
			removed: 0,
		});
		expect(editDiffs("Read", { file_path: "/p/a.ts" })).toEqual([]);
	});

	it("reads ACP diff content", () => {
		const { diffs } = diffsOf({
			toolCallId: "t",
			content: [{ type: "diff", path: "/p/b.ts", oldText: "one\ntwo", newText: "one\n2" }],
		});
		expect(diffs?.[0]).toMatchObject({ path: "/p/b.ts", added: 1, removed: 1 });
		expect(diffsOf({ toolCallId: "t", content: [] })).toEqual({});
	});

	it("reads Codex file changes: patches for updates, content for new files", () => {
		const tool = codexTool({
			type: "fileChange",
			id: "c1",
			status: "completed",
			changes: [
				{ path: "a.ts", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b\n" },
				{ path: "n.ts", kind: { type: "add" }, diff: "new\nfile\n" },
			],
		});
		expect(tool?.diffs).toEqual([
			{ path: "a.ts", patch: "@@ -1 +1 @@\n-a\n+b", added: 1, removed: 1 },
			{ path: "n.ts", patch: "@@ -0,0 +1,2 @@\n+new\n+file", added: 2, removed: 0 },
		]);
	});
});
