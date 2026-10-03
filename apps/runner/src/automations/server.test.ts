import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { signedOut } from "../auth";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { readConfig } from "../config";
import { InboxStore } from "../inbox/store";
import { spawnPty } from "../pty";
import { startServer } from "../server";
import { TerminalStore } from "../terminals";
import { Automations } from "./service";
import { AutomationStore } from "./store";

const projectsDir = mkdtempSync(join(tmpdir(), "grid-automations-server-"));
const config = {
	...readConfig({
		RUNNER_PROJECTS_DIR: projectsDir,
		RUNNER_CWD: projectsDir,
		GRID_API_URL: "http://127.0.0.1:4029",
	}),
	port: 0,
};
const terminals = new TerminalStore(config, spawnPty);
const chat = new ChatHub(new ChatStore(":memory:"), new Map(), projectsDir);
const automations = new Automations(
	new AutomationStore(":memory:"),
	chat,
	new InboxStore(":memory:"),
);
const server = startServer(
	config,
	terminals,
	async (token) =>
		token === "good" ? { who: { userId: "alice", workspace: "alpha" } } : signedOut,
	chat,
	{ automations },
);
const base = `http://127.0.0.1:${server.port}`;

afterAll(() => {
	automations.stop();
	terminals.closeAll();
	chat.closeAll();
	void server.stop(true);
	rmSync(projectsDir, { recursive: true, force: true });
});

test("the actual runner gates automation routes and serves templates", async () => {
	expect((await fetch(`${base}/automations`)).status).toBe(401);
	const headers = { Authorization: "Bearer good" };
	const templates = await fetch(`${base}/automations/templates`, { headers });
	expect(templates.status).toBe(200);
	expect(((await templates.json()) as { data: unknown[] }).data).toHaveLength(9);
	expect((await fetch(`${base}/automations`, { headers })).status).toBe(200);
	expect((await fetch(`${base}/automations`, { method: "DELETE", headers })).status).toBe(405);
});
