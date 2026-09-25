import { describe, expect, it } from "vitest";

import { diffRows } from "./diff";

describe("diffRows", () => {
	it("numbers each side and keeps diff order", () => {
		const rows = diffRows({
			path: "a.txt",
			patch: "@@ -10,3 +10,3 @@\n keep\n-old\n+new\n tail",
			added: 1,
			removed: 1,
		});
		expect(
			rows.map((row) => (row.kind === "hunk" ? "hunk" : [row.kind, row.old, row.new, row.html])),
		).toEqual([
			"hunk",
			["context", 10, 10, "keep"],
			["del", 11, null, "old"],
			["add", null, 11, "new"],
			["context", 12, 12, "tail"],
		]);
	});

	it("highlights code by the file's extension, across lines", () => {
		const rows = diffRows({
			path: "x.ts",
			patch: "@@ -1,2 +1,3 @@\n const a = `one\n+two\n three`;",
			added: 1,
			removed: 0,
		});
		const added = rows.find((row) => row.kind === "add");
		// The template string opened on the line above still colours the added line.
		expect(added && "html" in added ? added.html : "").toContain('class="hljs-string"');
	});

	it("escapes text in files it cannot highlight", () => {
		const rows = diffRows({
			path: "notes",
			patch: "@@ -0,0 +1 @@\n+<b>hi</b>",
			added: 1,
			removed: 0,
		});
		expect(rows[1] && "html" in rows[1] ? rows[1].html : "").toBe("&lt;b&gt;hi&lt;/b&gt;");
	});

	it("has no rows for a diff too large to send", () => {
		expect(diffRows({ path: "big", patch: "", added: 9000, removed: 9000 })).toEqual([]);
	});
});
