import { describe, expect, it } from "vitest";

import type { SignInSession } from "../services/account.service";
import { orderSessions } from "./sessions";

const session = (id: string, lastUsedAt: string, isCurrent = false): SignInSession => ({
	id,
	userAgent: null,
	ipAddress: null,
	createdAt: lastUsedAt,
	lastUsedAt,
	isCurrent,
});

describe("orderSessions", () => {
	it("puts this device first, then the most recently used", () => {
		const ordered = orderSessions([
			session("old", "2026-09-01T00:00:00Z"),
			session("here", "2026-08-01T00:00:00Z", true),
			session("new", "2026-10-06T00:00:00Z"),
		]);
		expect(ordered.map((item) => item.id)).toEqual(["here", "new", "old"]);
	});
});
