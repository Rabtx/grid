import { describe, expect, it } from "vitest";

import {
	filterAndSortFiles,
	findMentionQuery,
	insertMention,
	matchSubsequence,
	scoreFileMatch,
} from "./file-mentions";

describe("findMentionQuery", () => {
	it("detects @ at start of line with empty query", () => {
		expect(findMentionQuery("@", 1)).toEqual({ atIndex: 0, query: "" });
	});

	it("detects @ after whitespace with partial query", () => {
		expect(findMentionQuery("Look at @src/in", 15)).toEqual({ atIndex: 8, query: "src/in" });
	});

	it("detects @ on newline", () => {
		expect(findMentionQuery("Line 1\n@app", 11)).toEqual({ atIndex: 7, query: "app" });
	});

	it("rejects @ when preceded by non-whitespace (e.g. email address)", () => {
		expect(findMentionQuery("contact@example.com", 15)).toBeNull();
		expect(findMentionQuery("foo@bar", 7)).toBeNull();
	});

	it("rejects when query contains spaces (completed or abandoned mention)", () => {
		expect(findMentionQuery("Look at @src/index.ts and more", 25)).toBeNull();
	});

	it("returns null when no @ exists before cursor", () => {
		expect(findMentionQuery("hello world", 5)).toBeNull();
	});

	it("handles cursor before @", () => {
		expect(findMentionQuery("hello @file", 5)).toBeNull();
	});
});

describe("matchSubsequence", () => {
	it("matches empty query", () => {
		expect(matchSubsequence("src/app.ts", "")).toBe(true);
	});

	it("matches exact substring", () => {
		expect(matchSubsequence("src/app.ts", "app")).toBe(true);
		expect(matchSubsequence("src/app.ts", "src/")).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(matchSubsequence("src/App.tsx", "app")).toBe(true);
		expect(matchSubsequence("src/app.tsx", "APP")).toBe(true);
	});

	it("matches fuzzy subsequence", () => {
		expect(matchSubsequence("src/components/composer.tsx", "compcomp")).toBe(true);
		expect(matchSubsequence("src/index.ts", "sit")).toBe(true);
	});

	it("returns false when characters do not appear in order", () => {
		expect(matchSubsequence("src/app.ts", "tsapp")).toBe(false);
		expect(matchSubsequence("src/app.ts", "xyz")).toBe(false);
	});
});

describe("scoreFileMatch and filterAndSortFiles", () => {
	const files = [
		"packages/ui/src/button.tsx",
		"src/app.ts",
		"src/components/app-header.tsx",
		"src/index.ts",
		"README.md",
	];

	it("scores exact filename higher than substring or subsequence", () => {
		expect(scoreFileMatch("src/app.ts", "app.ts")).toBe(0);
		expect(scoreFileMatch("src/app.ts", "app")).toBe(1);
		expect(scoreFileMatch("src/components/app-header.tsx", "app")).toBe(1);
		expect(scoreFileMatch("packages/ui/src/button.tsx", "button")).toBe(1);
	});

	it("filters and sorts files by relevance", () => {
		const result = filterAndSortFiles(files, "app");
		expect(result[0]).toBe("src/app.ts");
		expect(result).toContain("src/components/app-header.tsx");
		expect(result).not.toContain("README.md");
	});
});

describe("insertMention", () => {
	it("replaces @query with @path and a trailing space", () => {
		const text = "Please inspect @comp for bugs";
		// Cursor is right after "comp" (position 20), atIndex is 15
		const result = insertMention(text, 15, 20, "src/components/composer.tsx");
		expect(result.text).toBe("Please inspect @src/components/composer.tsx  for bugs");
		expect(result.newCursorPosition).toBe(15 + "@src/components/composer.tsx ".length);
	});

	it("inserts at end of text", () => {
		const text = "Look at @";
		const result = insertMention(text, 8, 9, "src/index.ts");
		expect(result.text).toBe("Look at @src/index.ts ");
		expect(result.newCursorPosition).toBe(text.length - 1 + "@src/index.ts ".length);
	});

	it("inserts at start of text", () => {
		const text = "@app";
		const result = insertMention(text, 0, 4, "src/app.ts");
		expect(result.text).toBe("@src/app.ts ");
		expect(result.newCursorPosition).toBe("@src/app.ts ".length);
	});
});
