import { describe, expect, it } from "vitest";

import { computeScrollAction } from "./touch-scroll";

describe("computeScrollAction", () => {
	it("scrolls lines on normal buffer", () => {
		expect(computeScrollAction("up", "normal", "none", false, 1, 1)).toEqual({
			kind: "scrollLines",
			amount: -1,
		});
		expect(computeScrollAction("down", "normal", "none", false, 1, 1)).toEqual({
			kind: "scrollLines",
			amount: 1,
		});
	});

	it("sends SGR wheel sequences on alternate buffer with mouse tracking enabled", () => {
		expect(computeScrollAction("up", "alternate", "any", false, 12, 5)).toEqual({
			kind: "send",
			data: "\x1b[<64;12;5M",
		});
		expect(computeScrollAction("down", "alternate", "vt200", false, 8, 20)).toEqual({
			kind: "send",
			data: "\x1b[<65;8;20M",
		});
		expect(computeScrollAction("up", "alternate", "drag", false, 1, 1)).toEqual({
			kind: "send",
			data: "\x1b[<64;1;1M",
		});
	});

	it("sends arrow sequences on alternate buffer when mouse tracking is disabled", () => {
		// Normal cursor mode
		expect(computeScrollAction("up", "alternate", "none", false, 1, 1)).toEqual({
			kind: "send",
			data: "\x1b[A",
		});
		expect(computeScrollAction("down", "alternate", "none", false, 1, 1)).toEqual({
			kind: "send",
			data: "\x1b[B",
		});

		// Application cursor mode (vim, less)
		expect(computeScrollAction("up", "alternate", "none", true, 1, 1)).toEqual({
			kind: "send",
			data: "\x1bOA",
		});
		expect(computeScrollAction("down", "alternate", "none", true, 1, 1)).toEqual({
			kind: "send",
			data: "\x1bOB",
		});
	});
});
