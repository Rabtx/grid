import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Reading } from "./reading";

/** A workspace's last reading of its numbers, per period, and the thread it was read in. */
export type Snapshot = {
	workspace: string;
	days: number;
	reading: Reading | null;
	/** The project its thread is in. */
	project: string | null;
	thread: string | null;
	agent: string | null;
	error: string | null;
	at: string;
};

export class PulseStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`CREATE TABLE IF NOT EXISTS pulse_snapshots (
			workspace TEXT NOT NULL,
			days INTEGER NOT NULL,
			data TEXT NOT NULL,
			at TEXT NOT NULL,
			PRIMARY KEY (workspace, days)
		)`);
	}

	get(workspace: string, days: number): Snapshot | null {
		const row = this.db
			.query<{ data: string }, [string, number]>(
				"SELECT data FROM pulse_snapshots WHERE workspace = ? AND days = ?",
			)
			.get(workspace, days);
		return row ? (JSON.parse(row.data) as Snapshot) : null;
	}

	save(snapshot: Snapshot): void {
		this.db
			.query(
				`INSERT INTO pulse_snapshots (workspace, days, data, at) VALUES (?, ?, ?, ?)
				 ON CONFLICT (workspace, days) DO UPDATE SET data = excluded.data, at = excluded.at`,
			)
			.run(snapshot.workspace, snapshot.days, JSON.stringify(snapshot), snapshot.at);
	}
}
