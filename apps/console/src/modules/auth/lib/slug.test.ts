import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
	it("turns a workspace name into its URL slug", () => {
		expect(slugify("Acme Inc.")).toBe("acme-inc");
		expect(slugify("  --Grid Labs 2026--  ")).toBe("grid-labs-2026");
		expect(slugify("x".repeat(80))).toHaveLength(64);
	});
});
