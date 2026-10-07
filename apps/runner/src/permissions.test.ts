import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Who } from "./auth";
import { signedOut } from "./auth";
import { ChatHub } from "./chat/hub";
import { chatCommand } from "./chat/routes";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { may, readOnly } from "./permissions";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

const who = (role: Who["role"], extra: Partial<Who> = {}): Who => ({
	userId: "u1",
	workspace: "ws-1",
	role,
	...extra,
});

describe("may", () => {
	it("gives each built-in role the Figma defaults", () => {
		expect(may(who("owner"), "production")).toBe(true);
		expect(may(who("admin"), "machines")).toBe(true);
		expect(may(who("member"), "startAgents")).toBe(true);
		expect(may(who("member"), "machines")).toBe(false);
		expect(may(who("viewer"), "startAgents")).toBe(false);
	});

	it("follows the workspace's changes, but never takes anything from the owner", () => {
		const settings = {
			rolePermissions: { member: { mergePulls: false, machines: true } },
		};
		expect(may(who("member", { settings }), "mergePulls")).toBe(false);
		expect(may(who("member", { settings }), "machines")).toBe(true);
		expect(may(who("member", { settings }), "startAgents")).toBe(true);
		expect(may(who("owner", { settings: { rolePermissions: {} } }), "invite")).toBe(true);
	});

	it("gives a custom role exactly its own permissions", () => {
		const settings = { customRoles: [{ id: "qa", permissions: { approveCommands: true } }] };
		const qa = who("member", { customRole: "qa", settings });
		expect(may(qa, "approveCommands")).toBe(true);
		expect(may(qa, "startAgents")).toBe(false);
		// A custom role the workspace removed falls back to the built-in role.
		expect(may(who("member", { customRole: "gone", settings }), "startAgents")).toBe(true);
	});

	it("treats only viewers as read-only", () => {
		expect(readOnly(who("viewer"))).toBe(true);
		expect(readOnly(who("member"))).toBe(false);
	});
});

describe("chat commands by role", () => {
	function hub() {
		const calls: string[] = [];
		const fake = {
			prompt: async () => {
				calls.push("prompt");
			},
			cancel: () => calls.push("cancel"),
			approve: () => calls.push("approve"),
			configure: async () => {
				calls.push("configure");
			},
		} as unknown as ChatHub;
		return { fake, calls };
	}

	it("lets a member write and approve, and stops a viewer doing either", () => {
		const errors: string[] = [];
		const member = hub();
		chatCommand(
			member.fake,
			who("member"),
			"s1",
			{ t: "prompt", text: "hi" },
			errors.push.bind(errors),
		);
		chatCommand(
			member.fake,
			who("member"),
			"s1",
			{ t: "approve", id: "a1", optionId: null },
			errors.push.bind(errors),
		);
		expect(member.calls).toEqual(["prompt", "approve"]);

		const viewer = hub();
		for (const command of [
			{ t: "prompt", text: "hi" },
			{ t: "approve", id: "a1", optionId: null },
			{ t: "cancel" },
		] as const)
			chatCommand(viewer.fake, who("viewer"), "s1", command, errors.push.bind(errors));
		expect(viewer.calls).toEqual([]);
		expect(errors).toHaveLength(3);
	});

	it("keeps approving to roles allowed to approve", () => {
		const errors: string[] = [];
		const { fake, calls } = hub();
		const settings = { rolePermissions: { member: { approveCommands: false } } };
		chatCommand(
			fake,
			who("member", { settings }),
			"s1",
			{ t: "approve", id: "a1", optionId: null },
			(e) => errors.push(e),
		);
		expect(calls).toEqual([]);
		expect(errors[0]).toContain("can't");
	});
});

describe("roles over HTTP and sockets", () => {
	const projectsDir = mkdtempSync(join(tmpdir(), "grid-viewer-"));
	const config = {
		...readConfig({ RUNNER_PROJECTS_DIR: projectsDir, RUNNER_CWD: projectsDir }),
		port: 0,
		shell: "/bin/sh",
	};
	const store = new TerminalStore(config, spawnPty);
	const people: Record<string, Who> = {
		owner: who("owner"),
		admin: who("admin"),
		member: who("member"),
		viewer: who("viewer"),
		// A member the workspace let manage its machines (Settings → Roles).
		trusted: who("member", { settings: { rolePermissions: { member: { machines: true } } } }),
	};
	const server = startServer(
		config,
		store,
		async (token) => (people[token] ? { who: people[token] } : signedOut),
		new ChatHub(new ChatStore(":memory:"), new Map(), projectsDir),
	);
	const base = `http://127.0.0.1:${server.port}`;
	afterAll(() => {
		store.closeAll();
		void server.stop(true);
		rmSync(projectsDir, { recursive: true, force: true });
	});
	const as = (token: string) => ({
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	});
	const openTerminal = (token: string) =>
		fetch(`${base}/terminals`, {
			method: "POST",
			headers: as(token),
			body: JSON.stringify({ cols: 80, rows: 24 }),
		});

	it("gives a shell on this machine only to roles that manage its machines", async () => {
		expect((await openTerminal("owner")).status).toBe(201);
		expect((await openTerminal("admin")).status).toBe(201);
		expect((await openTerminal("trusted")).status).toBe(201);
		expect((await openTerminal("member")).status).toBe(403);
		expect((await openTerminal("viewer")).status).toBe(403);
		expect((await fetch(`${base}/terminals`, { headers: as("member") })).status).toBe(403);
		const setup = await fetch(`${base}/chat/providers/claude/setup`, {
			method: "POST",
			headers: as("member"),
			body: JSON.stringify({ step: "install" }),
		});
		expect(setup.status).toBe(403);
	});

	it("closes a member's terminal socket instead of attaching it", async () => {
		const ws = new WebSocket(`ws://127.0.0.1:${server.port}/terminal`);
		const closed = new Promise<number>((resolve) =>
			ws.addEventListener("close", (event) => resolve(event.code)),
		);
		ws.addEventListener("open", () =>
			ws.send(JSON.stringify({ t: "hello", token: "member", id: "any-terminal" })),
		);
		expect(await closed).toBe(4403);
	});
});
