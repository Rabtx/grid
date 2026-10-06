import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { OperateError } from "./service";

export type LogSource = { name: string; path: string };
export type HostingCharge = {
	id: string;
	service: string;
	provider: string;
	amountCents: number;
	date: string;
	createdAt: string;
};

/** Source metadata and explicit charges only. Log contents never enter this database. */
export class TelemetryStore {
	private readonly db: Database;
	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db
			.exec(`CREATE TABLE IF NOT EXISTS operate_log_sources (workspace TEXT NOT NULL, project TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY(workspace, project, name));
		CREATE TABLE IF NOT EXISTS operate_hosting_charges (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, project TEXT NOT NULL, data TEXT NOT NULL);
		CREATE INDEX IF NOT EXISTS operate_hosting_scope ON operate_hosting_charges(workspace, project);`);
	}
	sources(workspace: string, project: string): LogSource[] {
		return this.db
			.query<LogSource, [string, string]>(
				"SELECT name, path FROM operate_log_sources WHERE workspace = ? AND project = ? ORDER BY name",
			)
			.all(workspace, project);
	}
	register(workspace: string, project: string, name: string, path: string): void {
		this.db.transaction(() => {
			const sources = this.sources(workspace, project);
			if (sources.length >= 20 && !sources.some((item) => item.name === name))
				throw new OperateError("The project already has 20 log sources", 409);
			this.db
				.query(
					"INSERT INTO operate_log_sources VALUES (?, ?, ?, ?) ON CONFLICT(workspace, project, name) DO UPDATE SET path = excluded.path",
				)
				.run(workspace, project, name, path);
		})();
	}
	removeSource(workspace: string, project: string, name: string): boolean {
		return (
			this.db
				.query("DELETE FROM operate_log_sources WHERE workspace = ? AND project = ? AND name = ?")
				.run(workspace, project, name).changes > 0
		);
	}
	charges(workspace: string, project: string): HostingCharge[] {
		return this.db
			.query<{ data: string }, [string, string]>(
				"SELECT data FROM operate_hosting_charges WHERE workspace = ? AND project = ? ORDER BY json_extract(data, '$.date') DESC, rowid DESC",
			)
			.all(workspace, project)
			.map((row) => JSON.parse(row.data) as HostingCharge);
	}
	addCharge(workspace: string, project: string, charge: HostingCharge): void {
		this.db.transaction(() => {
			const charges = this.charges(workspace, project);
			if (charges.length >= 500)
				throw new OperateError("The project already has 500 hosting charges", 409);
			if (
				!Number.isSafeInteger(
					charges.reduce((sum, item) => sum + item.amountCents, charge.amountCents),
				)
			)
				throw new OperateError("Hosting charges exceed the supported total", 409);
			this.db
				.query("INSERT INTO operate_hosting_charges VALUES (?, ?, ?, ?)")
				.run(charge.id, workspace, project, JSON.stringify(charge));
		})();
	}
	removeCharge(workspace: string, project: string, id: string): boolean {
		return (
			this.db
				.query("DELETE FROM operate_hosting_charges WHERE workspace = ? AND project = ? AND id = ?")
				.run(workspace, project, id).changes > 0
		);
	}
	close(): void {
		this.db.close();
	}
}
