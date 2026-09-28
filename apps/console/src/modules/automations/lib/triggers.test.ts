import { describe, expect, it } from "vitest";

import { describeTrigger, LOCAL_ZONE, newTrigger, untilLabel } from "./triggers";

describe("triggers", () => {
	it("describes schedules in words, naming the zone only when it is not this one", () => {
		expect(describeTrigger(newTrigger("daily"))).toBe("Every day at 09:00");
		expect(
			describeTrigger({
				kind: "schedule",
				cadence: "weekly",
				time: "08:30",
				day: 1,
				timezone: "UTC",
			}),
		).toBe(LOCAL_ZONE === "UTC" ? "Mondays at 08:30" : "Mondays at 08:30 (UTC)");
		expect(describeTrigger(newTrigger("hourly"))).toBe("Every hour at :00");
		expect(describeTrigger(newTrigger("checks_failed"))).toBe("Checks failed on my pull request");
	});

	it("keeps the time and zone when the kind changes", () => {
		const weekly = newTrigger("weekly", {
			kind: "schedule",
			cadence: "daily",
			time: "18:15",
			timezone: "Asia/Karachi",
		});
		expect(weekly).toEqual({
			kind: "schedule",
			cadence: "weekly",
			time: "18:15",
			day: 1,
			timezone: "Asia/Karachi",
		});
	});

	it("says how soon a run is", () => {
		const now = Date.parse("2026-09-28T09:00:00Z");
		expect(untilLabel("2026-09-28T09:20:00Z", now)).toBe("in 20 min");
		expect(untilLabel("2026-09-28T12:00:00Z", now)).toBe("in 3 h");
		expect(untilLabel("2026-10-01T09:00:00Z", now)).toBe("in 3 d");
	});
});
