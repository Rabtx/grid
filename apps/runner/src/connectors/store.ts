import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Rule } from "./catalog";
import type { AgentAccess } from "./rules";
import { openPrivateDatabase } from "../private-database";

/**
 * A service or MCP server connected to a workspace: from the catalog (signed in with OAuth, an
 * API key, or the GitHub CLI) or the workspace's own (a command on this machine, or a URL).
 */
export type Connection = {
	id: string;
	workspace: string;
	/** A catalog id, or "custom". */
	kind: string;
	name: string;
	transport: "http" | "stdio";
	url: string | null;
	command: string | null;
	args: string[];
	/** Environment for a command: each a literal value, or a secret in the vault by name. */
	env: Record<string, { secret: string } | { value: string }>;
	/** How it signs in: OAuth tokens in the vault, an API key there, the GitHub CLI, or nothing. */
	auth: "oauth" | "key" | "gh" | "none";
	enabled: boolean;
	rules: Record<string, Rule>;
	/** Per agent id, when not following the rules. */
	agents: Record<string, AgentAccess>;
	/** GitHub: repositories not shared with agents (`owner/name`). */
	hiddenRepositories: string[];
	/** What it offered when last checked. */
	tools: string[];
	status: "healthy" | "error" | "signin";
	statusDetail: string | null;
	checkedAt: string | null;
	/** OAuth: when the token runs out without a refresh token to renew it. */
	expiresAt: string | null;
	createdBy: string;
	createdAt: string;
};

export type ActivityEntry = {
	connection: string;
	at: string;
	agent: string;
	thread: string | null;
	tool: string;
	outcome: "done" | "blocked" | "denied" | "failed";
};

type Row = {
	id: string;
	workspace: string;
	kind: string;
	name: string;
	data: string;
	created_by: string;
	created_at: string;
};

const ACTIVITY_KEPT = 200;

export class ConnectionStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS connectors (
			id TEXT PRIMARY KEY,
			workspace TEXT NOT NULL,
			kind TEXT NOT NULL,
			name TEXT NOT NULL,
			data TEXT NOT NULL,
			created_by TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS connector_activity (
			connection TEXT NOT NULL,
			at TEXT NOT NULL,
			agent TEXT NOT NULL,
			thread TEXT,
			tool TEXT NOT NULL,
			outcome TEXT NOT NULL
		)`);
		this.db.exec(
			"CREATE INDEX IF NOT EXISTS connector_activity_by_connection ON connector_activity (connection, at)",
		);
	}

	private read(row: Row): Connection {
		const data = JSON.parse(row.data) as Omit<
			Connection,
			"id" | "workspace" | "kind" | "name" | "createdBy" | "createdAt"
		>;
		return {
			...data,
			id: row.id,
			workspace: row.workspace,
			kind: row.kind,
			name: row.name,
			createdBy: row.created_by,
			createdAt: row.created_at,
		};
	}

	list(workspace: string): Connection[] {
		return this.db
			.query<Row, [string]>("SELECT * FROM connectors WHERE workspace = ? ORDER BY created_at")
			.all(workspace)
			.map((row) => this.read(row));
	}

	get(workspace: string, id: string): Connection | null {
		const row = this.db
			.query<Row, [string, string]>("SELECT * FROM connectors WHERE workspace = ? AND id = ?")
			.get(workspace, id);
		return row ? this.read(row) : null;
	}

	/** By id alone: the proxy an agent runs knows only its connection. */
	byId(id: string): Connection | null {
		const row = this.db.query<Row, [string]>("SELECT * FROM connectors WHERE id = ?").get(id);
		return row ? this.read(row) : null;
	}

	save(connection: Connection): Connection {
		const { id, workspace, kind, name, createdBy, createdAt, ...data } = connection;
		this.db
			.query(
				`INSERT INTO connectors (id, workspace, kind, name, data, created_by, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET name = excluded.name, data = excluded.data`,
			)
			.run(id, workspace, kind, name, JSON.stringify(data), createdBy, createdAt);
		return connection;
	}

	delete(workspace: string, id: string): void {
		this.db.query("DELETE FROM connectors WHERE workspace = ? AND id = ?").run(workspace, id);
		this.db.query("DELETE FROM connector_activity WHERE connection = ?").run(id);
	}

	record(entry: ActivityEntry): void {
		this.db
			.query(
				"INSERT INTO connector_activity (connection, at, agent, thread, tool, outcome) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(entry.connection, entry.at, entry.agent, entry.thread, entry.tool, entry.outcome);
		this.db
			.query(
				`DELETE FROM connector_activity WHERE connection = ? AND at < (
					SELECT at FROM connector_activity WHERE connection = ? ORDER BY at DESC LIMIT 1 OFFSET ?
				)`,
			)
			.run(entry.connection, entry.connection, ACTIVITY_KEPT - 1);
	}

	activity(connection: string, limit = 20): ActivityEntry[] {
		return this.db
			.query<ActivityEntry, [string, number]>(
				"SELECT * FROM connector_activity WHERE connection = ? ORDER BY at DESC LIMIT ?",
			)
			.all(connection, limit);
	}
}
