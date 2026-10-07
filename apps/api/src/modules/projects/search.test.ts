import { describe, expect, it } from "bun:test";

import { passage, searchWords } from "./search";

describe("passage", () => {
	it("opens on the first word found in the text", () => {
		expect(passage("the refactor is done, carefully", ["refactor", "done"])).toBe(
			"the refactor is done, carefully",
		);
	});

	it("has something to show when the words are only in the title", () => {
		// A task matched on its title; none of the words are in the description. Slicing from
		// Math.min() of nothing left this empty, so the result showed a blank second line.
		const description = "Rewrites the token check on every request.";
		expect(passage(description, ["refactor"])).toBe(description);
	});

	it("is empty for empty text, whatever the words", () => {
		expect(passage("", ["refactor"])).toBe("");
	});
});

describe("searchWords", () => {
	it("keeps words of two letters or more, once each", () => {
		expect(searchWords("Refactor  the  refactor OAuth x")).toEqual(["refactor", "the", "oauth"]);
	});

	it("has at most eight", () => {
		expect(searchWords("aa bb cc dd ee ff gg hh ii jj kk")).toEqual([
			"aa",
			"bb",
			"cc",
			"dd",
			"ee",
			"ff",
			"gg",
			"hh",
		]);
	});
});
