import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ChatEvent, Choice } from "../agents/events";

/** A conversation with an agent, as the console lists it. */
export type ChatSessionRow = {
	id: string;
	ownerId: string;
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
		// Which folder on this machine holds each project's code. Per machine by design: another
		// machine running Grid links its own checkout of the same project.
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS project_folders (
				owner_id TEXT NOT NULL,
				project TEXT NOT NULL,
				path TEXT NOT NULL,
				PRIMARY KEY (owner_id, project)
			);
		`);
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
		const columns = this.db.query<{ name: string }, []>("PRAGMA table_info(sessions)").all();
		if (!columns.some((column) => column.name === "effort")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN effort TEXT");
		}
	}

	create(session: Omit<ChatSessionRow, "createdAt" | "updatedAt" | "resumeToken">): ChatSessionRow {
		const now = new Date().toISOString();
		this.db
			.query(
				`INSERT INTO sessions (id, owner_id, project, provider, title, cwd, model, mode, effort, resume_token, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
			)
			.run(
				session.id,
				session.ownerId,
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

	list(ownerId: string, project: string): ChatSessionRow[] {
		return this.db
			.query<Row, [string, string]>(
				"SELECT * FROM sessions WHERE owner_id = ? AND project = ? ORDER BY updated_at DESC",
			)
			.all(ownerId, project)
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

	/** Every project folder this person has linked on this machine, by project slug. */
	projectFolders(ownerId: string): Record<string, string> {
		const rows = this.db
			.query<{ project: string; path: string }, [string]>(
				"SELECT project, path FROM project_folders WHERE owner_id = ?",
			)
			.all(ownerId);
		return Object.fromEntries(rows.map((row) => [row.project, row.path]));
	}

	setProjectFolder(ownerId: string, project: string, path: string): void {
		this.db
			.query(
				`INSERT INTO project_folders (owner_id, project, path) VALUES (?, ?, ?)
				 ON CONFLICT (owner_id, project) DO UPDATE SET path = excluded.path`,
			)
			.run(ownerId, project, path);
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
