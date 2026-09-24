import { describe, expect, it } from "vitest";

import { lineForThumb, MIN_THUMB_PX, thumbGeometry } from "./scrollbar";

const state = { trackHeight: 600, rows: 30, viewportY: 0, baseY: 270 };

describe("thumbGeometry", () => {
	it("hides the thumb when there is nothing to scroll", () => {
		expect(thumbGeometry({ ...state, baseY: 0 })).toBeNull();
	});

	it("sizes the thumb by the share of lines on screen, never below a fingertip", () => {
		expect(thumbGeometry(state)?.height).toBe(60);
		expect(thumbGeometry({ ...state, baseY: 100_000 })?.height).toBe(MIN_THUMB_PX);
	});

	it("puts the thumb at the top, middle and bottom of the track", () => {
		expect(thumbGeometry(state)?.top).toBe(0);
		expect(thumbGeometry({ ...state, viewportY: 135 })?.top).toBe(270);
		expect(thumbGeometry({ ...state, viewportY: 270 })?.top).toBe(540);
	});
});

describe("lineForThumb", () => {
	it("maps the thumb's position back to a line", () => {
		expect(lineForThumb(0, state)).toBe(0);
		expect(lineForThumb(270, state)).toBe(135);
		expect(lineForThumb(540, state)).toBe(270);
	});

	it("pins to the ends when dragged past them", () => {
		expect(lineForThumb(-80, state)).toBe(0);
		expect(lineForThumb(9_999, state)).toBe(270);
	});
});
