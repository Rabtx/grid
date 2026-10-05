import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { InboxDraft } from "../inbox/store";
import type { Probe } from "../ship/store";

export const INTERVAL_MS = 60_000;
export const STALE_MS = 3 * INTERVAL_MS;
const DAY_MS = 86_400_000;

export type Monitor = {
	id: string;
	generation: string;
	workspace: string;
	project: string;
	name: string;
	url: string;
	enabled: boolean;
	source: "ship" | "operate";
	checkedAt: string | null;
	ok: boolean | null;
	responseMs: number | null;
	failures: number;
	successes: number;
	incidentId: string | null;
};
export type Incident = {
	id: string;
	serviceId: string;
	serviceName: string;
	url: string;
	status: "open" | "resolved";
	openedAt: string;
	resolvedAt: string | null;
	monitoring: boolean;
};
type IncidentRecord = Incident & { workspace: string; project: string };

/** Separate workspace-scoped records beside Ship and chat. No response bodies are persisted. */
export class OperateStore {
	private readonly db: Database;
	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS operate_monitors (id TEXT PRIMARY KEY, workspace TEXT NOT NULL,
			 project TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(workspace, project, name));
			CREATE TABLE IF NOT EXISTS operate_probes (id TEXT NOT NULL, at TEXT NOT NULL, ok INTEGER NOT NULL,
			 ms INTEGER NOT NULL, PRIMARY KEY(id, at));
			CREATE TABLE IF NOT EXISTS operate_incidents (id TEXT PRIMARY KEY, workspace TEXT NOT NULL,
			 project TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS operate_incidents_scope ON operate_incidents(workspace, project, at);
			CREATE TABLE IF NOT EXISTS operate_outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL);
		`);
	}
	monitors(workspace?: string, project?: string): Monitor[] {
		const rows =
			workspace !== undefined && project !== undefined
				? this.db
						.query<{ data: string }, [string, string]>(
							"SELECT data FROM operate_monitors WHERE workspace = ? AND project = ? ORDER BY name",
						)
						.all(workspace, project)
				: this.db.query<{ data: string }, []>("SELECT data FROM operate_monitors").all();
		return rows.map((row) => JSON.parse(row.data) as Monitor);
	}
	private save(monitor: Monitor): void {
		this.db
			.query(`INSERT INTO operate_monitors (id, workspace, project, name, data) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
			.run(monitor.id, monitor.workspace, monitor.project, monitor.name, JSON.stringify(monitor));
	}
	register(workspace: string, project: string, name: string, url: string, inherited = false): void {
		const old = this.monitors(workspace, project).find((item) => item.name === name);
		if (inherited && old && (!old.enabled || old.source !== "ship")) return;
		if (old?.enabled && old.url === url) {
			// Explicit registration claims the target without losing its health history.
			if (!inherited && old.source === "ship") this.save({ ...old, source: "operate" });
			return;
		}
		const id = old?.id ?? crypto.randomUUID();
		this.db.transaction(() => {
			if (old?.incidentId) this.stopIncident(old.incidentId);
			this.db.query("DELETE FROM operate_probes WHERE id = ?").run(id);
			this.save({
				id,
				generation: crypto.randomUUID(),
				workspace,
				project,
				name,
				url,
				enabled: true,
				source: inherited ? "ship" : "operate",
				checkedAt: null,
				ok: null,
				responseMs: null,
				failures: 0,
				successes: 0,
				incidentId: null,
			});
		})();
	}
	remove(workspace: string, project: string, name: string): boolean {
		const old = this.monitors(workspace, project).find(
			(item) => item.name === name && item.enabled,
		);
		if (!old) return false;
		this.db.transaction(() => {
			if (old.incidentId) this.stopIncident(old.incidentId);
			this.save({ ...old, enabled: false, incidentId: null });
			this.db.query("DELETE FROM operate_probes WHERE id = ?").run(old.id);
		})();
		return true;
	}
	/** Reclaim stopped names while retaining tombstones for every currently configured Ship site. */
	trimStopped(configured: ReadonlySet<string>): void {
		const stopped = this.db
			.query<{ id: string; data: string }, []>(
				"SELECT id, data FROM operate_monitors WHERE json_extract(data, '$.enabled') = 0 ORDER BY rowid DESC",
			)
			.all();
		const candidates = stopped.filter((row) => {
			const monitor = JSON.parse(row.data) as Monitor;
			return !configured.has(JSON.stringify([monitor.workspace, monitor.project, monitor.name]));
		});
		const remove = this.db.query("DELETE FROM operate_monitors WHERE id = ?");
		this.db.transaction(() => {
			for (const row of candidates.slice(200)) remove.run(row.id);
		})();
	}
	private stopIncident(id: string): void {
		const row = this.db
			.query<{ data: string }, [string]>("SELECT data FROM operate_incidents WHERE id = ?")
			.get(id);
		if (row) this.saveIncident({ ...(JSON.parse(row.data) as IncidentRecord), monitoring: false });
	}
	private saveIncident(incident: IncidentRecord): void {
		this.db
			.query(`INSERT INTO operate_incidents (id, workspace, project, at, data) VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
			.run(
				incident.id,
				incident.workspace,
				incident.project,
				incident.openedAt,
				JSON.stringify(incident),
			);
	}
	private event(
		incident: IncidentRecord,
		kind: "incident_open" | "incident_resolved",
		at: string,
	): void {
		const draft: InboxDraft = {
			id: `operate:${incident.id}:${kind}`,
			workspaceId: incident.workspace,
			project: incident.project,
			kind,
			title: `${incident.serviceName} ${kind === "incident_open" ? "is down" : "recovered"}`,
			body:
				kind === "incident_open"
					? "Three consecutive health checks failed."
					: "Two consecutive health checks succeeded.",
			url: `/operate/${encodeURIComponent(incident.project)}?incident=${incident.id}`,
			createdAt: at,
		};
		this.db
			.query("INSERT OR IGNORE INTO operate_outbox (id, data) VALUES (?, ?)")
			.run(draft.id, JSON.stringify(draft));
	}
	/** Atomically update the debounce state, timeline, and durable notification outbox. */
	record(expected: Monitor, probe: Probe): boolean {
		const current = this.monitors(expected.workspace, expected.project).find(
			(item) => item.id === expected.id,
		);
		if (
			!current?.enabled ||
			current.generation !== expected.generation ||
			current.url !== expected.url ||
			current.checkedAt !== expected.checkedAt
		)
			return false;
		if (current.checkedAt && Date.parse(probe.at) <= Date.parse(current.checkedAt)) return false;
		this.db.transaction(() => {
			const gap =
				current.checkedAt === null ||
				Date.parse(probe.at) - Date.parse(current.checkedAt) > STALE_MS;
			const failures = probe.ok ? 0 : (gap ? 0 : current.failures) + 1;
			const successes = probe.ok ? (gap ? 0 : current.successes) + 1 : 0;
			let incidentId = current.incidentId;
			if (!incidentId && failures >= 3) {
				incidentId = crypto.randomUUID();
				const incident: IncidentRecord = {
					id: incidentId,
					workspace: current.workspace,
					project: current.project,
					serviceId: current.id,
					serviceName: current.name,
					url: current.url,
					status: "open",
					openedAt: probe.at,
					resolvedAt: null,
					monitoring: true,
				};
				this.saveIncident(incident);
				this.event(incident, "incident_open", probe.at);
			} else if (incidentId && successes >= 2) {
				const row = this.db
					.query<{ data: string }, [string]>("SELECT data FROM operate_incidents WHERE id = ?")
					.get(incidentId);
				if (row) {
					const incident: IncidentRecord = {
						...(JSON.parse(row.data) as IncidentRecord),
						status: "resolved",
						resolvedAt: probe.at,
					};
					this.saveIncident(incident);
					this.event(incident, "incident_resolved", probe.at);
				}
				incidentId = null;
			}
			this.save({
				...current,
				checkedAt: probe.at,
				ok: probe.ok,
				responseMs: Math.round(probe.ms),
				failures,
				successes,
				incidentId,
			});
			this.db
				.query("INSERT INTO operate_probes (id, at, ok, ms) VALUES (?, ?, ?, ?)")
				.run(current.id, probe.at, probe.ok ? 1 : 0, Math.round(probe.ms));
			const cutoff = new Date(Date.parse(probe.at) - DAY_MS).toISOString();
			this.db.query("DELETE FROM operate_probes WHERE id = ? AND at < ?").run(current.id, cutoff);
			this.db
				.query(`DELETE FROM operate_incidents WHERE workspace = ? AND project = ? AND id NOT IN
			 (SELECT id FROM operate_incidents WHERE workspace = ? AND project = ? ORDER BY at DESC LIMIT 200)
			 AND id NOT IN (SELECT json_extract(data, '$.incidentId') FROM operate_monitors WHERE json_extract(data, '$.incidentId') IS NOT NULL)`)
				.run(current.workspace, current.project, current.workspace, current.project);
		})();
		return true;
	}
	probes(id: string, since: Date): Probe[] {
		return this.db
			.query<{ at: string; ok: number; ms: number }, [string, string]>(
				"SELECT at, ok, ms FROM operate_probes WHERE id = ? AND at >= ? ORDER BY at",
			)
			.all(id, since.toISOString())
			.map((row) => ({ ...row, ok: row.ok === 1 }));
	}
	incidents(workspace: string, project: string): Incident[] {
		return this.db
			.query<{ data: string }, [string, string]>(
				"SELECT data FROM operate_incidents WHERE workspace = ? AND project = ? ORDER BY at DESC LIMIT 200",
			)
			.all(workspace, project)
			.map((row) => {
				const {
					workspace: _workspace,
					project: _project,
					...incident
				} = JSON.parse(row.data) as IncidentRecord;
				return incident;
			});
	}
	outbox(): InboxDraft[] {
		return this.db
			.query<{ data: string }, []>("SELECT data FROM operate_outbox LIMIT 500")
			.all()
			.map((row) => JSON.parse(row.data) as InboxDraft);
	}
	delivered(id: string): void {
		this.db.query("DELETE FROM operate_outbox WHERE id = ?").run(id);
	}
	close(): void {
		this.db.close();
	}
}
