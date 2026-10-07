import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openPrivateDatabase } from "../private-database";

/** What a person set for one environment: its address, and commands for hosts Grid can't drive. */
export type EnvironmentSettings = {
	/** The site to check, when the host does not post it with its deployments. */
	url?: string;
	/** Run to promote (the commit is in `$GRID_SHA`); replaces what Grid worked out. */
	promote?: string;
	/** Run to roll back to an earlier deploy (its commit in `$GRID_SHA`). */
	rollback?: string;
};

export type ProjectShipSettings = Record<string, EnvironmentSettings>;

/** One check of a site: did it answer, and how fast. */
export type Probe = { at: string; ok: boolean; ms: number };

/**
 * Fifteen minutes of watching after a promotion: if the new deploy fails or the site stops
 * answering, Grid rolls back to `previous` and tells the person who promoted.
 */
export type Watch = {
	workspace: string;
	project: string;
	environment: string;
	/** Who promoted: they hear what happened. */
	userId: string;
	/** The deploy to go back to. */
	previous: { id: number; sha: string; version: string };
	/** The commit that went out. */
	sha: string;
	version: string;
	startedAt: string;
	/** Fifteen minutes after the new deploy went live; null until it has. */
	until: string | null;
	/** Checks of the site since it went live that did not answer, in a row. */
	misses: number;
	outcome: "watching" | "clean" | "rolled-back" | "failed";
	detail: string | null;
};

const PROBES_KEPT_DAYS = 30;

/** Ship's own records, beside the chat log: environment settings, site checks, watches. */
export class ShipStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS ship_settings (
				workspace TEXT NOT NULL,
				project TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (workspace, project)
			);
			CREATE TABLE IF NOT EXISTS ship_sites (
				url TEXT PRIMARY KEY,
				seen_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS ship_probes (
				url TEXT NOT NULL,
				at TEXT NOT NULL,
				ok INTEGER NOT NULL,
				ms INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS ship_probes_url_at ON ship_probes (url, at);
			CREATE TABLE IF NOT EXISTS ship_watches (
				workspace TEXT NOT NULL,
				project TEXT NOT NULL,
				environment TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (workspace, project, environment)
			);
		`);
	}

	settings(workspace: string, project: string): ProjectShipSettings {
		const row = this.db
			.query<{ data: string }, [string, string]>(
				"SELECT data FROM ship_settings WHERE workspace = ? AND project = ?",
			)
			.get(workspace, project);
		return row ? (JSON.parse(row.data) as ProjectShipSettings) : {};
	}

	/** Saved service addresses, independent of whether a browser is open. */
	configuredSites(): { workspace: string; project: string; name: string; url: string }[] {
		return this.db
			.query<{ workspace: string; project: string; data: string }, []>(
				"SELECT workspace, project, data FROM ship_settings",
			)
			.all()
			.flatMap((row) =>
				Object.entries(JSON.parse(row.data) as ProjectShipSettings).flatMap(([name, settings]) =>
					settings.url
						? [{ workspace: row.workspace, project: row.project, name, url: settings.url }]
						: [],
				),
			);
	}

	setEnvironment(
		workspace: string,
		project: string,
		environment: string,
		settings: EnvironmentSettings,
	): void {
		const all = this.settings(workspace, project);
		const kept = Object.fromEntries(
			Object.entries(settings).filter(([, value]) => typeof value === "string" && value.trim()),
		) as EnvironmentSettings;
		if (Object.keys(kept).length) all[environment] = kept;
		else delete all[environment];
		this.db
			.query(
				`INSERT INTO ship_settings (workspace, project, data) VALUES (?, ?, ?)
				 ON CONFLICT (workspace, project) DO UPDATE SET data = excluded.data`,
			)
			.run(workspace, project, JSON.stringify(all));
	}

	/** A site Ship has shown: checked every few minutes while anyone looks at it within a day. */
	rememberSite(url: string, at = new Date()): void {
		this.db
			.query(
				`INSERT INTO ship_sites (url, seen_at) VALUES (?, ?)
				 ON CONFLICT (url) DO UPDATE SET seen_at = excluded.seen_at`,
			)
			.run(url, at.toISOString());
	}

	/** Sites seen since then. */
	sites(since: Date): string[] {
		return this.db
			.query<{ url: string }, [string]>("SELECT url FROM ship_sites WHERE seen_at >= ?")
			.all(since.toISOString())
			.map((row) => row.url);
	}

	recordProbe(url: string, probe: Probe): void {
		this.db
			.query("INSERT INTO ship_probes (url, at, ok, ms) VALUES (?, ?, ?, ?)")
			.run(url, probe.at, probe.ok ? 1 : 0, Math.round(probe.ms));
		const cutoff = new Date(Date.now() - PROBES_KEPT_DAYS * 86_400_000).toISOString();
		this.db.query("DELETE FROM ship_probes WHERE url = ? AND at < ?").run(url, cutoff);
	}

	/** A site's checks since then, oldest first. */
	probes(url: string, since: Date): Probe[] {
		return this.db
			.query<{ at: string; ok: number; ms: number }, [string, string]>(
				"SELECT at, ok, ms FROM ship_probes WHERE url = ? AND at >= ? ORDER BY at",
			)
			.all(url, since.toISOString())
			.map((row) => ({ at: row.at, ok: row.ok === 1, ms: row.ms }));
	}

	watch(workspace: string, project: string, environment: string): Watch | null {
		const row = this.db
			.query<{ data: string }, [string, string, string]>(
				"SELECT data FROM ship_watches WHERE workspace = ? AND project = ? AND environment = ?",
			)
			.get(workspace, project, environment);
		return row ? (JSON.parse(row.data) as Watch) : null;
	}

	saveWatch(watch: Watch): void {
		this.db
			.query(
				`INSERT INTO ship_watches (workspace, project, environment, data) VALUES (?, ?, ?, ?)
				 ON CONFLICT (workspace, project, environment) DO UPDATE SET data = excluded.data`,
			)
			.run(watch.workspace, watch.project, watch.environment, JSON.stringify(watch));
	}

	/** Watches still running. */
	watching(): Watch[] {
		return this.db
			.query<{ data: string }, []>("SELECT data FROM ship_watches")
			.all()
			.map((row) => JSON.parse(row.data) as Watch)
			.filter((watch) => watch.outcome === "watching");
	}
}

/** p95 of the checks that answered, in milliseconds, or null without any. */
export function p95(probes: readonly Probe[]): number | null {
	const times = probes
		.filter((probe) => probe.ok)
		.map((probe) => probe.ms)
		.sort((a, b) => a - b);
	if (!times.length) return null;
	return times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)] ?? null;
}

/** The percent of checks that answered, or null without any. */
export function uptime(probes: readonly Probe[]): number | null {
	if (!probes.length) return null;
	return (probes.filter((probe) => probe.ok).length / probes.length) * 100;
}
