import type { Database } from "bun:sqlite";

import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import { openPrivateDatabase } from "../private-database";
import type { AuditLog } from "../audit/audit-log";
import type { SpendLedger } from "../spend/ledger";
import { ChatError, type ChatHub } from "./hub";
import type { ChatSessionRow } from "./store";
import { type Caller, rankOf, type ThreadOperation, type ThreadTools } from "./thread-tools";

/**
 * Agents outside Grid: Claude Code in someone's own terminal, ChatGPT, a bot. A person makes a
 * key in Settings (shown once), gives it to the agent with Grid's MCP URL (`<console>/runner/mcp`),
 * and the agent can then list projects and use Grid's thread tools as that person: read threads,
 * and with a key that may write, start threads, send them messages, wait on them, stop them and
 * answer their questions. A key carries a permission ceiling (no thread it starts or directs runs
 * in a broader mode) and optionally a project; it is stored only as a hash and can be revoked.
 */

export type AgentKey = {
	id: string;
	workspaceId: string;
	ownerId: string;
	name: string;
	/** The token's first characters, to tell keys apart in a list. */
	prefix: string;
	/** May change threads (start, send, stop, answer), not only read them. */
	write: boolean;
	/** The broadest permission mode a thread it starts or directs may run in. */
	mode: string;
	/** The project its calls work in when they name none; null for any. */
	project: string | null;
	/** The agent threads it starts use by default. */
	provider: string | null;
	createdAt: string;
	lastUsedAt: string | null;
	/** When it stops working (ISO); null for never. */
	expiresAt: string | null;
	/** The only projects it may work in; empty for any of its person's. */
	projects: string[];
	/** Most its threads may cost in 30 days (USD); null for no cap of its own. */
	budgetUsd: number | null;
	/** Sees and acts on only the threads it started, not all of its person's. */
	ownThreads: boolean;
};

/** What a key may be made with beyond its name (see `AgentKeyStore.create`). */
export type KeyLimits = Pick<
	AgentKey,
	"write" | "mode" | "project" | "provider" | "expiresAt" | "projects" | "budgetUsd" | "ownThreads"
>;

type KeyRow = {
	id: string;
	workspace_id: string;
	owner_id: string;
	name: string;
	prefix: string;
	hash: string;
	write: number;
	mode: string;
	project: string | null;
	provider: string | null;
	created_at: string;
	last_used_at: string | null;
	expires_at: string | null;
	projects: string | null;
	budget_usd: number | null;
	own_threads: number | null;
};

function projectsOf(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch (cause) {
		console.warn("[keys] a key's projects could not be read:", cause);
		return [];
	}
}

const keyOf = (row: KeyRow): AgentKey => ({
	id: row.id,
	workspaceId: row.workspace_id,
	ownerId: row.owner_id,
	name: row.name,
	prefix: row.prefix,
	write: row.write === 1,
	mode: row.mode,
	project: row.project,
	provider: row.provider,
	createdAt: row.created_at,
	lastUsedAt: row.last_used_at,
	expiresAt: row.expires_at,
	projects: projectsOf(row.projects),
	budgetUsd: row.budget_usd,
	ownThreads: row.own_threads === 1,
});

/** Days a key may be made to last, at most. */
export const KEY_MAX_DAYS = 365;

const TOKEN_PREFIX = "grid_ak_";
const KEYS_PER_PERSON = 20;
/** Modes a key may allow, narrowest first. */
export const KEY_MODES = ["plan", "default", "acceptEdits", "bypassPermissions"] as const;

function hashOf(token: string): string {
	return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `${TOKEN_PREFIX}${Buffer.from(bytes).toString("base64url")}`;
}

