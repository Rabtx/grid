import { describe, expect, it } from "vitest";

import { computeSelectionRange, findWordBounds } from "./touch-selection";

describe("findWordBounds", () => {
	it("finds standard word boundaries", () => {
		const line = "git status --short";
		expect(findWordBounds(line, 5)).toEqual({ start: 4, length: 6 }); // "status"
		expect(findWordBounds(line, 0)).toEqual({ start: 0, length: 3 }); // "git"
		expect(findWordBounds(line, 12)).toEqual({ start: 11, length: 7 }); // "--short"
	});

	it("groups file paths and URLs together", () => {
		const line = "check https://github.com/grid/apps for details";
		expect(findWordBounds(line, 10)).toEqual({ start: 6, length: 28 }); // "https://github.com/grid/apps"
	});

	it("handles whitespace gracefully", () => {
		const line = "hello   world";
		expect(findWordBounds(line, 6)).toEqual({ start: 6, length: 1 });
	});
});

describe("computeSelectionRange", () => {
	it("computes single-line selection length", () => {
		const range = computeSelectionRange(5, 10, 15, 10, 80);
		expect(range).toEqual({ col: 5, row: 10, length: 10 });
	});

	it("computes multi-line selection length", () => {
		const range = computeSelectionRange(5, 10, 20, 12, 80);
		// 2 full lines (2 * 80 = 160) + (20 - 5) = 175
		expect(range).toEqual({ col: 5, row: 10, length: 175 });
	});

	it("reverses backwards selection cleanly", () => {
		const range = computeSelectionRange(20, 12, 5, 10, 80);
		expect(range).toEqual({ col: 5, row: 10, length: 175 });
	});
});
