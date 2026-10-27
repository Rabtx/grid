import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "../private-database";

/**
 * What was done in a workspace by something other than a person at the keyboard, and the changes
 * that let it: agent keys and what they did, guest links and what guests asked, webhook
 * deliveries, automation runs, budgets warning and stopping work. Owners and admins read it in
 * Settings → Audit log. Kept 90 days.
 */

export type AuditActorKind = "person" | "agent_key" | "guest" | "webhook" | "automation" | "grid";

export type AuditEntry = {
	id: string;
	workspaceId: string;
	at: string;
	actor: { kind: AuditActorKind; id: string | null; name: string };
	/** What was done, as `<thing>.<verb>`: `thread.start`, `key.revoke`, `webhook.refused`. */
	action: string;
	project: string | null;
	/** The thread it concerns, when one. */
	sessionId: string | null;
	/** What else it concerns, in words: a thread's or a key's name. */
	target: string | null;
	detail: string | null;
};

export type AuditDraft = Omit<AuditEntry, "id" | "at"> & { at?: string };

type Row = {
	id: string;
	workspace_id: string;
	at: string;
	actor_kind: AuditActorKind;
	actor_id: string | null;
	actor_name: string;
	action: string;
	project: string | null;
	session_id: string | null;
	target: string | null;
	detail: string | null;
};

const entryOf = (row: Row): AuditEntry => ({
	id: row.id,
	workspaceId: row.workspace_id,
	at: row.at,
	actor: { kind: row.actor_kind, id: row.actor_id, name: row.actor_name },
	action: row.action,
	project: row.project,
	sessionId: row.session_id,
	target: row.target,
	detail: row.detail,
});

const KEEP_DAYS = 90;
const PAGE = 100;
const cut = (text: string | null, max: number) =>
	text && text.length > max ? `${text.slice(0, max)}…` : text;

export class AuditLog {
	private readonly db: Database;
	private written = 0;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS audit_log (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				at TEXT NOT NULL,
				actor_kind TEXT NOT NULL,
				actor_id TEXT,
				actor_name TEXT NOT NULL,
				action TEXT NOT NULL,
				project TEXT,
				session_id TEXT,
				target TEXT,
				detail TEXT
			);
			CREATE INDEX IF NOT EXISTS audit_by_workspace ON audit_log (workspace_id, at);
		`);
	}

	record(draft: AuditDraft): AuditEntry {
		const entry: AuditEntry = {
			...draft,
			id: crypto.randomUUID(),
			at: draft.at ?? new Date().toISOString(),
			actor: { ...draft.actor, name: cut(draft.actor.name, 120) ?? "" },
			target: cut(draft.target, 200),
			detail: cut(draft.detail, 1_000),
		};
		this.db
			.query(
				`INSERT INTO audit_log (id, workspace_id, at, actor_kind, actor_id, actor_name, action, project, session_id, target, detail)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				entry.id,
				entry.workspaceId,
				entry.at,
				entry.actor.kind,
				entry.actor.id,
				entry.actor.name,
				entry.action,
				entry.project,
				entry.sessionId,
				entry.target,
				entry.detail,
			);
		// What is older than it is kept for goes now and then, not on every write.
		if (++this.written % 200 === 1) this.prune();
		return entry;
	}

	/**
	 * A workspace's entries, newest first: a page from `before` (an entry's time), narrowed to
	 * one kind of actor or one actor.
	 */
	list(
		workspace: string,
		options: { before?: string; kind?: AuditActorKind; actorId?: string; limit?: number } = {},
	): AuditEntry[] {
		const where = ["workspace_id = ?"];
		const values: string[] = [workspace];
		if (options.before) {
			where.push("at < ?");
			values.push(options.before);
		}
		if (options.kind) {
			where.push("actor_kind = ?");
			values.push(options.kind);
		}
		if (options.actorId) {
			where.push("actor_id = ?");
			values.push(options.actorId);
		}
		const limit = Math.min(PAGE, Math.max(1, options.limit ?? PAGE));
		return this.db
			.query<Row, string[]>(
				`SELECT * FROM audit_log WHERE ${where.join(" AND ")} ORDER BY at DESC, rowid DESC LIMIT ${limit}`,
			)
			.all(...values)
			.map(entryOf);
	}

	prune(now = Date.now()): void {
		const before = new Date(now - KEEP_DAYS * 86_400_000).toISOString();
		this.db.query("DELETE FROM audit_log WHERE at < ?").run(before);
	}

	close(): void {
		this.db.close();
	}
}
