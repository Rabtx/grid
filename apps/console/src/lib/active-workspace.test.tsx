import { afterEach, describe, expect, it, vi } from "vitest";

// The workspace is read once when the module loads, so each case loads a fresh copy.
async function load(stored: string | null) {
	vi.resetModules();
	if (stored) localStorage.setItem("grid.workspace", stored);
	return import("./active-workspace");
}

describe("active workspace", () => {
	afterEach(() => localStorage.clear());

	it("leaves paths, headers and hellos alone in the default workspace", async () => {
		const workspace = await load(null);
		expect(workspace.activeWorkspace()).toBeNull();
		expect(workspace.inWorkspace("/projects")).toBe("/projects");
		expect(workspace.workspaceHeaders()).toEqual({});
		expect(workspace.workspaceHello()).toEqual({});
	});

	it("scopes API paths, runner requests and socket hellos to a chosen workspace", async () => {
		const workspace = await load("acme");
		expect(workspace.inWorkspace("/projects/web/tasks")).toBe(
			"/workspaces/acme/projects/web/tasks",
		);
		expect(workspace.workspaceHeaders()).toEqual({ "X-Grid-Workspace": "acme" });
		expect(workspace.workspaceHello()).toEqual({ workspace: "acme" });
	});

	it("remembers a switch and forgets the last project of the workspace left", async () => {
		const workspace = await load("acme");
		localStorage.setItem("grid.project", "web");
		workspace.rememberWorkspace("beta");
		expect(localStorage.getItem("grid.workspace")).toBe("beta");
		expect(localStorage.getItem("grid.project")).toBeNull();
		workspace.rememberWorkspace(null);
		expect(localStorage.getItem("grid.workspace")).toBeNull();
	});
});

describe("resolveStart", () => {
	it("takes the workspace from the first segment of the URL", async () => {
		const { resolveStart } = await load(null);
		expect(resolveStart("/acme/board/web", "beta")).toEqual({
			inUrl: "acme",
			active: "acme",
			outside: false,
		});
	});

	it("falls back to the remembered workspace for the root and old section links", async () => {
		const { resolveStart } = await load(null);
		expect(resolveStart("/", "beta")).toEqual({ inUrl: null, active: "beta", outside: false });
		expect(resolveStart("/chat/web", null)).toEqual({ inUrl: null, active: null, outside: false });
		expect(resolveStart("/operate/web", "beta")).toEqual({
			inUrl: null,
			active: "beta",
			outside: false,
		});
	});

	it("keeps sign-in, setup and invites outside any workspace", async () => {
		const { resolveStart } = await load(null);
		for (const path of ["/login", "/setup", "/invite/abc"]) {
			expect(resolveStart(path, "beta")).toEqual({ inUrl: null, active: "beta", outside: true });
		}
	});
});
