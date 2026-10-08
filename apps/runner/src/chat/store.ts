import { tmpdir } from "node:os";
import { AttachmentFiles, type Attachment } from "./attachments";
import type { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ChatEvent, Choice } from "../agents/events";

import type { Worktree } from "./worktrees";
import { openPrivateDatabase } from "../private-database";

/** A conversation with an agent, as the console lists it. */
/** The last time an agent edited a file: which agent, in which thread, and when. */
export type AgentEdit = { provider: string; sessionId: string; at: string };

/** An addition an agent suggested to one of the project's notes. */
export type NoteSuggestion = {
	id: string;
	project: string;
	noteId: string;
	/** The agent that suggested it, and the thread it was working in. */
	provider: string;
	sessionId: string;
	text: string;
	createdAt: string;
};

/** Events read at a time, newest first, looking for where the latest turn began. */
const EVENTS_PAGE = 100;

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
	/** The chat's own git worktree, when it has one (`cwd` is inside it). */
	worktree: Worktree | null;
	/** The role it was started as, as the role was then: its brief goes with the first message. */
	role?: SessionRole | null;
	/** The project's notes shared with agents, as they were when it started (see `SessionNotes`). */
	notes?: SessionNotes | null;
	createdAt: string;
	updatedAt: string;
};

/** A role as a thread keeps it: renaming or removing the role later does not change the thread. */
export type SessionRole = {
	id: string;
	name: string;
	icon: string;
	brief: string;
	/** The agent has had the brief: a turn carrying it ended without failing. */
	briefed?: boolean;
};

/**
 * The notes a project shares with agents, as a thread was started with them: they go with the
 * first message, like a role's brief, and later edits to the notes do not change the thread.
 */
export type SessionNotes = {
	text: string;
	/** The agent has had them: a turn carrying them ended without failing. */
	briefed?: boolean;
};

/** What each project is set to on this machine. */
export type ProjectSettings = {
	/** New chats start in their own git worktree unless the composer says otherwise (off by default). */
	worktrees: boolean;
};

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = { worktrees: false };

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
	worktree: string | null;
	role?: string | null;
	notes?: string | null;
	created_at: string;
	updated_at: string;
};

function readWorktree(raw: string | null): Worktree | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Worktree;
	} catch {
		return null;
	}
}

function readRole(raw: string | null): SessionRole | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SessionRole;
	} catch {
		return null;
	}
}

