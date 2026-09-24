import { describe, expect, it } from "vitest";

import { followFinger, shouldDismiss } from "./swipe";

describe("shouldDismiss", () => {
	it("dismisses past a third of the sheet", () => {
		expect(shouldDismiss({ distance: 250, size: 600, velocity: 0.1 })).toBe(true);
		expect(shouldDismiss({ distance: 150, size: 600, velocity: 0.1 })).toBe(false);
	});

	it("dismisses a quick flick even when it is short", () => {
		expect(shouldDismiss({ distance: 60, size: 600, velocity: 0.9 })).toBe(true);
	});

	it("keeps the sheet when the finger was pulling back at the end", () => {
		expect(shouldDismiss({ distance: 300, size: 600, velocity: -0.4 })).toBe(false);
	});

	it("never dismisses a swipe the wrong way", () => {
		expect(shouldDismiss({ distance: -80, size: 600, velocity: -1 })).toBe(false);
	});
});

describe("followFinger", () => {
	it("tracks the finger in the dismiss direction", () => {
		expect(followFinger(120)).toBe(120);
	});

	it("resists, and caps, a pull the other way", () => {
		expect(followFinger(-16)).toBe(-8);
		expect(followFinger(-10_000)).toBe(-24);
	});
});