/** Keys and what each key's calls with a request id did, in SQLite beside the chats. */
export class AgentKeyStore {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS agent_keys (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				name TEXT NOT NULL,
				prefix TEXT NOT NULL,
				hash TEXT NOT NULL UNIQUE,
				write INTEGER NOT NULL,
				mode TEXT NOT NULL,
				project TEXT,
				provider TEXT,
				created_at TEXT NOT NULL,
				last_used_at TEXT
			);
			CREATE TABLE IF NOT EXISTS agent_key_receipts (
				key_id TEXT NOT NULL REFERENCES agent_keys (id) ON DELETE CASCADE,
				request TEXT NOT NULL,
				result TEXT NOT NULL,
				created_at TEXT NOT NULL,
				PRIMARY KEY (key_id, request)
			);
		`);
		// What keys may be limited to came after the first keys: older databases gain the columns.
		const columns = new Set(
			this.db
				.query<{ name: string }, []>("PRAGMA table_info(agent_keys)")
				.all()
				.map((column) => column.name),
		);
		for (const [name, type] of [
			["expires_at", "TEXT"],
			["projects", "TEXT"],
			["budget_usd", "REAL"],
			["own_threads", "INTEGER"],
		] as const)
			if (!columns.has(name)) this.db.exec(`ALTER TABLE agent_keys ADD COLUMN ${name} ${type}`);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS agent_key_threads (
				key_id TEXT NOT NULL REFERENCES agent_keys (id) ON DELETE CASCADE,
				session_id TEXT NOT NULL,
				PRIMARY KEY (key_id, session_id)
			);
			CREATE INDEX IF NOT EXISTS agent_key_threads_by_session ON agent_key_threads (session_id);
		`);
		this.db.exec("PRAGMA foreign_keys = ON");
	}

	/** A thread a key started: its own, for a key limited to those, and for what it spends. */
	noteThread(keyId: string, sessionId: string): void {
		this.db
			.query("INSERT OR IGNORE INTO agent_key_threads (key_id, session_id) VALUES (?, ?)")
			.run(keyId, sessionId);
	}

	/** Whether a key started a thread. */
	started(keyId: string, sessionId: string): boolean {
		return (
			this.db
				.query("SELECT 1 FROM agent_key_threads WHERE key_id = ? AND session_id = ?")
				.get(keyId, sessionId) !== null
		);
	}

	/** The key that started a thread, if one did. */
	keyOfThread(sessionId: string): string | null {
		return (
			this.db
				.query<{ key_id: string }, [string]>(
					"SELECT key_id FROM agent_key_threads WHERE session_id = ? LIMIT 1",
				)
				.get(sessionId)?.key_id ?? null
		);
	}

	close(): void {
		this.db.close();
	}

	/** Make a key; the token is returned here and never again. */
	create(who: Who, input: { name: string } & KeyLimits): { key: AgentKey; token: string } {
		const count = this.db
			.query<{ n: number }, [string, string]>(
				"SELECT COUNT(*) AS n FROM agent_keys WHERE owner_id = ? AND workspace_id = ?",
			)
			.get(who.userId, who.workspace)?.n;
		if ((count ?? 0) >= KEYS_PER_PERSON)
			throw new ChatError(`You have ${KEYS_PER_PERSON} keys already; revoke one first`, 409);
		const token = newToken();
		const key: AgentKey = {
			id: crypto.randomUUID(),
			workspaceId: who.workspace,
			ownerId: who.userId,
			name: input.name,
			prefix: token.slice(0, TOKEN_PREFIX.length + 6),
			write: input.write,
			mode: input.mode,
			project: input.project,
			provider: input.provider,
			createdAt: new Date().toISOString(),
			lastUsedAt: null,
			expiresAt: input.expiresAt,
			projects: input.projects,
			budgetUsd: input.budgetUsd,
			ownThreads: input.ownThreads,
		};
		this.db
			.query(
				`INSERT INTO agent_keys (id, workspace_id, owner_id, name, prefix, hash, write, mode, project, provider, created_at, expires_at, projects, budget_usd, own_threads)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				key.id,
				key.workspaceId,
				key.ownerId,
				key.name,
				key.prefix,
				hashOf(token),
				key.write ? 1 : 0,
				key.mode,
				key.project,
				key.provider,
				key.createdAt,
				key.expiresAt,
				key.projects.length ? JSON.stringify(key.projects) : null,
				key.budgetUsd,
				key.ownThreads ? 1 : 0,
			);
		return { key, token };
	}

	list(who: Who): AgentKey[] {
		return this.db
			.query<KeyRow, [string, string]>(
				"SELECT * FROM agent_keys WHERE owner_id = ? AND workspace_id = ? ORDER BY created_at DESC",
			)
			.all(who.userId, who.workspace)
			.map(keyOf);
	}

	revoke(who: Who, id: string): boolean {
		return (
			this.db
				.query("DELETE FROM agent_keys WHERE id = ? AND owner_id = ? AND workspace_id = ?")
				.run(id, who.userId, who.workspace).changes > 0
		);
	}

	/**
	 * The key a token is, noting that it was used; null for one that is not, was revoked, or has
	 * expired.
	 */
	byToken(token: string, now = new Date()): AgentKey | null {
		if (!token.startsWith(TOKEN_PREFIX)) return null;
		const row = this.db
			.query<KeyRow, [string]>("SELECT * FROM agent_keys WHERE hash = ?")
			.get(hashOf(token));
		if (!row) return null;
		if (row.expires_at && row.expires_at <= now.toISOString()) return null;
		this.db
			.query("UPDATE agent_keys SET last_used_at = ? WHERE id = ?")
			.run(now.toISOString(), row.id);
		return keyOf(row);
	}

	receipt(keyId: string, request: string): string | null {
		return (
			this.db
				.query<{ result: string }, [string, string]>(
					"SELECT result FROM agent_key_receipts WHERE key_id = ? AND request = ?",
				)
				.get(keyId, request)?.result ?? null
		);
	}

	keepReceipt(keyId: string, request: string, result: string, now = new Date()): void {
		const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
		this.db.query("DELETE FROM agent_key_receipts WHERE created_at < ?").run(weekAgo);
		this.db
			.query(
				"INSERT OR IGNORE INTO agent_key_receipts (key_id, request, result, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(keyId, request, result, now.toISOString());
	}
}

type JsonRpc = {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
};

/** MCP protocol versions this endpoint speaks, newest first. */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
	"Grid runs coding agents in threads on the person's machines. Use list_projects to see where work happens, thread_list and thread_read to see what agents are doing, and (when this key may write) thread_start, thread_send, thread_wait, thread_stop and thread_answer to direct them. You act as the person who made this key.";

/** Agents outside Grid, over MCP: keys, and what a key's calls may do. */
export class OutsideAgents {
	private readonly operations: ThreadOperation[];

	constructor(
		private readonly hub: ChatHub,
		private readonly keys: AgentKeyStore,
		threads: ThreadTools,
		private readonly whoFor: (key: AgentKey) => Who = (key) => ({
			userId: key.ownerId,
			workspace: key.workspaceId,
		}),
		/** What keys' threads cost (their caps) and where what they do is noted. */
		private readonly records: { ledger?: SpendLedger; audit?: AuditLog } = {},
	) {
		this.operations = [
			{
				name: "list_projects",
				description:
					"The projects this machine works on, by name (pass one as project to the thread tools).",
				inputSchema: { type: "object", properties: {} },
				run: (caller) => {
					const projects = Object.keys(this.hub.projectFolders(caller.who.workspace)).sort();
					return projects.length
						? projects
								.map(
									(project) => `- ${project}${project === caller.project ? " (this key's)" : ""}`,
								)
								.join("\n")
						: "No projects have a folder on this machine yet.";
				},
			},
			...threads.operations(),
		];
	}

	/** The caller a key is. */
	private callerOf(key: AgentKey): Caller {
		return {
			thread: null,
			who: this.whoFor(key),
			project: key.project,
			rank: rankOf(key.mode),
			write: key.write,
			origin: { kind: "outside", agent: key.name },
			receipts: {
				get: (request) => this.keys.receipt(key.id, request),
				keep: (request, result) => this.keys.keepReceipt(key.id, request, result),
			},
			provider: key.provider,
			projects: key.projects,
			...(key.ownThreads
				? { sees: (session: ChatSessionRow) => this.keys.started(key.id, session.id) }
				: {}),
			mayWork: () => {
				const spent = this.spent(key);
				if (key.budgetUsd !== null && spent >= key.budgetUsd)
					throw new ChatError(
						`This key's budget of $${key.budgetUsd.toFixed(2)} for 30 days is used up ($${spent.toFixed(2)}); its person can raise it with a new key.`,
						402,
					);
			},
			started: (session) => this.keys.noteThread(key.id, session.id),
			did: (action, session, detail) =>
				this.records.audit?.record({
					workspaceId: session.workspaceId,
					actor: { kind: "agent_key", id: key.id, name: key.name },
					action,
					project: session.project,
					sessionId: session.id,
					target: session.title,
					detail: detail ?? null,
				}),
		};
	}

	/** What the threads a key started cost in the last 30 days. */
	private spent(key: AgentKey, now = Date.now()): number {
		return (
			this.records.ledger?.total(key.workspaceId, { keyId: key.id }, now - 30 * 86_400_000) ?? 0
		);
	}

	/** Something a person did to their keys, for the audit log. */
	private noted(who: Who, action: string, key: AgentKey, detail: string | null = null): void {
		this.records.audit?.record({
			workspaceId: who.workspace,
			actor: { kind: "person", id: who.userId, name: who.userId },
			action,
			project: null,
			sessionId: null,
			target: key.name,
			detail,
		});
	}

	/** A person's keys over HTTP (`/chat/agent-keys`); null for paths it does not own. */
	async keysRequest(request: Request, url: URL, who: Who): Promise<Response | null> {
		if (url.pathname !== "/chat/agent-keys" && !url.pathname.startsWith("/chat/agent-keys/"))
			return null;
		const failure = (status: number, message: string) => Response.json({ message }, { status });
		if (url.pathname === "/chat/agent-keys" && request.method === "GET")
			return Response.json({
				data: this.keys.list(who).map((key) => ({ ...key, spentUsd: this.spent(key) })),
			});
		if (url.pathname === "/chat/agent-keys" && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
			if (!name) return failure(400, "Name the key after the agent that will use it");
			const mode = typeof body.mode === "string" ? body.mode : "default";
			if (!(KEY_MODES as readonly string[]).includes(mode))
				return failure(400, `mode is one of ${KEY_MODES.join(", ")}`);
			const project = typeof body.project === "string" && body.project ? body.project : null;
			if (project && !this.hub.projectFolders(who.workspace)[project])
				return failure(400, "That project has no folder on this machine");
			const provider = typeof body.provider === "string" && body.provider ? body.provider : null;
			if (provider && !this.hub.knowsProvider(provider))
				return failure(400, `No agent called ${provider}`);
			const limits = keyLimits(body, Object.keys(this.hub.projectFolders(who.workspace)));
			if (typeof limits === "string") return failure(400, limits);
			if (project && limits.projects.length && !limits.projects.includes(project))
				return failure(400, "Its project must be one of the projects it may work in");
			try {
				const made = this.keys.create(who, {
					name,
					write: body.write === true,
					mode,
					project,
					provider,
					...limits,
				});
				this.noted(who, "key.create", made.key, describeKey(made.key));
				return Response.json({ data: made }, { status: 201 });
			} catch (cause) {
				if (cause instanceof ChatError) return failure(cause.status, cause.message);
				throw cause;
			}
		}
		const one = url.pathname.match(/^\/chat\/agent-keys\/([\w-]+)$/);
		if (one && request.method === "DELETE") {
			const key = this.keys.list(who).find((item) => item.id === one[1]);
			if (!key || !this.keys.revoke(who, key.id)) return failure(404, "No such key");
			this.noted(who, "key.revoke", key);
			return new Response(null, { status: 204 });
		}
		return failure(405, "Method not allowed");
	}

	/**
	 * Grid's MCP endpoint (`POST /mcp`, Streamable HTTP with JSON answers): `initialize`,
	 * `tools/list`, `tools/call` and `ping`, for a bearer key. Null for other paths.
	 */
	async mcpRequest(request: Request, url: URL): Promise<Response | null> {
		if (url.pathname !== "/mcp") return null;
		if (request.method !== "POST")
			return new Response("Grid's MCP endpoint takes POST", {
				status: 405,
				headers: { Allow: "POST" },
			});
		const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
		const key = token ? this.keys.byToken(token) : null;
		if (!key)
			return Response.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32001, message: "Sign in with a Grid agent key (Settings → Agent keys)" },
				},
				{ status: 401, headers: { "WWW-Authenticate": 'Bearer realm="grid"' } },
			);
		let message: JsonRpc;
		try {
			message = (await request.json()) as JsonRpc;
		} catch {
			return Response.json(
				{ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Not JSON" } },
				{ status: 400 },
			);
		}
		if (Array.isArray(message))
			return Response.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32600, message: "Send one message at a time" },
				},
				{ status: 400 },
			);
		// A notification (no id) needs no answer.
		if (message.id === undefined || message.id === null) return new Response(null, { status: 202 });
		const answer = (result: unknown) => Response.json({ jsonrpc: "2.0", id: message.id, result });
		const error = (code: number, text: string) =>
			Response.json({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });
		switch (message.method) {
			case "initialize": {
				const asked =
					typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
				return answer({
					protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
					capabilities: { tools: { listChanged: false } },
					serverInfo: { name: "grid", version: "0.1.0" },
					instructions: INSTRUCTIONS,
				});
			}
			case "ping":
				return answer({});
			case "tools/list":
				return answer({
					tools: this.operations
						.filter((operation) => key.write || !WRITES.has(operation.name))
						.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
				});
			case "tools/call": {
				const name = typeof message.params?.name === "string" ? message.params.name : "";
				const operation = this.operations.find((item) => item.name === name);
				if (!operation) return error(-32602, `Grid has no tool called ${name}`);
				const args =
					message.params?.arguments && typeof message.params.arguments === "object"
						? (message.params.arguments as Record<string, unknown>)
						: {};
				try {
					const result = await operation.run(this.callerOf(key), args);
					const text = typeof result === "string" ? result : result.text;
					return answer({ content: [{ type: "text", text }], isError: false });
				} catch (cause) {
					const text = cause instanceof Error ? cause.message : String(cause);
					return answer({ content: [{ type: "text", text }], isError: true });
				}
			}
			default:
				return error(-32601, `Grid's MCP endpoint does not do ${message.method ?? "that"}`);
		}
	}
}

