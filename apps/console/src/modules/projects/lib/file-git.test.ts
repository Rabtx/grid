import { describe, expect, it } from "vitest";

import { blameRuns, changeOf, changesIn, indentation, isMine, lineMarks } from "./file-git";

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

	it("says how a file is indented", () => {
		expect(indentation("a\n  b\n    c\n  d\n")).toBe("Spaces: 2");
		expect(indentation("a {\n\tb\n\t\tc\n}\n")).toBe("Tabs");
		expect(indentation("one\ntwo\n")).toBeNull();
	});

	it("groups blamed lines into runs by commit", () => {
		const commits = ["a", "b"];
		expect(blameRuns(commits, [0, 0, 1, 0])).toEqual([
			{ commit: "a", from: 1, to: 2 },
			{ commit: "b", from: 3, to: 3 },
			{ commit: "a", from: 4, to: 4 },
		]);
		expect(blameRuns(commits, [])).toEqual([]);
	});

	it("calls a change mine when no agent made it, else the last commit decides", () => {
		expect(isMine({ agent: null }, { mine: false })).toBe(true);
		expect(isMine({ agent: "claude" }, { mine: true })).toBe(false);
		expect(isMine(null, { mine: true })).toBe(true);
		expect(isMine(undefined, undefined)).toBe(false);
	});
});
