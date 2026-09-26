import { describe, expect, it } from "vitest";

import { variants } from "./variants";

const button = variants({
	base: "btn",
	variants: { size: { sm: "h-7", md: "h-8" }, tone: { primary: "dark", ghost: "quiet" } },
	defaults: { size: "md", tone: "ghost" },
});

describe("variants", () => {
	it("uses the defaults when nothing is chosen", () => {
		expect(button()).toBe("btn h-8 quiet");
	});

	it("takes each chosen option and appends extra classes last", () => {
		expect(button({ size: "sm", tone: "primary", class: "w-full" })).toBe("btn h-7 dark w-full");
	});
});
