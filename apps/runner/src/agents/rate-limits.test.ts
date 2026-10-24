import { describe, expect, it } from "bun:test";

import { claudeRateLimits, codexRateLimits, mergeLimits } from "./rate-limits";

describe("rate limits", () => {
	it("read Claude's rate_limit_event, nested or flat", () => {
		expect(
			claudeRateLimits({
				type: "rate_limit_event",
				rate_limit_info: {
					status: "allowed_warning",
					rateLimitType: "five_hour",
					utilization: 0.82,
					resetsAt: 1_793_000_000,
				},
			}),
		).toEqual([
			{
				window: "5h",
				usedPercent: 82,
				resetsAt: new Date(1_793_000_000 * 1000).toISOString(),
				limited: false,
			},
		]);
		expect(
			claudeRateLimits({
				type: "rate_limit_event",
				status: "rejected",
				rateLimitType: "seven_day",
			}),
		).toEqual([{ window: "Weekly", usedPercent: 100, resetsAt: null, limited: true }]);
		expect(claudeRateLimits({ type: "rate_limit_event" })).toEqual([]);
		// What Claude Code sends on a plan with no meter: nothing to draw.
		expect(
			claudeRateLimits({
				type: "rate_limit_event",
				rate_limit_info: {
					status: "allowed",
					rateLimitType: "ccr_promotional",
					resetsAt: 1_793_000_000,
				},
			}),
		).toEqual([]);
	});

	it("read Codex's primary and secondary windows", () => {
		expect(
			codexRateLimits({
				rateLimits: {
					primary: { usedPercent: 31, windowDurationMins: 300, resetsAt: 1_793_000_000 },
					secondary: { usedPercent: 100, windowDurationMins: 10_080, resetsAt: null },
				},
			}),
		).toEqual([
			{
				window: "5h",
				usedPercent: 31,
				resetsAt: new Date(1_793_000_000 * 1000).toISOString(),
				limited: false,
			},
			{ window: "Weekly", usedPercent: 100, resetsAt: null, limited: true },
		]);
	});

	it("replace each window by its newest report", () => {
		const five = { window: "5h", usedPercent: 10, resetsAt: null, limited: false };
		const week = { window: "Weekly", usedPercent: 40, resetsAt: null, limited: false };
		expect(mergeLimits([five, week], [{ ...five, usedPercent: 20 }])).toEqual([
			{ ...five, usedPercent: 20 },
			week,
		]);
	});
});