/**
 * A new key's limits from what was asked: how long it lasts (`expiresInDays`), the projects it
 * may work in, a 30-day budget, and whether it sees only the threads it starts. A sentence for
 * what is wrong.
 */
export function keyLimits(
	body: Record<string, unknown>,
	known: readonly string[],
	now = Date.now(),
): Pick<KeyLimits, "expiresAt" | "projects" | "budgetUsd" | "ownThreads"> | string {
	let expiresAt: string | null = null;
	if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
		const days = Number(body.expiresInDays);
		if (!Number.isInteger(days) || days < 1 || days > KEY_MAX_DAYS)
			return `expiresInDays is a whole number from 1 to ${KEY_MAX_DAYS}`;
		expiresAt = new Date(now + days * 86_400_000).toISOString();
	}
	const projects = body.projects ?? [];
	if (!Array.isArray(projects) || projects.some((item) => typeof item !== "string"))
		return "projects is a list of project names";
	const unknown = (projects as string[]).find((item) => !known.includes(item));
	if (unknown) return `${unknown} has no folder on this machine`;
	let budgetUsd: number | null = null;
	if (body.budgetUsd !== undefined && body.budgetUsd !== null && body.budgetUsd !== "") {
		budgetUsd = Number(body.budgetUsd);
		if (!Number.isFinite(budgetUsd) || budgetUsd < 0.01 || budgetUsd > 100_000)
			return "budgetUsd is between 0.01 and 100,000";
		budgetUsd = Math.round(budgetUsd * 100) / 100;
	}
	return {
		expiresAt,
		projects: [...new Set(projects as string[])].slice(0, 50),
		budgetUsd,
		ownThreads: body.ownThreads === true,
	};
}

/** A key's limits in words, for the audit log. */
function describeKey(key: AgentKey): string {
	return [
		key.write ? "may change threads" : "read only",
		`mode ${key.mode}`,
		key.projects.length ? `projects ${key.projects.join(", ")}` : "any project",
		key.ownThreads ? "only its own threads" : null,
		key.budgetUsd !== null ? `$${key.budgetUsd.toFixed(2)} per 30 days` : null,
		key.expiresAt ? `expires ${key.expiresAt.slice(0, 10)}` : null,
	]
		.filter(Boolean)
		.join(" · ");
}

/** The tools that change threads: left out of the list for a key that may only read. */
const WRITES = new Set(["thread_start", "thread_send", "thread_stop", "thread_answer"]);
