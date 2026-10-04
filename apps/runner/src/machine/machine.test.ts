import { describe, expect, it } from "bun:test";

import type { Who } from "../auth";
import { AcpAgentStore } from "../agents/acp-agents";
import { systemName } from "./info";
import { autostartContent, MachinePrefsStore } from "./prefs";
import { type MachineDeps, machineRequest } from "./routes";

function deps(): MachineDeps & { applied: number[]; added: string[] } {
	const applied: number[] = [];
	const added: string[] = [];
	return {
		applied,
		added,
		prefs: new MachinePrefsStore(":memory:"),
		acpAgents: new AcpAgentStore(":memory:"),
		projectsDir: process.cwd(),
		startedAt: Date.now(),
		counts: () => ({ agents: 2, terminals: 3 }),
		apply: (prefs) => applied.push(prefs.concurrency),
		addAgent: (agent) => added.push(agent.id),
		removeAgent: () => {},
		knownAgent: (id) => id === "claude",
	};
}
const call = (method: string, path: string, who: Who, d: MachineDeps, body?: unknown) =>
	machineRequest(
		new Request(`http://runner${path}`, { method, body: body ? JSON.stringify(body) : undefined }),
		new URL(`http://runner${path}`),
		who,
		d,
	);
const admin: Who = { userId: "a", workspace: "w", role: "admin" };
const member: Who = { userId: "m", workspace: "w", role: "member" };

describe("this machine", () => {
	it("names the system", () => {
		expect(systemName("darwin", "24.1.0")).toBe("macOS 15");
		expect(systemName("linux", "7.2.3-arch1")).toBe("Linux 7.2");
	});
	it("writes a start-at-login entry that runs Grid from its checkout", () => {
		expect(autostartContent("linux", "/usr/bin/bun", "/grid")).toContain(
			`Exec=sh -c 'cd "/grid" && "/usr/bin/bun" run grid'`,
		);
		expect(autostartContent("darwin", "/bin/bun", "/grid")).toContain(
			"<key>WorkingDirectory</key><string>/grid</string>",
		);
	});
	it("says what it is and how busy, and lets admins change its runner", async () => {
		const d = deps();
		const read = await call("GET", "/machine", member, d);
		const data = ((await read?.json()) as { data: Record<string, unknown> }).data;
		expect(data).toMatchObject({ agentsRunning: 2, terminals: 3, prefs: { concurrency: 4 } });
		expect((data.info as { cores: number }).cores).toBeGreaterThan(0);
		expect((await call("PATCH", "/machine", member, d, { concurrency: 2 }))?.status).toBe(403);
		expect((await call("PATCH", "/machine", admin, d, { concurrency: 3 }))?.status).toBe(400);
		expect(
			(await call("PATCH", "/machine", admin, d, { concurrency: 2, keepAwake: true }))?.status,
		).toBe(200);
		expect(d.prefs.get()).toEqual({ concurrency: 2, keepAwake: true });
		expect(d.applied).toEqual([2]);
	});
	it("adds and removes ACP agents for admins", async () => {
		const d = deps();
		expect(
			(await call("POST", "/agents/acp", member, d, { name: "Gemini", command: "gemini --acp" }))
				?.status,
		).toBe(403);
		expect(
			(await call("POST", "/agents/acp", admin, d, { name: "Claude", command: "claude" }))?.status,
		).toBe(409);
		expect(
			(await call("POST", "/agents/acp", admin, d, { name: "Gemini", command: "" }))?.status,
		).toBe(400);
		expect(
			(await call("POST", "/agents/acp", admin, d, { name: "Gemini", command: "gemini --acp" }))
				?.status,
		).toBe(201);
		expect(d.added).toEqual(["gemini"]);
		expect((await call("DELETE", "/agents/acp/gemini", admin, d))?.status).toBe(204);
		expect((await call("DELETE", "/agents/acp/gemini", admin, d))?.status).toBe(404);
	});
});
