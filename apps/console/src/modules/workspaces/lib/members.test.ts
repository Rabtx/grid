import { describe, expect, it } from "vitest";

import type { Member } from "../types/workspace.types";
import {
	canManage,
	choiceOf,
	expiresIn,
	mayDo,
	memberName,
	roleChoices,
	roleInput,
	roleName,
	rolesYouCanGive,
} from "./members";

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
	it("lets owners and admins invite by default, and follows the workspace's roles", () => {
		expect(mayDo("invite", "owner", null, {})).toBe(true);
		expect(mayDo("invite", "admin", null, {})).toBe(true);
		expect(mayDo("invite", "member", null, {})).toBe(false);
		expect(mayDo("invite", "member", null, { rolePermissions: { member: { invite: true } } })).toBe(
			true,
		);
		const settings = { customRoles: [{ id: "qa", name: "QA", permissions: { invite: true } }] };
		expect(mayDo("invite", "member", "qa", settings)).toBe(true);
		expect(mayDo("startAgents", "member", "qa", settings)).toBe(false);
	});

	it("holds custom roles in pickers as member-ranked choices", () => {
		const settings = { customRoles: [{ id: "qa", name: "QA", permissions: {} }] };
		expect(roleChoices("admin", settings, { owner: false }).map((item) => item.value)).toEqual([
			"admin",
			"member",
			"viewer",
			"custom:qa",
		]);
		expect(roleInput("custom:qa")).toEqual({ role: "member", customRole: "qa" });
		expect(choiceOf({ role: "member", customRole: "qa" })).toBe("custom:qa");
		expect(roleName({ role: "member", customRole: "qa" }, settings)).toBe("QA");
		expect(roleName({ role: "viewer" }, settings)).toBe("Viewer");
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
		expect(rolesYouCanGive("owner")).toEqual(["owner", "admin", "member", "viewer"]);
		expect(rolesYouCanGive("admin")).toEqual(["admin", "member", "viewer"]);
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
