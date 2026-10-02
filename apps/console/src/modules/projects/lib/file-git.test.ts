import { describe, expect, it } from "vitest";

import { changeOf, changesIn, lineMarks } from "./file-git";

describe("file git", () => {
	it("marks new lines added and replaced lines modified", () => {
		const before = "a\nb\nc\n";
		const after = "a\nB\nc\nd\ne\n";
		expect([...lineMarks(before, after)]).toEqual([
			[2, "modified"],
			[4, "added"],
			[5, "added"],
		]);
		expect(lineMarks("same\n", "same\n").size).toBe(0);
	});

	it("finds the changes in a folder, and whether a folder holds any", () => {
		const changes = [
			{ path: "src/jobs/eta.ts", status: "modified" as const, added: 1, removed: 1 },
			{ path: "README.md", status: "added" as const, added: null, removed: null },
		];
		expect(changesIn(changes, "src").map((change) => change.path)).toEqual(["src/jobs/eta.ts"]);
		expect(changesIn(changes, "")).toHaveLength(2);
		expect(changeOf(changes, "src", true)).toBe("modified");
		expect(changeOf(changes, "README.md", false)).toBe("added");
		expect(changeOf(changes, "docs", true)).toBeNull();
	});
});
