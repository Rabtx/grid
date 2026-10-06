import { flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScrollRail } from "./scroll-rail";

describe("ScrollRail component", () => {
	let container: HTMLDivElement;
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("stays hidden when scroller content fits within clientHeight", async () => {
		const scroller = document.createElement("div");
		Object.defineProperty(scroller, "scrollHeight", { value: 200, configurable: true });
		Object.defineProperty(scroller, "clientHeight", { value: 200, configurable: true });
		Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true, configurable: true });

		dispose = render(() => <ScrollRail scroller={() => scroller} />, container);

		// With no overflow, the rail element should not be rendered
		const rail = container.querySelector('[aria-hidden="true"]');
		expect(rail).toBeNull();
	});

	it("renders track and grill thumb when scroller has overflow", async () => {
		const scroller = document.createElement("div");
		Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
		Object.defineProperty(scroller, "clientHeight", { value: 200, configurable: true });
		Object.defineProperty(scroller, "scrollTop", {
			value: 200,
			writable: true,
			configurable: true,
		});

		dispose = render(() => <ScrollRail scroller={() => scroller} />, container);

		const track = container.querySelector('[aria-hidden="true"]');
		expect(track).not.toBeNull();

		// Check for the tactile grill ridges inside the thumb
		const ridges = track?.querySelectorAll("span.rounded-full");
		expect(ridges?.length).toBe(3);
	});

	it("updates thumb position when scroller dispatches scroll event", async () => {
		const scroller = document.createElement("div");
		Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
		Object.defineProperty(scroller, "clientHeight", { value: 200, configurable: true });
		Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true, configurable: true });

		dispose = render(() => <ScrollRail scroller={() => scroller} />, container);

		const thumb = container.querySelector(".group\\/thumb") as HTMLElement;
		expect(thumb).not.toBeNull();
		const initialTop = parseFloat(thumb.style.top);
		expect(initialTop).toBe(0);

		// Allow onSettled lifecycle to attach listeners
		await new Promise((r) => setTimeout(r, 10));

		// Scroll down halfway
		scroller.scrollTop = 400;
		scroller.dispatchEvent(new Event("scroll"));
		flush();

		const updatedTop = parseFloat(thumb.style.top);
		expect(updatedTop).toBeGreaterThan(0);
	});
});
