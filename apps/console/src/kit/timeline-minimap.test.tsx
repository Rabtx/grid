import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineMinimap } from "./timeline-minimap";

/** Give an element a fixed box, as a browser would lay it out. */
function lay(element: HTMLElement, box: { top: number; height: number; width?: number }): void {
	element.getBoundingClientRect = () =>
		({
			top: box.top,
			height: box.height,
			bottom: box.top + box.height,
			width: box.width ?? 600,
		}) as DOMRect;
}

describe("TimelineMinimap", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	/** A 1000px-wide window onto four 250px turns, the first two on screen. */
	function mount(prompts: string[], columnWidth = 600) {
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
		scroller.scrollBy = vi.fn();
		lay(scroller, { top: 0, height: 500, width: 1000 });
		const content = document.createElement("div");
		const turns = prompts.map((prompt, index) => {
			const turn = document.createElement("section");
			turn.setAttribute("data-minimap-mark", "");
			turn.setAttribute("data-minimap-prompt", prompt);
			turn.setAttribute("data-minimap-reply", `**Reply** to ${prompt}`);
			turn.scrollIntoView = vi.fn();
			lay(turn, { top: index * 250, height: 250, width: columnWidth });
			content.append(turn);
			return turn;
		});
		scroller.append(content);
		document.body.append(scroller);
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(() => <TimelineMinimap scroller={() => scroller} />, host);
		flush();
		return { host, scroller, turns };
	}

	const strips = (host: HTMLElement) => [...host.querySelectorAll("[data-in-view]")];
	const ladder = (host: HTMLElement) =>
		host.querySelector<HTMLButtonElement>('button[aria-label^="Jump to message"]');

	it("draws one strip per message and inks the ones on screen", () => {
		const { host } = mount(["Plan", "Chart", "Fix", "Ship"]);
		expect(strips(host).map((strip) => strip.getAttribute("data-in-view"))).toEqual([
			"true",
			"true",
			"false",
			"false",
		]);
	});

	it("stays hidden with fewer than two messages", () => {
		const { host } = mount(["Only one"]);
		expect(ladder(host)).toBeNull();
	});

	it("keeps itself shown when the gutter is wide, and only on hover when it is not", () => {
		expect(mount(["A", "B"], 600).host.querySelector("[data-persistent-gutter]")).toHaveProperty(
			"dataset.persistentGutter",
			"true",
		);
		dispose?.();
		document.body.replaceChildren();
		expect(mount(["A", "B"], 960).host.querySelector("[data-persistent-gutter]")).toHaveProperty(
			"dataset.persistentGutter",
			"false",
		);
	});

	it("previews the message and its reply as plain words, and jumps to it", () => {
		const { host, turns } = mount(["Plan", "Chart", "Fix", "Ship"]);
		const button = ladder(host);
		if (!button) throw new Error("no ladder");
		lay(button, { top: 0, height: 300 });
		button.dispatchEvent(new MouseEvent("mousemove", { clientY: 300, bubbles: true }));
		flush();
		expect(host.textContent).toContain("Ship");
		expect(host.textContent).toContain("Reply to Ship");
		expect(host.textContent).not.toContain("**");
		button.dispatchEvent(new MouseEvent("click", { clientY: 100, bubbles: true }));
		expect(turns[1]?.scrollIntoView).toHaveBeenCalled();
	});

	it("moves with the keyboard and jumps on Enter", () => {
		const { host, turns } = mount(["Plan", "Chart", "Fix"]);
		const button = ladder(host);
		button?.focus();
		flush();
		button?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
		flush();
		button?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(turns[2]?.scrollIntoView).toHaveBeenCalled();
	});

	it("scrolls the thread with the wheel over it", () => {
		const { host, scroller } = mount(["Plan", "Chart"]);
		host
			.querySelector("[data-persistent-gutter]")
			?.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, cancelable: true }));
		expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 120, left: 0 });
	});
});
