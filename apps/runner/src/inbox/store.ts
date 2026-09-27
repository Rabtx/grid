import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * What kind of thing is waiting, which decides how a row reads and which icon it gets. The three
 * agent kinds are the ones push notifications already speak for; the two GitHub kinds arrive from
 * a refresh instead (see `github.ts`).
 */
const INBOX_KINDS = ["approval", "turn_done", "turn_error", "pull_review", "pull_checks"] as const;

export type InboxKind = (typeof INBOX_KINDS)[number];

/** One thing waiting for a person, as the Inbox lists it. */
export type InboxItem = {
	/** Stable per event, so the same thing arriving twice is one row. */
	id: string;
	workspaceId: string;
	kind: InboxKind;
	project: string;
	/** The thread or pull request's own name, so a row is recognisable on its own. */
	title: string;
	/** The line of context under it: what is waiting, or what went wrong. */
	body: string;
	/** Where tapping the row goes: a chat, or a project's pull requests. */
	url: string;
	createdAt: string;
	readAt: string | null;
};

/** An item to keep. `id` decides whether it is new; `readAt` is never taken from here. */
export type InboxDraft = Omit<InboxItem, "readAt">;

type Row = {
	id: string;
	workspace_id: string;
	kind: string;
	project: string;
	title: string;
	body: string;
	url: string;
	created_at: string;
	read_at: string | null;
};

function toItem(row: Row): InboxItem {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		kind: row.kind as InboxKind,
		project: row.project,
		title: row.title,
		body: row.body,
		url: row.url,
		createdAt: row.created_at,
		readAt: row.read_at,
	};
}

/**
 * Everything waiting on the people in a workspace, in the runner's chat database beside the
 * conversations themselves. Rows are keyed by the event that made them, so an agent that ends two
 * turns while someone is away leaves two rows, and a hook that fires twice leaves one.
 */
export class InboxStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS inbox_items (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				project TEXT NOT NULL,
				title TEXT NOT NULL,
				body TEXT NOT NULL,
				url TEXT NOT NULL,
				created_at TEXT NOT NULL,
				read_at TEXT
			);
			CREATE INDEX IF NOT EXISTS inbox_by_workspace ON inbox_items (workspace_id, created_at);
		`);
	}

	/**
	 * Keeps an item, or leaves the one already there under the same id. A row that has been read
	 * stays read: the person dealt with it, and the same event asking again would be noise.
	 */
	keep(draft: InboxDraft): void {
		this.db
			.query(
				`INSERT INTO inbox_items (id, workspace_id, kind, project, title, body, url, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET title = excluded.title, body = excluded.body`,
			)
			.run(
				draft.id,
				draft.workspaceId,
				draft.kind,
				draft.project,
				draft.title,
				draft.body,
				draft.url,
				draft.createdAt,
			);
	}

	/**
	 * A workspace's items, newest first, and whether the person has read them. Two items from the
	 * same moment (a review and a failing check on one pull request) fall back to the id, so the
	 * list does not reorder itself between two reads of the same page. A row is dropped once it is
	 * old and read: the list is what is waiting, not a history.
	 */
	list(
		workspaceId: string,
		keepReadFor: number = READ_RETENTION_MS,
	): {
		items: InboxItem[];
		unread: number;
	} {
		this.prune(workspaceId, keepReadFor);
		const rows = this.db
			.query<Row, [string]>(
				"SELECT * FROM inbox_items WHERE workspace_id = ? ORDER BY created_at DESC, id DESC",
			)
			.all(workspaceId);
		const items = rows.map(toItem);
		return { items, unread: items.filter((item) => !item.readAt).length };
	}

	/** How many are waiting unread, for the sidebar's count. */
	unread(workspaceId: string): number {
		return (
			this.db
				.query<{ n: number }, [string]>(
					"SELECT COUNT(*) AS n FROM inbox_items WHERE workspace_id = ? AND read_at IS NULL",
				)
				.get(workspaceId)?.n ?? 0
		);
	}

	/**
	 * Marks one item read, or every one in the workspace when `id` is left out. Scoped to the
	 * workspace so one member cannot clear another's, and told how many rows it actually changed.
	 */
	read(workspaceId: string, id?: string): number {
		const now = new Date().toISOString();
		const result = id
			? this.db
					.query(
						"UPDATE inbox_items SET read_at = ? WHERE workspace_id = ? AND id = ? AND read_at IS NULL",
					)
					.run(now, workspaceId, id)
			: this.db
					.query("UPDATE inbox_items SET read_at = ? WHERE workspace_id = ? AND read_at IS NULL")
					.run(now, workspaceId);
		return result.changes;
	}

	/**
	 * Marks read everything pointing at one page — a thread, or a project's pull requests — or
	 * every item in the workspace when no path is given. Opening what was waiting is what reading
	 * it means.
	 */
	readAt(workspaceId: string, path?: string): number {
		const now = new Date().toISOString();
		if (path === undefined) return this.read(workspaceId);
		// An item points at `/pulls/grid?pr=12`, so a page matches it whole or with a query after it.
		return this.db
			.query(
				`UPDATE inbox_items SET read_at = ?
				 WHERE workspace_id = ? AND read_at IS NULL AND (url = ? OR url LIKE ?)`,
			)
			.run(now, workspaceId, path, `${path}?%`).changes;
	}

	/**
	 * Forgets the items of a refresh's kinds that it did not see again — a pull request merged, a
	 * check fixed, a review given. Scoped to one project and to the kinds a refresh supplies, so a
	 * turn that finished still happened and one project's failure cannot clear another's.
	 */
	forgetMissing(
		workspaceId: string,
		project: string,
		kinds: readonly InboxKind[],
		seen: readonly string[],
	): number {
		if (kinds.length === 0) return 0;
		const placeholders = kinds.map(() => "?").join(", ");
		const seenPlaceholders = seen.map(() => "?").join(", ");
		const clause = seen.length > 0 ? `AND id NOT IN (${seenPlaceholders})` : "";
		return this.db
			.query(
				`DELETE FROM inbox_items
				 WHERE workspace_id = ? AND project = ? AND kind IN (${placeholders})
				   AND read_at IS NULL ${clause}`,
			)
			.run(workspaceId, project, ...kinds, ...seen).changes;
	}

	/** Read and long past: a month old, an item is not "waiting" any more. */
	private prune(workspaceId: string, keepReadFor: number): void {
		const cutoff = new Date(Date.now() - keepReadFor).toISOString();
		this.db
			.query(
				"DELETE FROM inbox_items WHERE workspace_id = ? AND read_at IS NOT NULL AND read_at <= ?",
			)
			.run(workspaceId, cutoff);
	}

	close(): void {
		this.db.close();
	}
}

/** How long a read item stays on the list. */
const READ_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
