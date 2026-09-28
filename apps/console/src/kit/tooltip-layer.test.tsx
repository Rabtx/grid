import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipLayer } from "./tooltip-layer";

describe("TooltipLayer", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.replaceChildren();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function mount(pointer: boolean): HTMLButtonElement {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: pointer,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		const button = document.createElement("button");
		button.dataset.tooltip = "New task";
		button.dataset.shortcut = "C";
		document.body.append(button);
		const host = document.createElement("div");
		document.body.append(host);
		dispose = render(() => <TooltipLayer />, host);
		flush();
		return button;
	}

	it("names a button after resting on it, with its shortcut, and hides on press", async () => {
		vi.useFakeTimers();
		const button = mount(true);
		button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
		vi.advanceTimersByTime(500);
		flush();
		const tip = document.querySelector('[aria-hidden="true"].fixed');
		expect(tip?.textContent).toBe("New taskC");
		button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		flush();
		expect(document.querySelector('[aria-hidden="true"].fixed')).toBeNull();
	});

	it("shows nothing on touch screens", () => {
		vi.useFakeTimers();
		const button = mount(false);
		button.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
		vi.advanceTimersByTime(500);
		flush();
		expect(document.querySelector('[aria-hidden="true"].fixed')).toBeNull();
	});
});
