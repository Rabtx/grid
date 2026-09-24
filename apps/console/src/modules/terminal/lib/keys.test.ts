import { describe, expect, it } from "vitest";

import { applyModifiers, arrowSequence } from "./keys";

const none = { ctrl: false, alt: false };
const ctrl = { ctrl: true, alt: false };
const alt = { ctrl: false, alt: true };

describe("applyModifiers", () => {
	it("passes input through when nothing is armed", () => {
		expect(applyModifiers("ls -la\r", none)).toBe("ls -la\r");
	});

	it("turns Ctrl+letter into its control code, whatever the case", () => {
		expect(applyModifiers("c", ctrl)).toBe("\x03");
		expect(applyModifiers("C", ctrl)).toBe("\x03");
		expect(applyModifiers("d", ctrl)).toBe("\x04");
		expect(applyModifiers("z", ctrl)).toBe("\x1a");
	});

	it("maps Ctrl with the classic symbols", () => {
		expect(applyModifiers("[", ctrl)).toBe("\x1b");
		expect(applyModifiers(" ", ctrl)).toBe("\x00");
		expect(applyModifiers("?", ctrl)).toBe("\x7f");
	});

	it("prefixes ESC for Alt, and combines with Ctrl", () => {
		expect(applyModifiers("b", alt)).toBe("\x1bb");
		expect(applyModifiers("x", { ctrl: true, alt: true })).toBe("\x1b\x18");
	});

	it("leaves a paste or an IME word alone", () => {
		expect(applyModifiers("hello", ctrl)).toBe("hello");
	});
});

describe("arrowSequence", () => {
	it("uses CSI in normal mode and SS3 in application cursor mode", () => {
		expect(arrowSequence("up", false, none)).toBe("\x1b[A");
		expect(arrowSequence("up", true, none)).toBe("\x1bOA");
		expect(arrowSequence("left", false, none)).toBe("\x1b[D");
	});

	it("encodes modifiers as xterm does", () => {
		expect(arrowSequence("right", true, ctrl)).toBe("\x1b[1;5C");
		expect(arrowSequence("left", false, alt)).toBe("\x1b[1;3D");
	});
});
