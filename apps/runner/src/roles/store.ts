import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

/** The glyphs a role can wear; the console draws each one in its own tint. */
export const ROLE_ICONS = [
	"code",
	"review",
	"design",
	"docs",
	"test",
	"ship",
	"research",
	"bug",
] as const;

export type RoleIcon = (typeof ROLE_ICONS)[number];

/**
 * A role on a workspace's team: a name people pick in the composer ("Engineer", "Code reviewer"),
 * the agent, model, effort and mode it runs with, and a brief the agent is given at the start of
 * each thread it takes.
 */
export type Role = {
	id: string;
	workspaceId: string;
	name: string;
	icon: RoleIcon;
	/** What this role does, in the workspace's words; sent to the agent with a thread's first message. */
	brief: string;
	provider: string;
	/** Unset means the agent's own default. */
	model: string | null;
	effort: string | null;
	mode: string | null;
	createdAt: string;
	updatedAt: string;
};

export type RoleDraft = Pick<
	Role,
	"name" | "icon" | "brief" | "provider" | "model" | "effort" | "mode"
>;

type Row = {
	id: string;
	workspace_id: string;
	name: string;
	icon: string;
	brief: string;
	provider: string;
	model: string | null;
	effort: string | null;
	mode: string | null;
	created_at: string;
	updated_at: string;
};

function toRole(row: Row): Role {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		name: row.name,
		icon: (ROLE_ICONS as readonly string[]).includes(row.icon) ? (row.icon as RoleIcon) : "code",
		brief: row.brief,
		provider: row.provider,
		model: row.model,
		effort: row.effort,
		mode: row.mode,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/** The most roles one workspace keeps: a team, not a catalogue. */
export const MAX_ROLES = 50;

/**
 * Each workspace's roles, in the runner's chat database beside the threads they start. Everyone
 * in the workspace shares them, as they share its projects' threads.
 */
export class RoleStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS roles (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				name TEXT NOT NULL,
				icon TEXT NOT NULL,
				brief TEXT NOT NULL,
				provider TEXT NOT NULL,
				model TEXT,
				effort TEXT,
				mode TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS roles_by_workspace ON roles (workspace_id, created_at);
		`);
	}

	/** A workspace's roles in the order they were made, so the list does not reshuffle. */
	list(workspaceId: string): Role[] {
		return this.db
			.query<Row, [string]>("SELECT * FROM roles WHERE workspace_id = ? ORDER BY created_at, id")
			.all(workspaceId)
			.map(toRole);
	}

	get(workspaceId: string, id: string): Role | null {
		const row = this.db
			.query<Row, [string, string]>("SELECT * FROM roles WHERE workspace_id = ? AND id = ?")
			.get(workspaceId, id);
		return row ? toRole(row) : null;
	}

	count(workspaceId: string): number {
		return (
			this.db
				.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM roles WHERE workspace_id = ?")
				.get(workspaceId)?.n ?? 0
		);
	}

	/** Makes a role, unless the workspace already has `limit`; null then. One transaction, so two
	 * at once cannot both slip under it. */
	create(workspaceId: string, draft: RoleDraft, limit = MAX_ROLES): Role | null {
		return this.db.transaction(() => {
			if (this.count(workspaceId) >= limit) return null;
			return this.insert(workspaceId, draft);
		})();
	}

	private insert(workspaceId: string, draft: RoleDraft): Role {
		const now = new Date().toISOString();
		const id = crypto.randomUUID();
		this.db
			.query(
				`INSERT INTO roles (id, workspace_id, name, icon, brief, provider, model, effort, mode, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				workspaceId,
				draft.name,
				draft.icon,
				draft.brief,
				draft.provider,
				draft.model,
				draft.effort,
				draft.mode,
				now,
				now,
			);
		return { id, workspaceId, ...draft, createdAt: now, updatedAt: now };
	}

	/** Changes what is given; returns the role as it now is, or null when it is not there. */
	update(workspaceId: string, id: string, patch: Partial<RoleDraft>): Role | null {
		const current = this.get(workspaceId, id);
		if (!current) return null;
		const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
		this.db
			.query(
				`UPDATE roles SET name = ?, icon = ?, brief = ?, provider = ?, model = ?, effort = ?, mode = ?, updated_at = ?
				 WHERE workspace_id = ? AND id = ?`,
			)
			.run(
				next.name,
				next.icon,
				next.brief,
				next.provider,
				next.model,
				next.effort,
				next.mode,
				next.updatedAt,
				workspaceId,
				id,
			);
		return next;
	}

	remove(workspaceId: string, id: string): boolean {
		return (
			this.db.query("DELETE FROM roles WHERE workspace_id = ? AND id = ?").run(workspaceId, id)
				.changes > 0
		);
	}

	close(): void {
		this.db.close();
	}
}
