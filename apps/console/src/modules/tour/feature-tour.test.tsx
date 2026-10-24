import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOUR_SLIDES } from "./content";
import { FeatureTour } from "./feature-tour";
import { tourStore } from "./store";

let dispose: (() => void) | undefined;
beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	dispose?.();
	document.body.replaceChildren();
	vi.useRealTimers();
});

function mount(): HTMLElement {
	const root = document.createElement("div");
	document.body.append(root);
	dispose = render(() => <FeatureTour />, root);
	return root;
}

describe("feature tour", () => {
	it("opens once on a device, walks every slide, and stays closed after", () => {
		const root = mount();
		vi.advanceTimersByTime(2000);
		flush();
		expect(tourStore.open()).toBe(true);
		for (const slide of TOUR_SLIDES) {
			expect(root.textContent).toContain(slide.title);
			const next = [...root.querySelectorAll("button")].find(
				(button) => button.textContent === "Next" || button.textContent === "Done",
			);
			next?.click();
			flush();
		}
		expect(tourStore.open()).toBe(false);
		expect(tourStore.seen()).toBe(true);

		dispose?.();
		mount();
		vi.advanceTimersByTime(2000);
		flush();
		expect(tourStore.open()).toBe(false);
	});

	it("can be replayed on asking", () => {
		localStorage.setItem("grid:feature-tour:agent-threads-1", "seen");
		const root = mount();
		tourStore.show();
		flush();
		expect(root.textContent).toContain(TOUR_SLIDES[0]?.title);
		tourStore.close();
	});
});

describe("a new edition", () => {
	it("shows only its own slides to a device that saw the last one", () => {
		localStorage.setItem("grid:feature-tour:agent-threads-1", "seen");
		mount();
		vi.advanceTimersByTime(2000);
		flush();
		const shown = tourStore.slides();
		expect(shown.length).toBeGreaterThan(0);
		expect(shown.every((slide) => slide.edition !== "agent-threads-1")).toBe(true);
		tourStore.close();
		expect(tourStore.seen()).toBe(true);
	});
});
