import { describe, expect, it } from "vitest";

import { keyLimits } from "./key-limits";

describe("a key's limits in words", () => {
	const now = Date.parse("2026-10-27T12:00:00Z");
	it("names when it expires, what it may spend, and what it sees", () => {
		expect(
			keyLimits({ expiresAt: null, budgetUsd: null, spentUsd: 0, ownThreads: false }, now),
		).toEqual([]);
		expect(
			keyLimits(
				{ expiresAt: "2026-11-03T12:00:00Z", budgetUsd: 5, spentUsd: 1.5, ownThreads: true },
				now,
			),
		).toEqual(["expires in 7 days", "$1.50 of $5.00 in 30 days", "only its own threads"]);
		expect(
			keyLimits(
				{ expiresAt: "2026-10-26T12:00:00Z", budgetUsd: null, spentUsd: 0, ownThreads: false },
				now,
			),
		).toEqual(["expired"]);
	});
});
