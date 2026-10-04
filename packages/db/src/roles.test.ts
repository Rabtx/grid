import { describe, expect, it } from "bun:test";

import { mayDo, ROLE_DEFAULTS, ROLE_PERMISSIONS } from "./roles";

describe("mayDo", () => {
	it("lets the owner do everything and the others their defaults", () => {
		for (const permission of ROLE_PERMISSIONS) {
			expect(mayDo(permission, "owner", null, {})).toBe(true);
			expect(mayDo(permission, "viewer", null, {})).toBe(false);
			expect(mayDo(permission, "member", null, {})).toBe(ROLE_DEFAULTS.member[permission]);
		}
	});

	it("reads the workspace's changes and custom roles", () => {
		const settings = {
			rolePermissions: { admin: { invite: false } },
			customRoles: [{ id: "qa", name: "QA", permissions: { mergePulls: true } }],
		};
		expect(mayDo("invite", "admin", null, settings)).toBe(false);
		expect(mayDo("machines", "admin", null, settings)).toBe(true);
		expect(mayDo("mergePulls", "member", "qa", settings)).toBe(true);
		expect(mayDo("startAgents", "member", "qa", settings)).toBe(false);
	});
});
