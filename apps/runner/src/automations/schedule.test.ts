import { describe, expect, test } from "bun:test";

import { nextRun, validTriggers, type ScheduleTrigger } from "./schedule";

describe("automation schedules", () => {
	test("hourly, daily, weekdays and weekly use the person's zone", () => {
		const after = new Date("2026-09-28T12:05:00Z"); // Monday 08:05 in New York
		const zone = "America/New_York";
		expect(
			nextRun({ kind: "schedule", cadence: "hourly", minute: 10, timezone: zone }, after),
		).toBe("2026-09-28T12:10:00.000Z");
		expect(
			nextRun({ kind: "schedule", cadence: "daily", time: "09:00", timezone: zone }, after),
		).toBe("2026-09-28T13:00:00.000Z");
		expect(
			nextRun(
				{ kind: "schedule", cadence: "weekdays", time: "09:00", timezone: zone },
				new Date("2026-10-03T12:00:00Z"),
			),
		).toBe("2026-10-05T13:00:00.000Z");
		expect(
			nextRun(
				{ kind: "schedule", cadence: "weekly", day: 1, time: "09:00", timezone: zone },
				after,
			),
		).toBe("2026-09-28T13:00:00.000Z");
		expect(
			nextRun(
				{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "Asia/Kathmandu" },
				after,
			),
		).toBe("2026-09-29T03:15:00.000Z");
	});
	test("spring gap moves a missing local time to the next day", () => {
		const trigger: ScheduleTrigger = {
			kind: "schedule",
			cadence: "daily",
			time: "02:30",
			timezone: "America/New_York",
		};
		expect(nextRun(trigger, new Date("2026-03-08T06:00:00Z"))).toBe("2026-03-09T06:30:00.000Z");
	});
	test("autumn repeated daily hour runs once, hourly repeats", () => {
		const daily: ScheduleTrigger = {
			kind: "schedule",
			cadence: "daily",
			time: "01:30",
			timezone: "America/New_York",
		};
		expect(nextRun(daily, new Date("2026-11-01T04:00:00Z"))).toBe("2026-11-01T05:30:00.000Z");
		expect(nextRun(daily, new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-02T06:30:00.000Z");
		expect(
			nextRun(
				{ kind: "schedule", cadence: "hourly", minute: 30, timezone: "America/New_York" },
				new Date("2026-11-01T05:30:00Z"),
			),
		).toBe("2026-11-01T06:30:00.000Z");
	});
	test("rejects invalid time zones, times and unbounded triggers", () => {
		expect(
			validTriggers([{ kind: "schedule", cadence: "daily", time: "25:00", timezone: "UTC" }]),
		).toBe(false);
		expect(
			validTriggers([
				{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "Nowhere/There" },
			]),
		).toBe(false);
		expect(validTriggers(Array(6).fill({ kind: "event", event: "pull_opened" }))).toBe(false);
	});
});
