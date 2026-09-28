import { describe, expect, it } from "vitest";

import type { Member } from "../types/workspace.types";
import { canInvite, canManage, expiresIn, memberName, rolesYouCanGive } from "./members";

const member = (over: Partial<Member> = {}): Member => ({
	userId: "u2",
	username: "sam",
	displayName: null,
	avatarUrl: null,
	role: "member",
	joinedAt: "2026-09-26T00:00:00Z",
	...over,
});

describe("member rules", () => {
	it("lets owners and admins invite, not members", () => {
		expect(canInvite("owner")).toBe(true);
		expect(canInvite("admin")).toBe(true);
		expect(canInvite("member")).toBe(false);
	});

	it("lets you manage people no more senior than you, and never yourself", () => {
		expect(canManage("admin", member({ role: "member" }), "u1")).toBe(true);
		expect(canManage("admin", member({ role: "admin" }), "u1")).toBe(true);
		expect(canManage("admin", member({ role: "owner" }), "u1")).toBe(false);
		expect(canManage("owner", member({ role: "owner" }), "u1")).toBe(true);
		expect(canManage("member", member(), "u1")).toBe(false);
		expect(canManage("owner", member({ userId: "u1" }), "u1")).toBe(false);
	});

	it("offers only the roles you hold or below", () => {
		expect(rolesYouCanGive("owner")).toEqual(["owner", "admin", "member"]);
		expect(rolesYouCanGive("admin")).toEqual(["admin", "member"]);
	});

	it("names people by display name, else username", () => {
		expect(memberName(member({ displayName: "Sam Lee" }))).toBe("Sam Lee");
		expect(memberName(member({ displayName: "  " }))).toBe("sam");
	});

	it("says how long an invite has left", () => {
		const now = Date.parse("2026-09-28T00:00:00Z");
		expect(expiresIn("2026-10-03T00:00:00Z", now)).toBe("expires in 5 d");
		expect(expiresIn("2026-09-28T05:00:00Z", now)).toBe("expires in 5 h");
		expect(expiresIn("2026-09-28T00:30:00Z", now)).toBe("expires soon");
	});
});
