import { describe, expect, it } from "vitest";

import { snoozed, snoozeUntil } from "./snooze";

describe("snooze times", () => {
	const wednesday = new Date(2026, 9, 28, 15, 30);
	it("an hour, tomorrow at nine, and next Monday at nine", () => {
		expect(snoozeUntil("hour", wednesday).getTime() - wednesday.getTime()).toBe(3_600_000);
		const tomorrow = snoozeUntil("tomorrow", wednesday);
		expect([tomorrow.getDate(), tomorrow.getHours(), tomorrow.getMinutes()]).toEqual([29, 9, 0]);
		const monday = snoozeUntil("week", wednesday);
		expect([monday.getDay(), monday.getDate(), monday.getHours()]).toEqual([1, 2, 9]);
		// On a Monday, the next one is a week on.
		expect(snoozeUntil("week", new Date(2026, 10, 2, 8)).getDate()).toBe(9);
	});
	it("is snoozed only until then", () => {
		const until = new Date(Date.now() + 60_000).toISOString();
		expect(snoozed({ snoozedUntil: until })).toBe(true);
		expect(snoozed({ snoozedUntil: until }, Date.now() + 120_000)).toBe(false);
		expect(snoozed({ snoozedUntil: null })).toBe(false);
	});
});
