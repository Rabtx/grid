import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "./private-database";

/**
 * Rate limits that hold across restarts: each thing done is kept with when it was done, by scope
 * (`webhook`, `guest`, `outside-start`) and key (an automation, a link, a person). A limit kept in
 * memory started again from nothing each time the runner did, so a crash loop, or a caller that
 * could make the runner restart, was never limited.
 */
export class RateLog {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS rate_events (
				scope TEXT NOT NULL,
				key TEXT NOT NULL,
				at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS rate_events_by_key ON rate_events (scope, key, at);
		`);
	}

	/**
	 * Count one more against `limit` in the last `windowMs`: true when it fits (and is counted),
	 * false when the limit is reached.
	 */
	take(scope: string, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
		return this.db.transaction(() => {
			this.db
				.query("DELETE FROM rate_events WHERE scope = ? AND key = ? AND at <= ?")
				.run(scope, key, now - windowMs);
			const count =
				this.db
					.query<{ n: number }, [string, string]>(
						"SELECT COUNT(*) AS n FROM rate_events WHERE scope = ? AND key = ?",
					)
					.get(scope, key)?.n ?? 0;
			if (count >= limit) return false;
			this.db
				.query("INSERT INTO rate_events (scope, key, at) VALUES (?, ?, ?)")
				.run(scope, key, now);
			return true;
		})();
	}

	/** Forget a key's history (what it limited is gone). */
	forget(scope: string, key: string): void {
		this.db.query("DELETE FROM rate_events WHERE scope = ? AND key = ?").run(scope, key);
	}

	close(): void {
		this.db.close();
	}
}
