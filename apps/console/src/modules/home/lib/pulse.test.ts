import { describe, expect, it } from "vitest";

import { change, duration, investorDraft, runway } from "./pulse";

describe("pulse", () => {
	it("says how a number moved, in the colour of better or worse", () => {
		expect(change({ value: 1, change: 12, series: [] }, "percent")).toEqual({
			text: "+12%",
			tone: "up",
		});
		expect(change({ value: 1, change: 3, series: [] }, "points")).toEqual({
			text: "+3 pts",
			tone: "up",
		});
		expect(change({ value: 1, change: -40, series: [] }, "percent", true)).toEqual({
			text: "−40%",
			tone: "up",
		});
		expect(change({ value: 1, change: null, series: [] }, "percent")).toBeUndefined();
	});

	it("says how long the money lasts at the net burn", () => {
		const finance = { cash: 14280, currency: "USD", costs: [{ label: "AI", monthly: 1020 }] };
		expect(runway(finance, null)).toEqual({ months: 14, burn: 1020, costs: 1020, currency: "USD" });
		expect(runway(finance, 2000)?.months).toBeNull();
		expect(runway({ costs: [] }, null)).toBeNull();
	});

	it("puts lead times and the investor update in words", () => {
		expect(duration(0.1)).toBe("6m");
		expect(duration(6)).toBe("6h");
		expect(duration(72)).toBe("3d");
		const draft = investorDraft(
			{
				days: 30,
				sources: { stripe: false, posthog: false, sentry: false },
				shipping: {
					deploys: 9,
					merged: 23,
					leadTimeHours: 6,
					byAgents: 17,
					byPeople: 6,
					repositories: 1,
					failed: [],
				},
				snapshot: null,
				reading: false,
			},
			"RabtX",
		);
		expect(draft).toContain("30-day investor update for RabtX");
		expect(draft).toContain("9 deploys, 23 pull requests merged (17 by agents)");
	});
});
