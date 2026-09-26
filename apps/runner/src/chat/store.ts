import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ChatEvent, Choice } from "../agents/events";

/** A conversation with an agent, as the console lists it. */
export type ChatSessionRow = {
	id: string;
	/** Who started it: told when it needs attention. */
	ownerId: string;
	/** The workspace it belongs to: everyone in it shares the project's chats. */
	workspaceId: string;
	project: string;
	provider: string;
	title: string;
	cwd: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	/** The provider's own session id, to resume the conversation in a fresh process. */
	resumeToken: string | null;
	createdAt: string;
	updatedAt: string;
};

type Row = {
	id: string;
	owner_id: string;
	workspace_id: string;
	project: string;
	provider: string;
	title: string;
	cwd: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	resume_token: string | null;
	created_at: string;
	updated_at: string;
};

function toSession(row: Row): ChatSessionRow {
	return {
		id: row.id,
		ownerId: row.owner_id,
		workspaceId: row.workspace_id,
		project: row.project,
		provider: row.provider,
		title: row.title,
		cwd: row.cwd,
		model: row.model,
		mode: row.mode,
		effort: row.effort,
		resumeToken: row.resume_token,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Sessions and their event logs, in SQLite (built into Bun). The log is the source of truth for
 * a transcript: every reconnect, second device and runner restart replays it.
 */
export class ChatStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				project TEXT NOT NULL,
				provider TEXT NOT NULL,
				title TEXT NOT NULL,
				cwd TEXT NOT NULL,
				model TEXT,
				mode TEXT,
				resume_token TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS sessions_by_owner_project ON sessions (owner_id, project, updated_at);
			CREATE TABLE IF NOT EXISTS events (
				session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
				seq INTEGER NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (session_id, seq)
			);
		`);
		this.db.exec("PRAGMA foreign_keys = ON");
		// Which folder on this machine holds each project's code, per workspace. Per machine by
		// design: another machine running Grid links its own checkout of the same project.
		if (!hasColumn(this.db, "project_folders", "owner_id")) {
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS project_folders (
					workspace_id TEXT NOT NULL,
					project TEXT NOT NULL,
					path TEXT NOT NULL,
					PRIMARY KEY (workspace_id, project)
				);
			`);
		}
		// Each agent's model list, asked of the agent once and kept until someone refreshes it; and
		// each person's settings per agent (defaults, whether it is offered at all).
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS provider_catalogs (
				provider TEXT PRIMARY KEY,
				data TEXT NOT NULL,
				refreshed_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS provider_settings (
				owner_id TEXT NOT NULL,
				provider TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (owner_id, provider)
			);
		`);
		// Added after the first release: older databases gain the column in place.
		if (!hasColumn(this.db, "sessions", "effort")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN effort TEXT");
		}
		// Chats and folders were each person's before workspaces. Their rows keep the person's id
		// as the workspace until `adopt` moves them into that person's default workspace.
		if (!hasColumn(this.db, "sessions", "workspace_id")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN workspace_id TEXT");
			this.db.exec("UPDATE sessions SET workspace_id = owner_id");
		}
		this.db.exec(
			"CREATE INDEX IF NOT EXISTS sessions_by_workspace_project ON sessions (workspace_id, project, updated_at)",
		);
		if (hasColumn(this.db, "project_folders", "owner_id")) {
			this.db.exec("ALTER TABLE project_folders RENAME COLUMN owner_id TO workspace_id");
		}
	}

	/**
	 * Moves what a person kept before workspaces (keyed by their own id) into their default
	 * workspace. Runs whenever they act there; after the first time it finds nothing.
	 */
	adopt(userId: string, workspace: string): void {
		if (userId === workspace) return;
		this.db.transaction(() => {
			this.db
				.query("UPDATE sessions SET workspace_id = ? WHERE workspace_id = ?")
				.run(workspace, userId);
			// A folder the workspace already has for that project wins over the old one.
			this.db
				.query("UPDATE OR IGNORE project_folders SET workspace_id = ? WHERE workspace_id = ?")
				.run(workspace, userId);
			this.db.query("DELETE FROM project_folders WHERE workspace_id = ?").run(userId);
		})();
	}

	create(session: Omit<ChatSessionRow, "createdAt" | "updatedAt" | "resumeToken">): ChatSessionRow {
		const now = new Date().toISOString();
		this.db
			.query(
				`INSERT INTO sessions (id, owner_id, workspace_id, project, provider, title, cwd, model, mode, effort, resume_token, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
			)
			.run(
				session.id,
				session.ownerId,
				session.workspaceId,
				session.project,
				session.provider,
				session.title,
				session.cwd,
				session.model,
				session.mode,
				session.effort,
				now,
				now,
			);
		return { ...session, resumeToken: null, createdAt: now, updatedAt: now };
	}

	get(id: string): ChatSessionRow | null {
		const row = this.db.query<Row, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);
		return row ? toSession(row) : null;
	}

	list(workspace: string, project: string): ChatSessionRow[] {
		return this.db
			.query<Row, [string, string]>(
				"SELECT * FROM sessions WHERE workspace_id = ? AND project = ? ORDER BY updated_at DESC",
			)
			.all(workspace, project)
			.map(toSession);
	}

	update(
		id: string,
		fields: Partial<Pick<ChatSessionRow, "title" | "model" | "mode" | "effort" | "resumeToken">>,
	): void {
		const columns: Record<string, string> = {
			title: "title",
			model: "model",
			mode: "mode",
			effort: "effort",
			resumeToken: "resume_token",
		};
		const entries = Object.entries(fields).filter(([key]) => key in columns);
		if (entries.length === 0) return;
		const sets = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
		this.db
			.query(`UPDATE sessions SET ${sets}, updated_at = ? WHERE id = ?`)
			.run(...entries.map(([, value]) => value as string | null), new Date().toISOString(), id);
	}

	touch(id: string): void {
		this.db
			.query("UPDATE sessions SET updated_at = ? WHERE id = ?")
			.run(new Date().toISOString(), id);
	}

	delete(id: string): void {
		this.db.query("DELETE FROM sessions WHERE id = ?").run(id);
	}

	append(sessionId: string, events: ChatEvent[]): void {
		if (events.length === 0) return;
		const next = this.db
			.query<{ seq: number | null }, [string]>(
				"SELECT MAX(seq) AS seq FROM events WHERE session_id = ?",
			)
			.get(sessionId);
		let seq = (next?.seq ?? 0) + 1;
		const insert = this.db.query("INSERT INTO events (session_id, seq, data) VALUES (?, ?, ?)");
		this.db.transaction(() => {
			for (const event of events) insert.run(sessionId, seq++, JSON.stringify(event));
		})();
	}

	events(sessionId: string): ChatEvent[] {
		return this.db
			.query<{ data: string }, [string]>(
				"SELECT data FROM events WHERE session_id = ? ORDER BY seq",
			)
			.all(sessionId)
			.map((row) => JSON.parse(row.data) as ChatEvent);
	}

	/** Every project folder the workspace has linked on this machine, by project slug. */
	projectFolders(workspace: string): Record<string, string> {
		const rows = this.db
			.query<{ project: string; path: string }, [string]>(
				"SELECT project, path FROM project_folders WHERE workspace_id = ?",
			)
			.all(workspace);
		return Object.fromEntries(rows.map((row) => [row.project, row.path]));
	}

	setProjectFolder(workspace: string, project: string, path: string): void {
		this.db
			.query(
				`INSERT INTO project_folders (workspace_id, project, path) VALUES (?, ?, ?)
				 ON CONFLICT (workspace_id, project) DO UPDATE SET path = excluded.path`,
			)
			.run(workspace, project, path);
	}

	/** A kept model list, or null when the agent has not been asked yet. */
	catalog(provider: string): { data: ProviderCatalog; refreshedAt: string } | null {
		const row = this.db
			.query<{ data: string; refreshed_at: string }, [string]>(
				"SELECT data, refreshed_at FROM provider_catalogs WHERE provider = ?",
			)
			.get(provider);
		return row
			? { data: JSON.parse(row.data) as ProviderCatalog, refreshedAt: row.refreshed_at }
			: null;
	}

	setCatalog(provider: string, data: ProviderCatalog): string {
		const refreshedAt = new Date().toISOString();
		this.db
			.query(
				`INSERT INTO provider_catalogs (provider, data, refreshed_at) VALUES (?, ?, ?)
				 ON CONFLICT (provider) DO UPDATE SET data = excluded.data, refreshed_at = excluded.refreshed_at`,
			)
			.run(provider, JSON.stringify(data), refreshedAt);
		return refreshedAt;
	}

	providerSettings(ownerId: string): Record<string, ProviderSettings> {
		const rows = this.db
			.query<{ provider: string; data: string }, [string]>(
				"SELECT provider, data FROM provider_settings WHERE owner_id = ?",
			)
			.all(ownerId);
		return Object.fromEntries(
			rows.map((row) => [row.provider, JSON.parse(row.data) as ProviderSettings]),
		);
	}

	setProviderSettings(ownerId: string, provider: string, settings: ProviderSettings): void {
		this.db
			.query(
				`INSERT INTO provider_settings (owner_id, provider, data) VALUES (?, ?, ?)
				 ON CONFLICT (owner_id, provider) DO UPDATE SET data = excluded.data`,
			)
			.run(ownerId, provider, JSON.stringify(settings));
	}

	close(): void {
		this.db.close();
	}
}

function hasColumn(db: Database, table: string, column: string): boolean {
	return db
		.query<{ name: string }, []>(`PRAGMA table_info(${table})`)
		.all()
		.some((row) => row.name === column);
}

/** What an agent said it offers: its models (with effort levels) and modes. */
export type ProviderCatalog = { models: Choice[]; modes?: Choice[] };

/** One person's choices for one agent. Everything is optional: unset means the agent's default. */
export type ProviderSettings = {
	/** False hides the agent from new chats. */
	enabled?: boolean;
	model?: string;
	effort?: string;
	mode?: string;
};
