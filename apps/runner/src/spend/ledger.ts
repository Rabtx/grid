import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "../private-database";

/** What a cost is counted against, beyond its workspace: who, where, and what started it. */
export type SpendTags = {
	workspaceId: string;
	ownerId: string;
	project: string;
	sessionId: string;
	/** The automation whose run the thread is, if it is one. */
	automationId?: string | null;
	/** The agent key that started the thread, if one did. */
	keyId?: string | null;
};

/** Which costs to add up: all of a workspace's, or narrowed by any of these. */
export type SpendFilter = {
	ownerId?: string;
	project?: string;
	automationId?: string;
	keyId?: string;
	sessionId?: string;
};

/**
 * What agents cost, as it happens: each thread's agent reports what its process has cost so far
 * (`usage.costUsd`, a running total that starts again with a new process), and each rise is kept
 * here with when it came and what it counts against. Budgets (`budgets.ts`), keys' caps and the
 * audit log add these up.
 */
export class SpendLedger {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS spend (
				workspace_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				project TEXT NOT NULL,
				session_id TEXT NOT NULL,
				automation_id TEXT,
				key_id TEXT,
				at INTEGER NOT NULL,
				usd REAL NOT NULL
			);
			CREATE INDEX IF NOT EXISTS spend_by_workspace ON spend (workspace_id, at);
			CREATE INDEX IF NOT EXISTS spend_by_session ON spend (session_id);
			CREATE TABLE IF NOT EXISTS spend_seen (
				session_id TEXT PRIMARY KEY,
				reported REAL NOT NULL
			);
		`);
	}

	/**
	 * A thread's agent reported what it has cost so far. A total lower than the last is a new
	 * process counting from nothing: all of it is new. Returns what was added.
	 */
	report(tags: SpendTags, costUsd: number, now = Date.now()): number {
		if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
		return this.db.transaction(() => {
			const seen =
				this.db
					.query<{ reported: number }, [string]>(
						"SELECT reported FROM spend_seen WHERE session_id = ?",
					)
					.get(tags.sessionId)?.reported ?? 0;
			const added = costUsd >= seen ? costUsd - seen : costUsd;
			this.db
				.query(
					`INSERT INTO spend_seen (session_id, reported) VALUES (?, ?)
					 ON CONFLICT (session_id) DO UPDATE SET reported = excluded.reported`,
				)
				.run(tags.sessionId, costUsd);
			if (added <= 0) return 0;
			this.db
				.query(
					`INSERT INTO spend (workspace_id, owner_id, project, session_id, automation_id, key_id, at, usd)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					tags.workspaceId,
					tags.ownerId,
					tags.project,
					tags.sessionId,
					tags.automationId ?? null,
					tags.keyId ?? null,
					now,
					added,
				);
			return added;
		})();
	}

	/** What a workspace spent since a time (ms), narrowed by `filter`. */
	total(workspace: string, filter: SpendFilter, since: number): number {
		const where = ["workspace_id = ?", "at >= ?"];
		const values: (string | number)[] = [workspace, since];
		const columns: [keyof SpendFilter, string][] = [
			["ownerId", "owner_id"],
			["project", "project"],
			["automationId", "automation_id"],
			["keyId", "key_id"],
			["sessionId", "session_id"],
		];
		for (const [field, column] of columns) {
			const value = filter[field];
			if (value === undefined) continue;
			where.push(`${column} = ?`);
			values.push(value);
		}
		return (
			this.db
				.query<{ usd: number | null }, (string | number)[]>(
					`SELECT SUM(usd) AS usd FROM spend WHERE ${where.join(" AND ")}`,
				)
				.get(...values)?.usd ?? 0
		);
	}

	/** What a workspace spent since a time, by project or by person, most first. */
	breakdown(
		workspace: string,
		by: "project" | "owner",
		since: number,
	): { key: string; usd: number }[] {
		const column = by === "project" ? "project" : "owner_id";
		return this.db
			.query<{ key: string; usd: number }, [string, number]>(
				`SELECT ${column} AS key, SUM(usd) AS usd FROM spend WHERE workspace_id = ? AND at >= ?
				 GROUP BY ${column} ORDER BY usd DESC LIMIT 50`,
			)
			.all(workspace, since);
	}

	/** What each of these threads has cost in all, by thread. */
	byThread(sessionIds: readonly string[]): Map<string, number> {
		const found = new Map<string, number>();
		if (!sessionIds.length) return found;
		const rows = this.db
			.query<{ session_id: string; usd: number }, string[]>(
				`SELECT session_id, SUM(usd) AS usd FROM spend WHERE session_id IN (${sessionIds.map(() => "?").join(",")}) GROUP BY session_id`,
			)
			.all(...sessionIds);
		for (const row of rows) found.set(row.session_id, row.usd);
		return found;
	}

	/** Forget a thread that is gone (what it cost stays in the totals). */
	forget(sessionId: string): void {
		this.db.query("DELETE FROM spend_seen WHERE session_id = ?").run(sessionId);
	}

	close(): void {
		this.db.close();
	}
}
