import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import { AutomationStore } from "../automations/store";
import { WebhookSecrets } from "../automations/webhooks";
import { AgentKeyStore } from "../chat/outside-agents";
import { ChatStore } from "../chat/store";

const RUNNER_DIR = join(import.meta.dir, "..", "..");
const WORKSPACE = { userId: "chaos-owner", workspace: "chaos" };

/**
 * The real runner (`src/main.ts`) as a child process, for chaos tests: its own database, a project
 * folder, an agent key to drive it over MCP with, and the stand-in Claude Code (`fake-claude.ts`)
 * first on its PATH. It can be killed outright (`kill -9`, as a crash or a power cut would) and
 * started again on the same database.
 */
export class RunnerProcess {
	readonly dir = mkdtempSync(join(tmpdir(), "grid-chaos-"));
	readonly db = join(this.dir, "chat.db");
	readonly port = 20_000 + Math.floor(Math.random() * 20_000);
	readonly url = `http://127.0.0.1:${this.port}`;
	token = "";
	private child: ReturnType<typeof Bun.spawn> | null = null;
	private readonly bin = join(this.dir, "bin");

	constructor(private readonly env: Record<string, string> = {}) {
		mkdirSync(this.bin);
		const folder = join(this.dir, "demo");
		mkdirSync(folder);
		writeFileSync(
			join(this.bin, "claude"),
			`#!/bin/sh\nexec ${process.execPath} ${join(import.meta.dir, "fake-claude.ts")} "$@"\n`,
		);
		chmodSync(join(this.bin, "claude"), 0o755);
		const store = new ChatStore(this.db);
		store.setProjectFolder(WORKSPACE.workspace, "demo", folder);
		store.close();
		const keys = new AgentKeyStore(this.db);
		this.token = keys.create(WORKSPACE, {
			name: "Chaos",
			write: true,
			mode: "default",
			project: "demo",
			provider: "claude",
			expiresAt: null,
			projects: [],
			budgetUsd: null,
			ownThreads: false,
		}).token;
		keys.close();
	}

	/**
	 * An automation run by a webhook (`filter` keeps deliveries whose `level` is `error`): its id
	 * and secret. Made while the runner is stopped.
	 */
	webhookAutomation(prompt: string): { id: string; secret: string } {
		const automations = new AutomationStore(this.db);
		const item = automations.create(WORKSPACE.workspace, WORKSPACE.userId, {
			name: "Chaos hook",
			prompt,
			provider: "claude",
			model: null,
			effort: null,
			mode: null,
			project: "demo",
			workspaceMode: "folder",
			enabled: true,
			triggers: [{ kind: "webhook", filter: { path: "level", equals: "error" } }],
		});
		automations.close();
		const hooks = new WebhookSecrets(this.db);
		const secret = hooks.secret(item.id);
		hooks.close();
		return { id: item.id, secret };
	}

	/** A webhook delivery, signed with `secret`: its status and message. */
	async deliver(
		hook: { id: string; secret: string },
		body: unknown,
		id: string,
	): Promise<{ status: number; message: string }> {
		const raw = JSON.stringify(body);
		const signature = `sha256=${new Bun.CryptoHasher("sha256", hook.secret).update(raw).digest("hex")}`;
		const response = await fetch(`${this.url}/hooks/automations/${hook.id}`, {
			method: "POST",
			headers: { "x-grid-signature": signature, "x-request-id": id },
			body: raw,
		});
		return {
			status: response.status,
			message: ((await response.json()) as { message: string }).message,
		};
	}

	/** An automation's runs as the database holds them, newest first. */
	runs(automation: string): { status: string; trigger: string; session_id: string | null }[] {
		const db = new Database(this.db);
		try {
			return db
				.query<{ status: string; trigger: string; session_id: string | null }, [string]>(
					"SELECT status, trigger, session_id FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC",
				)
				.all(automation);
		} finally {
			db.close();
		}
	}

	/** SQLite's own check of the database file. */
	integrity(): string {
		const db = new Database(this.db);
		try {
			return (
				db.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get()
					?.integrity_check ?? ""
			);
		} finally {
			db.close();
		}
	}

	async start(env: Record<string, string> = {}): Promise<void> {
		this.child = Bun.spawn([process.execPath, "src/main.ts"], {
			cwd: RUNNER_DIR,
			env: {
				...process.env,
				...this.env,
				...env,
				PATH: `${this.bin}:${process.env.PATH ?? ""}`,
				RUNNER_PORT: String(this.port),
				RUNNER_CHAT_DB: this.db,
				RUNNER_PROJECTS_DIR: this.dir,
				GRID_API_URL: "http://127.0.0.1:9",
				GRID_RUNNER_KEY: "chaos-runner-key-0123456789abcdef",
				XDG_DATA_HOME: join(this.dir, "data"),
			},
			stdout: "ignore",
			stderr: "ignore",
		});
		const end = Date.now() + 20_000;
		while (Date.now() < end) {
			const up = await fetch(`${this.url}/mcp`, { method: "POST" }).then(
				(response) => response.status === 401,
				() => false,
			);
			if (up) return;
			await Bun.sleep(100);
		}
		throw new Error("the runner did not start");
	}

	/** Gone at once, as in a crash: nothing is closed or saved on the way out. */
	async crash(): Promise<void> {
		this.child?.kill("SIGKILL");
		await this.child?.exited;
		this.child = null;
	}

	async stop(): Promise<void> {
		await this.crash();
		rmSync(this.dir, { recursive: true, force: true });
	}

	/** One of Grid's tools over MCP, as an outside agent: its text, or the error it gave. */
	async tool(name: string, args: Record<string, unknown> = {}): Promise<string> {
		const response = await fetch(`${this.url}/mcp`, {
			method: "POST",
			headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name, arguments: args },
			}),
		});
		const body = (await response.json()) as { result?: { content?: { text: string }[] } };
		return body.result?.content?.[0]?.text ?? JSON.stringify(body);
	}

	/** A thread's events as the database holds them, read beside the running runner. */
	events(thread: string): ChatEvent[] {
		const db = new Database(this.db);
		try {
			return db
				.query<{ data: string }, [string]>(
					"SELECT data FROM events WHERE session_id = ? ORDER BY seq",
				)
				.all(thread)
				.map((row) => JSON.parse(row.data) as ChatEvent);
		} finally {
			db.close();
		}
	}

	/** Wait until `check` holds, or fail after `ms`. */
	async until(check: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
		const end = Date.now() + ms;
		while (!(await check())) {
			if (Date.now() > end) throw new Error("timed out waiting");
			await Bun.sleep(100);
		}
	}
}

/** The thread id in a thread tool's answer (`[Title](grid-thread://<id>)`). */
export function threadIn(answer: string): string {
	const id = /grid-thread:\/\/([\w-]+)/.exec(answer)?.[1];
	if (!id) throw new Error(`no thread in: ${answer}`);
	return id;
}
