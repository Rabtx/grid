import { describe, expect, it } from "vitest";

import { dollars } from "../services/spend.service";

describe("dollars", () => {
	it("shows cents, and less than a cent as such", () => {
		expect(dollars(0)).toBe("$0.00");
		expect(dollars(0.004)).toBe("<$0.01");
		expect(dollars(12.345)).toBe("$12.35");
	});
});
