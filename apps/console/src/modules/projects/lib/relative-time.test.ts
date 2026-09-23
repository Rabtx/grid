import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const now = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (iso: string) => relativeTime(iso, now);

describe("relativeTime", () => {
	it("counts minutes, hours and days inside the last week", () => {
		expect(ago("2026-09-24T11:59:30.000Z")).toBe("just now");
		expect(ago("2026-09-24T11:56:00.000Z")).toBe("4m");
		expect(ago("2026-09-24T09:00:00.000Z")).toBe("3h");
		expect(ago("2026-09-19T12:00:00.000Z")).toBe("5d");
	});

	it("names yesterday between one and two days", () => {
		expect(ago("2026-09-23T11:00:00.000Z")).toBe("yesterday");
	});

	it("falls back to the date after a week", () => {
		expect(ago("2026-09-03T12:00:00.000Z")).toBe("Sep 3");
	});

	it("shows nothing for a timestamp it cannot read", () => {
		expect(ago("not a timestamp")).toBe("");
	});
});
