import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { Workspace } from "../types/workspace.types";
import { useTerminalAccess } from "./terminal-access";

let current: Partial<Workspace> | null = null;
vi.mock("../context/workspaces-context", () => ({
	useWorkspaces: () => ({ current: () => current }),
}));

const access = (workspace: Partial<Workspace> | null): boolean => {
	current = workspace;
	return createRoot((dispose) => {
		const allowed = useTerminalAccess()();
		dispose();
		return allowed;
	});
};

describe("useTerminalAccess", () => {
	it("gives terminals to the roles the runner gives them to", () => {
		expect(access({ role: "owner" })).toBe(true);
		expect(access({ role: "admin" })).toBe(true);
		expect(access({ role: "member" })).toBe(false);
		expect(access({ role: "viewer" })).toBe(false);
		expect(access(null)).toBe(false);
	});

	it("follows Settings → Roles", () => {
		expect(
			access({
				role: "member",
				settings: { rolePermissions: { member: { machines: true } } },
			} as Partial<Workspace>),
		).toBe(true);
		expect(
			access({
				role: "admin",
				settings: { rolePermissions: { admin: { machines: false } } },
			} as Partial<Workspace>),
		).toBe(false);
	});
});
