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
 * A teammate: a specialist on a workspace's team that any agent can be ("Riley", a frontend
 * engineer). It is who the work is for, not which model does it: its specialty and brief, the
 * skills and connectors its domain needs, and what it has learned (`TeammateLesson`) go with every
 * thread it takes, on whichever agent and model it runs. People pick it in the composer, assign it
 * cards on the board, and it can take those on by itself in a worktree of its own.
 *
 * (Called a role before teammates; the type, table and routes keep that name.)
 */
export type Role = {
	id: string;
	workspaceId: string;
	name: string;
	icon: RoleIcon;
	/** What it is, in a few words: "Frontend engineer", "Security reviewer". */
	specialty: string;
	/** How it works, in the workspace's words; sent to the agent with a thread's first message. */
	brief: string;
	provider: string;
	/** Unset means the agent's own default. */
	model: string | null;
	effort: string | null;
	mode: string | null;
	/** Ids of the workspace's skills it always reads first. */
	skills: string[];
	/** Ids of the connectors it may use; null is every connector its agent may use. */
	connectors: string[] | null;
	/** A card assigned to it starts by itself, rather than waiting for Start. */
	autoStart: boolean;
	/** On a card it writes a plan first and waits for a person to approve it. */
	planFirst: boolean;
	/** How many cards it works on at once; the rest wait their turn. */
	parallel: number;
	/** The teammate a finished card goes to next (a reviewer after a builder), or none. */
	handoffTo: string | null;
	createdAt: string;
	updatedAt: string;
};

export type RoleDraft = Pick<
	Role,
	| "name"
	| "icon"
	| "specialty"
	| "brief"
	| "provider"
	| "model"
	| "effort"
	| "mode"
	| "skills"
	| "connectors"
	| "autoStart"
	| "planFirst"
	| "parallel"
	| "handoffTo"
>;

/** What a draft leaves out takes these: a teammate that asks before acting and works one card at a time. */
export const TEAMMATE_DEFAULTS = {
	specialty: "",
	skills: [] as string[],
	connectors: null as string[] | null,
	autoStart: false,
	planFirst: true,
	parallel: 1,
	handoffTo: null as string | null,
};

type Row = {
	id: string;
	workspace_id: string;
	name: string;
	icon: string;
	specialty: string | null;
	brief: string;
	provider: string;
	model: string | null;
	effort: string | null;
	mode: string | null;
	skills: string | null;
	connectors: string | null;
	auto_start: number | null;
	plan_first: number | null;
	parallel: number | null;
	handoff_to: string | null;
	created_at: string;
	updated_at: string;
};

function ids(text: string | null): string[] | null {
	if (text === null) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: null;
	} catch {
		return null;
	}
}

function toRole(row: Row): Role {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		name: row.name,
		icon: (ROLE_ICONS as readonly string[]).includes(row.icon) ? (row.icon as RoleIcon) : "code",
		specialty: row.specialty ?? "",
		brief: row.brief,
		provider: row.provider,
		model: row.model,
		effort: row.effort,
		mode: row.mode,
		skills: ids(row.skills) ?? [],
		connectors: ids(row.connectors),
		autoStart: row.auto_start === 1,
		planFirst: row.plan_first !== 0,
		parallel: Math.max(1, row.parallel ?? 1),
		handoffTo: row.handoff_to,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/** Columns teammates added to a role, each with its value for roles made before them. */
const TEAMMATE_COLUMNS: [string, string][] = [
	["specialty", "TEXT NOT NULL DEFAULT ''"],
	["skills", "TEXT NOT NULL DEFAULT '[]'"],
	["connectors", "TEXT"],
	["auto_start", "INTEGER NOT NULL DEFAULT 0"],
	["plan_first", "INTEGER NOT NULL DEFAULT 1"],
	["parallel", "INTEGER NOT NULL DEFAULT 1"],
	["handoff_to", "TEXT"],
];

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
		const have = new Set(
			this.db
				.query<{ name: string }, []>("PRAGMA table_info(roles)")
				.all()
				.map((column) => column.name),
		);
		for (const [name, type] of TEAMMATE_COLUMNS)
			if (!have.has(name)) this.db.exec(`ALTER TABLE roles ADD COLUMN ${name} ${type}`);
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
	create(
		workspaceId: string,
		draft: Partial<RoleDraft> & Pick<RoleDraft, "name" | "icon" | "brief" | "provider">,
		limit = MAX_ROLES,
	): Role | null {
		return this.db.transaction(() => {
			if (this.count(workspaceId) >= limit) return null;
			return this.insert(workspaceId, {
				model: null,
				effort: null,
				mode: null,
				...TEAMMATE_DEFAULTS,
				...draft,
			});
		})();
	}

	private insert(workspaceId: string, draft: RoleDraft): Role {
		const now = new Date().toISOString();
		const id = crypto.randomUUID();
		this.db
			.query(
				`INSERT INTO roles (id, workspace_id, name, icon, specialty, brief, provider, model, effort, mode,
				   skills, connectors, auto_start, plan_first, parallel, handoff_to, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				workspaceId,
				draft.name,
				draft.icon,
				draft.specialty,
				draft.brief,
				draft.provider,
				draft.model,
				draft.effort,
				draft.mode,
				JSON.stringify(draft.skills),
				draft.connectors === null ? null : JSON.stringify(draft.connectors),
				draft.autoStart ? 1 : 0,
				draft.planFirst ? 1 : 0,
				draft.parallel,
				draft.handoffTo,
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
				`UPDATE roles SET name = ?, icon = ?, specialty = ?, brief = ?, provider = ?, model = ?, effort = ?,
				   mode = ?, skills = ?, connectors = ?, auto_start = ?, plan_first = ?, parallel = ?,
				   handoff_to = ?, updated_at = ?
				 WHERE workspace_id = ? AND id = ?`,
			)
			.run(
				next.name,
				next.icon,
				next.specialty,
				next.brief,
				next.provider,
				next.model,
				next.effort,
				next.mode,
				JSON.stringify(next.skills),
				next.connectors === null ? null : JSON.stringify(next.connectors),
				next.autoStart ? 1 : 0,
				next.planFirst ? 1 : 0,
				next.parallel,
				next.handoffTo,
				next.updatedAt,
				workspaceId,
				id,
			);
		return next;
	}

	/** Removes a teammate; any teammate that handed its cards to this one now keeps them. */
	remove(workspaceId: string, id: string): boolean {
		return this.db.transaction(() => {
			this.db
				.query("UPDATE roles SET handoff_to = NULL WHERE workspace_id = ? AND handoff_to = ?")
				.run(workspaceId, id);
			return (
				this.db.query("DELETE FROM roles WHERE workspace_id = ? AND id = ?").run(workspaceId, id)
					.changes > 0
			);
		})();
	}

	close(): void {
		this.db.close();
	}
}
