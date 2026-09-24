// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { installShortcuts, type Shortcut } from "./shortcuts";

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

function press(key: string, target: EventTarget = document.body) {
	target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("installShortcuts", () => {
	it("runs registered shortcuts", () => {
		const run = vi.fn();
		const shortcuts: Shortcut[] = [{ keys: "?", label: "Help", run }];
		cleanups.push(installShortcuts(shortcuts, document));
		press("?");
		expect(run).toHaveBeenCalledOnce();
	});

	it("does not run shortcuts while typing", () => {
		const run = vi.fn();
		const input = document.createElement("input");
		document.body.append(input);
		cleanups.push(installShortcuts([{ keys: "n", label: "New", run }], document));
		press("n", input);
		expect(run).not.toHaveBeenCalled();
		input.remove();
	});

	it("runs sequences within one second and expires them", () => {
		const run = vi.fn();
		cleanups.push(installShortcuts([{ keys: "g b", label: "Board", run }], document));
		press("g");
		press("b");
		expect(run).toHaveBeenCalledOnce();
		vi.useFakeTimers();
		vi.setSystemTime(0);
		press("g");
		vi.setSystemTime(1_001);
		press("b");
		expect(run).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});
});
