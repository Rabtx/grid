import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { signedOut } from "../auth";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { readConfig } from "../config";
import { startServer } from "../server";
import { TerminalStore } from "../terminals";

import { DiagnosticJournal } from "./journal";

describe("runner diagnostics socket hooks", () => {
	it("records every refused chat, terminal and link socket close with its code and session", async () => {
		const projectsDir = mkdtempSync(join(tmpdir(), "grid-diagnostics-"));
		const config = { ...readConfig({ RUNNER_PROJECTS_DIR: projectsDir }), port: 0 };
		const store = new TerminalStore(config, () => ({ write() {}, resize() {}, kill() {} }));
		const chatStore = new ChatStore(":memory:");
		const chat = new ChatHub(chatStore, new Map(), projectsDir);
		const journal = new DiagnosticJournal(":memory:");
		const server = startServer(
			config,
			store,
			async (token) =>
				token === "good" ? { who: { userId: "user-1", workspace: "workspace-1" } } : signedOut,
			chat,
			{ diagnostics: journal },
		);

		try {
			const failedUpgrade = await fetch(`http://127.0.0.1:${server.port}/terminal`);
			expect(failedUpgrade.status).toBe(426);
			const closed: Promise<CloseEvent>[] = [];
			for (const kind of ["chat", "terminal", "link"] as const) {
				const socket = new WebSocket(`ws://127.0.0.1:${server.port}/${kind}`);
				const done = new Promise<CloseEvent>((resolve) =>
					socket.addEventListener("close", (event) => resolve(event)),
				);
				closed.push(done);
				await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
				socket.send(
					JSON.stringify({
						t: "hello",
						token: "invalid",
						...(kind === "link" ? {} : { id: `${kind}-session` }),
					}),
				);
			}

			const events = await Promise.all(closed);
			expect(events.map((event) => event.code)).toEqual([4401, 4401, 4401]);
			const closes = journal.list("workspace-1", { since: Date.now() - 5_000, kind: "connection" });
			expect(closes).toHaveLength(3);
			expect(closes.map((event) => event.details.socket).sort()).toEqual([
				"chat",
				"link",
				"terminal",
			]);
			// Never signed in: shown to every workspace, so nothing names the session.
			expect(closes.every((event) => event.workspace === null)).toBe(true);
			expect(closes.find((event) => event.details.socket === "chat")?.details).toEqual({
				socket: "chat",
				count: 1,
			});
			const errors = journal.list("workspace-1", { since: Date.now() - 5_000, kind: "error" });
			expect(errors.some((event) => event.source === "auth")).toBe(true);
			expect(errors.some((event) => event.source === "upgrade")).toBe(true);

			// A token-less request loop is counted in memory, not written per request.
			for (let index = 0; index < 50; index++) {
				const refused = await fetch(`http://127.0.0.1:${server.port}/chat/sessions/abc-123`);
				expect(refused.status).toBe(401);
			}
			const chatRefusals = journal
				.list("workspace-1", { since: Date.now() - 5_000, kind: "error" })
				.filter((event) => event.source === "auth" && event.details.route === "chat");
			expect(chatRefusals).toHaveLength(1);
			expect(JSON.stringify(chatRefusals)).not.toContain("abc-123");

			const terminalResponse = await fetch(`http://127.0.0.1:${server.port}/terminals`, {
				method: "POST",
				headers: { Authorization: "Bearer good", "Content-Type": "application/json" },
				body: JSON.stringify({ cols: 80, rows: 24 }),
			});
			const terminal = (await terminalResponse.json()) as { data: { id: string } };
			const link = new WebSocket(`ws://127.0.0.1:${server.port}/link`);
			const messages: Record<string, unknown>[] = [];
			link.addEventListener("message", (event) => {
				if (typeof event.data === "string")
					messages.push(JSON.parse(event.data) as Record<string, unknown>);
			});
			await new Promise<void>((resolve) => link.addEventListener("open", () => resolve()));
			link.send(JSON.stringify({ t: "hello", token: "good" }));
			await waitFor(() => messages.some((message) => message.t === "welcome"));
			link.send(JSON.stringify({ t: "open", ch: 1, kind: "terminal", id: terminal.data.id }));
			await waitFor(() => messages.some((message) => message.t === "ready"));
			link.send(JSON.stringify({ t: "close", ch: 1 }));
			await waitFor(() =>
				journal
					.list("workspace-1", { since: Date.now() - 5_000, kind: "connection" })
					.some((event) => event.details.transport === "link"),
			);
			const virtualClose = journal
				.list("workspace-1", { since: Date.now() - 5_000, kind: "connection" })
				.find((event) => event.details.transport === "link");
			expect(virtualClose?.details).toMatchObject({
				sessionId: terminal.data.id,
				code: 1000,
				reason: "Client detached",
			});
			link.close();
		} finally {
			store.closeAll();
			chatStore.close();
			await server.stop(true);
			journal.close();
			rmSync(projectsDir, { recursive: true, force: true });
		}
	});
});

function waitFor(check: () => boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const poll = () => {
			if (check()) resolve();
			else if (Date.now() - started > 3_000) reject(new Error("timed out waiting for link event"));
			else setTimeout(poll, 10);
		};
		poll();
	});
}
