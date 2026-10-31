import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageRail } from "./message-rail";

/** Give an element a fixed box and scroll size, as a browser would lay it out. */
function lay(element: HTMLElement, box: { top: number; height: number }): void {
	element.getBoundingClientRect = () =>
		({ top: box.top, height: box.height, bottom: box.top + box.height }) as DOMRect;
}

describe("MessageRail", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	/** A 1000px thread in a 250px window scrolled to `scrollTop`, with four 250px turns. */
	function mount(scrollTop = 0): { scroller: HTMLDivElement; turns: HTMLElement[] } {
		vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
			run(0);
			return 1;
		});
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe(): void {}
				disconnect(): void {}
			},
		);
		const scroller = document.createElement("div");
		Object.defineProperties(scroller, {
			scrollHeight: { value: 1000 },
			clientHeight: { value: 250 },
			scrollTop: { value: scrollTop, writable: true },
		});
		lay(scroller, { top: 0, height: 250 });
		const content = document.createElement("div");
		const turns = [
			"Plan the release",
			"Chart the build times",
			"Fix the flaky test",
			"Ship it",
		].map((label, index) => {
			const turn = document.createElement("section");
			turn.setAttribute("data-rail-mark", "user");
			turn.setAttribute("data-rail-label", label);
			turn.scrollIntoView = vi.fn();
			lay(turn, { top: index * 250 - scrollTop, height: 250 });
			content.append(turn);
			return turn;
		});
		scroller.append(content);
		document.body.append(scroller);
		const host = document.createElement("div");
		document.body.append(host);
		// The rail's own height: 200px, so each 250px turn is a 50px segment.
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			get(this: HTMLElement) {
				return this.tagName === "NAV" ? 200 : 0;
			},
		});
		dispose = render(() => <MessageRail scroller={() => scroller} />, host);
		flush();
		return { scroller, turns };
	}

	afterEach(() => {
		delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
	});

	it("draws a segment per turn, where it sits, named by its prompt", () => {
		mount();
		const marks = [
			...document.querySelectorAll<HTMLButtonElement>("nav[aria-label='Messages'] button"),
		];
		expect(marks.map((mark) => mark.dataset.tooltip)).toEqual([
			"Plan the release",
			"Chart the build times",
			"Fix the flaky test",
			"Ship it",
		]);
		expect(marks.map((mark) => mark.style.top)).toEqual(["0px", "50px", "100px", "150px"]);
		expect(marks[0]?.getAttribute("aria-label")).toBe("Go to: Plan the release");
	});

	it("inks the turns on screen and jumps to a turn when its segment is pressed", () => {
		const { turns } = mount(250);
		const marks = [...document.querySelectorAll<HTMLButtonElement>("nav button")];
		const inked = marks.map((mark) => mark.firstElementChild?.className.includes("bg-fg-muted"));
		expect(inked).toEqual([false, true, false, false]);
		marks[2]?.click();
		expect(turns[2]?.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
	});
});
