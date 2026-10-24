// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
	bindings,
	chordLabel,
	chordOf,
	conflicts,
	installKeybindings,
	normalizeChord,
	registerCommand,
	resetAllBindings,
	resetBindings,
	setBindings,
} from "./keybindings";

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	resetAllBindings();
	localStorage.clear();
});

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
	const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

function listen() {
	cleanups.push(installKeybindings(document));
}

describe("chords", () => {
	it("read a key press the same way on every layout", () => {
		expect(chordOf(new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true }))).toBe(
			"mod+k",
		);
		// Alt+W on a Mac types "∑": the key's place still names it.
		expect(chordOf(new KeyboardEvent("keydown", { key: "∑", code: "KeyW", altKey: true }))).toBe(
			"alt+w",
		);
		expect(
			chordOf(new KeyboardEvent("keydown", { key: "‘", code: "BracketRight", altKey: true })),
		).toBe("alt+]");
		// "?" already says Shift.
		expect(chordOf(new KeyboardEvent("keydown", { key: "?", shiftKey: true }))).toBe("?");
		expect(chordOf(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }))).toBeNull();
		expect(normalizeChord("Shift+Mod+K")).toBe("mod+shift+k");
		expect(chordLabel("g b")).toEqual([["G"], ["B"]]);
	});
});

describe("installKeybindings", () => {
	it("runs a command on its keys, and on the keys it was moved to", () => {
		listen();
		const run = vi.fn();
		cleanups.push(registerCommand("tab.close", run));
		press({ key: "w", code: "KeyW", altKey: true });
		expect(run).toHaveBeenCalledOnce();

		setBindings("tab.close", ["mod+shift+w"]);
		press({ key: "w", code: "KeyW", altKey: true });
		expect(run).toHaveBeenCalledOnce();
		press({ key: "W", code: "KeyW", ctrlKey: true, shiftKey: true });
		expect(run).toHaveBeenCalledTimes(2);
		expect(JSON.parse(localStorage.getItem("grid.keybindings") ?? "{}")).toEqual({
			"tab.close": ["mod+shift+w"],
		});

		resetBindings("tab.close");
		expect(bindings("tab.close")).toEqual(["alt+w"]);
	});

	it("takes a key off the command that had it, so no two share one", () => {
		setBindings("tab.close", ["mod+k"]);
		expect(bindings("palette.toggle")).toEqual([]);
		expect(conflicts().size).toBe(0);
	});

	it("runs chords while typing but not plain keys", () => {
		listen();
		const plain = vi.fn();
		const chord = vi.fn();
		cleanups.push(
			registerCommand("shortcuts.show", plain),
			registerCommand("palette.toggle", chord),
		);
		const input = document.createElement("input");
		document.body.append(input);
		press({ key: "?" }, input);
		press({ key: "k", code: "KeyK", metaKey: true }, input);
		expect(plain).not.toHaveBeenCalled();
		expect(chord).toHaveBeenCalledOnce();
		input.remove();
	});

	it("passes the key to an older handler when the newest declines it", () => {
		listen();
		const older = vi.fn();
		cleanups.push(
			registerCommand("list.next", older),
			registerCommand("list.next", () => false),
		);
		const event = press({ key: "j" });
		expect(older).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(true);
	});

	it("leaves a key nobody handles to the page", () => {
		listen();
		expect(press({ key: "w", code: "KeyW", altKey: true }).defaultPrevented).toBe(false);
	});

	it("runs sequences within one second and expires them", () => {
		listen();
		const run = vi.fn();
		cleanups.push(registerCommand("go.board", run));
		press({ key: "g" });
		press({ key: "b" });
		expect(run).toHaveBeenCalledOnce();
		vi.useFakeTimers();
		vi.setSystemTime(0);
		press({ key: "g" });
		vi.setSystemTime(1_001);
		press({ key: "b" });
		expect(run).toHaveBeenCalledOnce();
		vi.useRealTimers();
	});
});
