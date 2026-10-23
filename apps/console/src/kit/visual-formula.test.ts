import { describe, expect, it } from "vitest";

import { evaluate } from "./visual-formula";

describe("calculator formulas", () => {
	it("does arithmetic with precedence, powers right to left, and functions", () => {
		expect(evaluate("1 + 2 * 3", {})).toBe(7);
		expect(evaluate("(1 + 2) * 3", {})).toBe(9);
		expect(evaluate("2 ^ 3 ^ 2", {})).toBe(512);
		expect(evaluate("-seats * price", { seats: 3, price: 4 })).toBe(-12);
		expect(evaluate("round(max(a, b) / 3)", { a: 10, b: 20 })).toBe(7);
		expect(evaluate("10 % 4", {})).toBe(2);
	});

	it("refuses anything that is not arithmetic", () => {
		expect(() => evaluate("alert(1)", {})).toThrow("Unknown name alert");
		expect(() => evaluate("constructor", {})).toThrow("Unknown name");
		expect(() => evaluate("1 +", {})).toThrow();
		expect(() => evaluate("a; b", { a: 1, b: 2 })).toThrow();
	});
});
