import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

export type DiagnosticKind = "error" | "connection" | "client";

export type DiagnosticEntry = {
	id: number;
	at: number;
	workspace: string | null;
	kind: DiagnosticKind;
	source: string;
	message: string;
	details: Record<string, unknown>;
};

export type DiagnosticInput = Omit<DiagnosticEntry, "id" | "at" | "details"> & {
	at?: number;
	details?: Record<string, unknown>;
};

const MAX_ROWS = 5_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredEntry = Omit<DiagnosticEntry, "details"> & { details: string };

/**
 * A small, bounded record of runner and console connection events in the runner's SQLite file.
 * Rows with no workspace are shown to every workspace, so they carry only coarse details: no
 * paths, ids or names.
 */
export class DiagnosticJournal {
	private readonly db: Database;
	private writesSinceTrim = 0;

	constructor(
		path: string,
		private readonly now: () => number = Date.now,
	) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		// WAL keeps NORMAL safe against corruption; it only skips an fsync per write.
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS runner_diagnostics (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				at INTEGER NOT NULL,
				workspace TEXT,
				kind TEXT NOT NULL CHECK (kind IN ('error', 'connection', 'client')),
				source TEXT NOT NULL,
				message TEXT NOT NULL,
				details TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS runner_diagnostics_by_time ON runner_diagnostics (at DESC);
			CREATE INDEX IF NOT EXISTS runner_diagnostics_by_workspace ON runner_diagnostics (workspace, at DESC);
		`);
		this.trim();
	}

	record(input: DiagnosticInput): void {
		this.db
			.query(
				`INSERT INTO runner_diagnostics (at, workspace, kind, source, message, details)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				input.at ?? this.now(),
				input.workspace,
				input.kind,
				input.source,
				input.message,
				JSON.stringify(input.details ?? {}),
			);
		this.writesSinceTrim += 1;
		if (this.writesSinceTrim >= 64) this.trim();
	}

	list(
		workspace: string,
		options: { since: number; kind?: DiagnosticKind; limit?: number },
	): DiagnosticEntry[] {
		// Pruning happens on writes; reads only hide what has aged out since.
		const since = Math.max(options.since, this.now() - MAX_AGE_MS);
		const rows = this.db
			.query<StoredEntry, [string, number, DiagnosticKind | null, DiagnosticKind | null, number]>(
				`SELECT id, at, workspace, kind, source, message, details
				FROM runner_diagnostics
				WHERE (workspace = ? OR workspace IS NULL) AND at >= ? AND (? IS NULL OR kind = ?)
				ORDER BY at DESC, id DESC
				LIMIT ?`,
			)
			.all(workspace, since, options.kind ?? null, options.kind ?? null, options.limit ?? 500);
		return rows.map((row) => ({ ...row, details: parseDetails(row.details) }));
	}

	reconnectCount(workspace: string, since: number): number {
		const row = this.db
			.query<{ count: number }, [string, number]>(
				`SELECT count(*) AS count FROM runner_diagnostics
				WHERE (workspace = ? OR workspace IS NULL) AND kind = 'client' AND at >= ?
				AND json_extract(details, '$.event') = 'reconnect'`,
			)
			.get(workspace, since);
		return row?.count ?? 0;
	}

	close(): void {
		this.db.close();
	}

	private trim(): void {
		this.writesSinceTrim = 0;
		this.db
			.query(
				`DELETE FROM runner_diagnostics
				WHERE at < ? OR id NOT IN (
					SELECT id FROM runner_diagnostics ORDER BY at DESC, id DESC LIMIT ?
				)`,
			)
			.run(this.now() - MAX_AGE_MS, MAX_ROWS);
	}
}

function parseDetails(value: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
