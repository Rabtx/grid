import { describe, expect, it } from "vitest";
import { toSlug } from "./slug";

describe("toSlug", () => {
	it("lowercases and dashes separators", () => {
		expect(toSlug("Grid Control Plane")).toBe("grid-control-plane");
	});

	it("collapses runs of punctuation into one dash", () => {
		expect(toSlug("Grid -- v2 // host")).toBe("grid-v2-host");
	});

	it("trims leading and trailing separators", () => {
		expect(toSlug("  ...Grid!  ")).toBe("grid");
	});

	it("keeps digits", () => {
		expect(toSlug("agent 42")).toBe("agent-42");
	});

	it("caps at the column width without a trailing dash", () => {
		const slug = toSlug(`${"a".repeat(63)} tail`);
		expect(slug.length).toBeLessThanOrEqual(64);
		expect(slug.endsWith("-")).toBe(false);
	});

	it("returns an empty string when nothing survives", () => {
		expect(toSlug("!!!")).toBe("");
	});
});
