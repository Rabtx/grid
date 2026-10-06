import { describe, expect, it } from "vitest";
import { cents, dollars, parseCents } from "./operate-money";
describe("Operate money", () => {
	it("keeps known zero distinct from missing cost", () => {
		expect(cents(null)).toBe("Unknown");
		expect(dollars(null)).toBe("Unknown");
		expect(cents(0)).toBe("$0.00");
		expect(cents(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
		expect(dollars(0)).toBe("$0.00");
	});
	it("converts exact decimal input to integer cents", () => {
		expect(parseCents("0.29")).toBe(29);
		expect(parseCents("12.3")).toBe(1230);
		expect(parseCents("0")).toBe(0);
		expect(parseCents("999999.99")).toBe(99999999);
	});
	it("rejects rounding, exponent, negative and unsafe input", () => {
		for (const value of ["1.001", "-1", "1e3", ".4", "", "Infinity", "999999999999999999"])
			expect(parseCents(value)).toBeNull();
	});
});