function readNotes(raw: string | null): SessionNotes | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SessionNotes;
	} catch {
		return null;
	}
}

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
		worktree: readWorktree(row.worktree),
		role: readRole(row.role ?? null),
		notes: readNotes(row.notes ?? null),
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
	readonly attachmentFiles: AttachmentFiles;
	private readonly temporary: boolean;

	constructor(path: string) {
		this.temporary = path === ":memory:";
		this.attachmentFiles = new AttachmentFiles(
			this.temporary
				? mkdtempSync(join(tmpdir(), "grid-attachments-"))
				: resolve(dirname(path), "attachments"),
		);
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
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
		this.db.exec(`CREATE TABLE IF NOT EXISTS attachments (
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(session_id, id)
		)`);
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
		if (!hasColumn(this.db, "sessions", "worktree")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN worktree TEXT");
		}
		if (!hasColumn(this.db, "sessions", "role")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN role TEXT");
		}
		if (!hasColumn(this.db, "sessions", "notes")) {
			this.db.exec("ALTER TABLE sessions ADD COLUMN notes TEXT");
		}
		// Additions agents suggested to the project's shared notes, until someone adds or dismisses them.
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS note_suggestions (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				note_id TEXT NOT NULL,
				provider TEXT NOT NULL,
				session_id TEXT NOT NULL,
				text TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS note_suggestions_project
				ON note_suggestions (workspace_id, project, created_at);
		`);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS project_settings (
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (workspace_id, project)
			);
		`);
		// The last agent to edit each file (by absolute path), so Files can say a change not yet
		// committed was an agent's. One row per file: only the latest edit matters.
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS agent_edits (
				path TEXT PRIMARY KEY,
				provider TEXT NOT NULL,
				session_id TEXT NOT NULL,
				at TEXT NOT NULL
			);
		`);
	}

	/** An agent in `sessionId` just edited these files (absolute paths). */
	recordAgentEdits(sessionId: string, provider: string, paths: readonly string[]): void {
		if (paths.length === 0) return;
		const at = new Date().toISOString();
		const upsert = this.db.query(
			`INSERT INTO agent_edits (path, provider, session_id, at) VALUES (?, ?, ?, ?)
			ON CONFLICT(path) DO UPDATE SET provider = excluded.provider,
				session_id = excluded.session_id, at = excluded.at`,
		);
		this.db.transaction(() => {
			for (const path of new Set(paths)) upsert.run(path, provider, sessionId, at);
		})();
	}

	/** The latest physical-file edit, only when its session belongs to this workspace. */
	agentEdits(workspace: string, paths: readonly string[]): Map<string, AgentEdit> {
		const found = new Map<string, AgentEdit>();
		const read = this.db.query<
			{ path: string; provider: string; session_id: string; at: string },
			[string, string]
		>(`SELECT e.path, e.provider, e.session_id, e.at FROM agent_edits e
			INNER JOIN sessions s ON s.id = e.session_id WHERE e.path = ? AND s.workspace_id = ?`);
		for (const path of new Set(paths)) {
			const row = read.get(path, workspace);
			if (row) found.set(path, { provider: row.provider, sessionId: row.session_id, at: row.at });
		}
		return found;
	}

	/**
	 * Moves what a person kept before workspaces (keyed by their own id) into their default
	 * workspace. Runs whenever they act there; after the first time it finds nothing.
	 */
	/** Keep what an agent in `session` suggested adding to the project's notes. */
	addNoteSuggestions(
		session: Pick<ChatSessionRow, "id" | "workspaceId" | "project" | "provider">,
		drafts: readonly { noteId: string; text: string }[],
	): NoteSuggestion[] {
		const insert = this.db.query(
			`INSERT INTO note_suggestions (id, workspace_id, project, note_id, provider, session_id, text, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const made: NoteSuggestion[] = drafts.map((draft) => ({
			id: crypto.randomUUID(),
			project: session.project,
			noteId: draft.noteId,
			provider: session.provider,
			sessionId: session.id,
			text: draft.text,
			createdAt: new Date().toISOString(),
		}));
		this.db.transaction(() => {
			for (const item of made)
				insert.run(
					item.id,
					session.workspaceId,
					item.project,
					item.noteId,
					item.provider,
					item.sessionId,
					item.text,
					item.createdAt,
				);
		})();
		return made;
	}

	/** A project's suggestions waiting on someone, oldest first. */
	noteSuggestions(workspace: string, project: string): NoteSuggestion[] {
		return this.db
			.query<
				{
					id: string;
					project: string;
					note_id: string;
					provider: string;
					session_id: string;
					text: string;
					created_at: string;
				},
				[string, string]
			>(
				`SELECT id, project, note_id, provider, session_id, text, created_at FROM note_suggestions
				WHERE workspace_id = ? AND project = ? ORDER BY created_at`,
			)
			.all(workspace, project)
			.map((row) => ({
				id: row.id,
				project: row.project,
				noteId: row.note_id,
				provider: row.provider,
				sessionId: row.session_id,
				text: row.text,
				createdAt: row.created_at,
			}));
	}

	/** Done with a suggestion (added or dismissed); false when there was no such one. */
	dropNoteSuggestion(workspace: string, id: string): boolean {
		return (
			this.db
				.query("DELETE FROM note_suggestions WHERE workspace_id = ? AND id = ?")
				.run(workspace, id).changes > 0
		);
	}

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
				`INSERT INTO sessions (id, owner_id, workspace_id, project, provider, title, cwd, model, mode, effort, resume_token, worktree, role, notes, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
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
				session.worktree ? JSON.stringify(session.worktree) : null,
				session.role ? JSON.stringify(session.role) : null,
				session.notes ? JSON.stringify(session.notes) : null,
				now,
				now,
			);
		return {
			...session,
			role: session.role ?? null,
			notes: session.notes ?? null,
			resumeToken: null,
			createdAt: now,
			updatedAt: now,
		};
	}

	/**
	 * A thread brought back from Grid's database onto this machine: the same id, times and event
	 * numbers it had. It has no provider session to resume here, so its next turn starts a fresh
	 * one. False when this machine already has it.
	 */
	importThread(
		session: Omit<ChatSessionRow, "resumeToken" | "worktree" | "role" | "notes">,
		events: { seq: number; data: unknown }[],
	): boolean {
		if (this.exists(session.id)) return false;
		const insert = this.db.query(
			"INSERT OR IGNORE INTO events (session_id, seq, data) VALUES (?, ?, ?)",
		);
		this.db.transaction(() => {
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
					session.createdAt,
					session.updatedAt,
				);
			for (const event of events) insert.run(session.id, event.seq, JSON.stringify(event.data));
		})();
		return true;
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

	/** Numeric-only retained-session maxima; never materialize conversation event payloads. */
	projectCosts(
		workspace: string,
		project: string,
	): {
		provider: string;
		costUsd: number | null;
		reportedSessions: number;
		totalSessions: number;
	}[] {
		return this.db
			.query<
				{
					provider: string;
					costUsd: number | null;
					reportedSessions: number;
					totalSessions: number;
				},
				[string, string]
			>(`
			WITH costs AS (
			 SELECT s.id, s.provider, MAX(CASE WHEN json_extract(e.data, '$.type') = 'usage'
			 AND json_type(e.data, '$.costUsd') IN ('integer', 'real')
			 AND json_extract(e.data, '$.costUsd') >= 0
			 AND json_extract(e.data, '$.costUsd') <= 1.7976931348623157e308
			 THEN json_extract(e.data, '$.costUsd') END) AS cost
			 FROM sessions s LEFT JOIN events e ON e.session_id = s.id
			 WHERE s.workspace_id = ? AND s.project = ? GROUP BY s.id, s.provider
			) SELECT provider, SUM(cost) AS costUsd, COUNT(cost) AS reportedSessions,
			 COUNT(*) AS totalSessions FROM costs GROUP BY provider ORDER BY provider
		`)
			.all(workspace, project);
	}

	update(
		id: string,
		fields: Partial<
			Pick<
				ChatSessionRow,
				| "title"
				| "model"
				| "mode"
				| "effort"
				| "resumeToken"
				| "cwd"
				| "worktree"
				| "role"
				| "notes"
			>
		>,
	): void {
		const columns: Record<string, string> = {
			title: "title",
			model: "model",
			mode: "mode",
			effort: "effort",
			resumeToken: "resume_token",
			cwd: "cwd",
			worktree: "worktree",
			role: "role",
			notes: "notes",
		};
		// `undefined` means "leave it alone", not "clear it": callers pass whole shapes, and
		// binding undefined stores NULL, which is how one `configure` with no fields in it
		// silently wiped a chat's model, mode and effort.
		const entries = Object.entries(fields).filter(
			([key, value]) => key in columns && value !== undefined,
		);
		if (entries.length === 0) return;
		const sets = entries.map(([key]) => `${columns[key]} = ?`).join(", ");
		const values = entries.map(([key, value]) =>
			key === "worktree" || key === "role" || key === "notes"
				? value
					? JSON.stringify(value)
					: null
				: (value as string | null),
		);
		this.db
			.query(`UPDATE sessions SET ${sets}, updated_at = ? WHERE id = ?`)
			.run(...values, new Date().toISOString(), id);
	}

	/** The workspace's chats that have a worktree. */
	withWorktrees(workspace: string): ChatSessionRow[] {
		return this.db
			.query<Row, [string]>(
				"SELECT * FROM sessions WHERE workspace_id = ? AND worktree IS NOT NULL ORDER BY updated_at DESC",
			)
			.all(workspace)
			.map(toSession);
	}

	projectSettings(workspace: string, project: string): ProjectSettings {
		const row = this.db
			.query<{ data: string }, [string, string]>(
				"SELECT data FROM project_settings WHERE workspace_id = ? AND project = ?",
			)
			.get(workspace, project);
		if (!row) return { ...DEFAULT_PROJECT_SETTINGS };
		try {
			return { ...DEFAULT_PROJECT_SETTINGS, ...(JSON.parse(row.data) as Partial<ProjectSettings>) };
		} catch {
			return { ...DEFAULT_PROJECT_SETTINGS };
		}
	}

	setProjectSettings(workspace: string, project: string, settings: ProjectSettings): void {
		this.db
			.query(
				`INSERT INTO project_settings (workspace_id, project, data) VALUES (?, ?, ?)
				 ON CONFLICT (workspace_id, project) DO UPDATE SET data = excluded.data`,
			)
			.run(workspace, project, JSON.stringify(settings));
	}

	touch(id: string): void {
		this.db
			.query("UPDATE sessions SET updated_at = ? WHERE id = ?")
			.run(new Date().toISOString(), id);
	}

	attachment(session: string, id: string): Attachment | null {
		const row = this.db
			.query<{ data: string }, [string, string]>(
				"SELECT data FROM attachments WHERE session_id = ? AND id = ?",
			)
			.get(session, id);
		return row ? (JSON.parse(row.data) as Attachment) : null;
	}

	/** How many files a thread keeps, and how many bytes. */
	attachmentUsage(session: string): { count: number; bytes: number } {
		const rows = this.db
			.query<{ data: string }, [string]>("SELECT data FROM attachments WHERE session_id = ?")
			.all(session);
		return {
			count: rows.length,
			bytes: rows.reduce((sum, row) => sum + ((JSON.parse(row.data) as Attachment).size ?? 0), 0),
		};
	}

	addAttachment(session: string, attachment: Attachment, bytes: Uint8Array): void {
		this.attachmentFiles.write(session, attachment, bytes);
		try {
			this.db
				.query("INSERT INTO attachments (session_id, id, data) VALUES (?, ?, ?)")
				.run(session, attachment.id, JSON.stringify(attachment));
		} catch (cause) {
			this.attachmentFiles.remove(session, attachment);
			throw cause;
		}
	}

	delete(id: string): void {
		this.attachmentFiles.remove(id);
		this.db.query("DELETE FROM sessions WHERE id = ?").run(id);
	}

	/**
	 * Threads in a workspace untouched since `before` that hold no worktree (a worktree may hold
	 * work nobody has pushed): what a run-log retention clears.
	 */
	idleSince(workspaceId: string, before: string): string[] {
		return this.db
			.query<{ id: string }, [string, string]>(
				"SELECT id FROM sessions WHERE workspace_id = ? AND updated_at < ? AND worktree IS NULL",
			)
			.all(workspaceId, before)
			.map((row) => row.id);
	}

	/** How many people have started threads with each agent in a workspace. */
	agentUsage(workspaceId: string): Record<string, number> {
		const rows = this.db
			.query<{ provider: string; people: number }, [string]>(
				"SELECT provider, COUNT(DISTINCT owner_id) AS people FROM sessions WHERE workspace_id = ? GROUP BY provider",
			)
			.all(workspaceId);
		return Object.fromEntries(rows.map((row) => [row.provider, row.people]));
	}

	append(sessionId: string, events: ChatEvent[]): void {
		if (events.length === 0) return;
		// An agent told to stop is not stopped at once, and what it had already written is still
		// in its pipe: the last thing it says can arrive after its chat was deleted, and this row
		// went with the chat. `events` is keyed to a session, so the write failed on the foreign
		// key — inside the agent's own read loop and inside the flush timer, where an unhandled
		// error takes the runner down and leaves every other chat and terminal orphaned with it.
		// An event for a chat that is gone has nowhere to go, so it is dropped.
		if (!this.exists(sessionId)) return;
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

	/** Whether the chat is still there. An event for one that is not has nowhere to go. */
	private exists(sessionId: string): boolean {
		return (
			this.db
				.query<{ one: number }, [string]>("SELECT 1 FROM sessions WHERE id = ?")
				.get(sessionId) !== null
		);
	}

	events(sessionId: string): ChatEvent[] {
		return this.db
			.query<{ data: string }, [string]>(
				"SELECT data FROM events WHERE session_id = ? ORDER BY seq",
			)
			.all(sessionId)
			.map((row) => JSON.parse(row.data) as ChatEvent);
	}

	/**
	 * The thread's last `turns` messages and everything after them, from before `before` (a `seq`)
	 * when given: what a device is sent on opening a thread, and each page of earlier history it
	 * asks for after. `earlier` is where the history before them ends, to ask for next; null when
	 * these reach the start of the thread. Each page starts at a message, so a turn is never split.
	 */
	recentEvents(
		sessionId: string,
		turns: number,
		before = Number.MAX_SAFE_INTEGER,
	): { events: ChatEvent[]; earlier: number | null } {
		const page = this.db.query<{ seq: number; data: string }, [string, number, number]>(
			"SELECT seq, data FROM events WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
		);
		const events: ChatEvent[] = [];
		let messages = 0;
		let cursor = before;
		for (;;) {
			const rows = page.all(sessionId, cursor, EVENTS_PAGE);
			for (const row of rows) {
				const event = JSON.parse(row.data) as ChatEvent;
				events.push(event);
				if (event.type === "user" && ++messages === turns) {
					const more = this.db
						.query<{ one: number }, [string, number]>(
							"SELECT 1 AS one FROM events WHERE session_id = ? AND seq < ? LIMIT 1",
						)
						.get(sessionId, row.seq);
					return { events: events.reverse(), earlier: more ? row.seq : null };
				}
			}
			if (rows.length < EVENTS_PAGE) return { events: events.reverse(), earlier: null };
			cursor = rows[rows.length - 1]?.seq ?? 0;
		}
	}

	/**
	 * The thread's events from the last one of `type` on, or all of them when there is none: the
	 * latest turn, read newest first and stopped there, so a long thread costs no more than its last
	 * turn. What is polled every few seconds (approvals waiting, Operations' runs) reads this.
	 */
	eventsFromLast(sessionId: string, type: ChatEvent["type"]): ChatEvent[] {
		const page = this.db.query<{ seq: number; data: string }, [string, number, number]>(
			"SELECT seq, data FROM events WHERE session_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
		);
		const latest: ChatEvent[] = [];
		let before = Number.MAX_SAFE_INTEGER;
		for (;;) {
			const rows = page.all(sessionId, before, EVENTS_PAGE);
			for (const row of rows) {
				const event = JSON.parse(row.data) as ChatEvent;
				latest.push(event);
				if (event.type === type) return latest.reverse();
			}
			if (rows.length < EVENTS_PAGE) return latest.reverse();
			before = rows[rows.length - 1]?.seq ?? 0;
		}
	}

	/** Every project folder the workspace has linked on this machine, by project slug. */
	/**
	 * Threads in a workspace whose title or messages mention any of the words, newest first: each
	 * with the words it matched and a passage around the first one (Search, Ask Grid).
	 */
	searchText(
		workspace: string,
		words: readonly string[],
		limit = 20,
	): {
		id: string;
		project: string;
		provider: string;
		title: string;
		updatedAt: string;
		hits: number;
		passage: string;
	}[] {
		const terms = words
			.map((word) => word.toLowerCase())
			.filter(Boolean)
			.slice(0, 8);
		if (!terms.length) return [];
		const sessions = this.db
			.query<
				{ id: string; project: string; provider: string; title: string; updated_at: string },
				[string]
			>(
				"SELECT id, project, provider, title, updated_at FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 400",
			)
			.all(workspace);
		const texts = this.db.query<{ data: string }, [string]>(
			`SELECT data FROM events WHERE session_id = ? AND (data LIKE '{"type":"user"%' OR data LIKE '{"type":"message"%') ORDER BY seq LIMIT 200`,
		);
		const found: ReturnType<ChatStore["searchText"]> = [];
		for (const session of sessions) {
			const parts = [session.title];
			for (const row of texts.all(session.id)) {
				try {
					const event = JSON.parse(row.data) as { text?: unknown };
					if (typeof event.text === "string") parts.push(event.text);
				} catch {
					// A malformed event is skipped.
				}
			}
			const body = parts.join("\n");
			const lower = body.toLowerCase();
			const matched = terms.filter((term) => lower.includes(term));
			if (!matched.length) continue;
			const at = lower.indexOf(matched[0] ?? "");
			const passage = body
				.slice(Math.max(0, at - 160), at + 320)
				.replace(/\s+/g, " ")
				.trim();
			found.push({
				id: session.id,
				project: session.project,
				provider: session.provider,
				title: session.title,
				updatedAt: session.updated_at,
				hits: matched.length,
				passage,
			});
		}
		return found.sort((a, b) => b.hits - a.hits).slice(0, limit);
	}

	/** Every workspace with chats or linked folders here. */
	workspaces(): string[] {
		return this.db
			.query<{ id: string }, []>(
				"SELECT workspace_id AS id FROM sessions UNION SELECT workspace_id FROM project_folders",
			)
			.all()
			.map((row) => row.id);
	}

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

	/** Take a model out of an agent's kept list: true when it was there. */
	dropCatalogModel(provider: string, model: string): boolean {
		const kept = this.catalog(provider);
		if (!kept) return false;
		const models = kept.data.models.filter((entry) => entry.id !== model);
		if (models.length === kept.data.models.length) return false;
		this.setCatalog(provider, { ...kept.data, models });
		return true;
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
		if (this.temporary) rmSync(this.attachmentFiles.root, { recursive: true, force: true });
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
