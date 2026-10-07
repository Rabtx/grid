import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { isIP } from "node:net";
import { dirname } from "node:path";

import { environmentToken } from "./pairing";
import { openPrivateDatabase } from "../private-database";

/**
 * The home side of pairing: the other machines (a Codespace, a VPS, another Grid) whose runners
 * this Grid drives. Each keeps the address and the secret its runner issued at pairing; people
 * only ever see the address and the name.
 */

export type Environment = {
	id: string;
	label: string;
	url: string;
	/** The GitHub Codespace it is, when Grid connected it from Environments → Codespaces. */
	codespace: string | null;
	createdAt: string;
};

type Row = {
	id: string;
	workspace_id: string;
	label: string;
	url: string;
	peer_id: string;
	secret: string;
	codespace: string | null;
	created_at: string;
};

export class EnvironmentError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "EnvironmentError";
	}
}

/** Tailscale hands out addresses in 100.64.0.0/10 (CGNAT); MagicDNS names end in `.ts.net`. */
function isTailnetAddress(hostname: string): boolean {
	if (hostname.endsWith(".ts.net")) return true;
	if (isIP(hostname) !== 4) return false;
	const [a, b] = hostname.split(".").map(Number);
	return a === 100 && b >= 64 && b <= 127;
}

/**
 * Where an environment may live. Only a tailnet address by default: WireGuard encrypts and
 * authenticates the whole path, and the runner never becomes a way to reach arbitrary hosts.
 * Anything else (a VPS's own domain, say) has to be allowed in `RUNNER_ENVIRONMENT_HOSTS`, and
 * then only over https.
 */
export function checkEnvironmentUrl(raw: string, allowedHosts: string[]): URL {
	let url: URL;
	try {
		url = new URL(raw.includes("://") ? raw : `http://${raw}`);
	} catch {
		throw new EnvironmentError("That is not an address", 400);
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new EnvironmentError("Give just the address and port", 400);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new EnvironmentError("Use an http or https address", 400);
	}
	const host = url.hostname.toLowerCase();
	if (isTailnetAddress(host)) return url;
	if (allowedHosts.includes(host) && url.protocol === "https:") return url;
	throw new EnvironmentError(
		"Only tailnet addresses (….ts.net or 100.x) can be environments here. Allow other hosts with RUNNER_ENVIRONMENT_HOSTS, over https.",
		400,
	);
}

export class EnvironmentStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS environments (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				label TEXT NOT NULL,
				url TEXT NOT NULL,
				peer_id TEXT NOT NULL,
				secret TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS project_environments (
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				environment_id TEXT NOT NULL,
				PRIMARY KEY (workspace_id, project)
			);
		`);
		// Added after the first release: which Codespace an environment is.
		if (!hasColumn(this.db, "environments", "codespace")) {
			this.db.exec("ALTER TABLE environments ADD COLUMN codespace TEXT");
		}
		// Environments were each person's before workspaces: their rows keep the person's id as the
		// workspace until `adopt` moves them into that person's default workspace.
		for (const table of ["environments", "project_environments"]) {
			if (hasColumn(this.db, table, "owner_id")) {
				this.db.exec(`ALTER TABLE ${table} RENAME COLUMN owner_id TO workspace_id`);
			}
		}
	}

	/** Moves a person's environments from before workspaces into their default workspace. */
	adopt(userId: string, workspace: string): void {
		if (userId === workspace) return;
		this.db.transaction(() => {
			this.db
				.query("UPDATE environments SET workspace_id = ? WHERE workspace_id = ?")
				.run(workspace, userId);
			this.db
				.query("UPDATE OR IGNORE project_environments SET workspace_id = ? WHERE workspace_id = ?")
				.run(workspace, userId);
			this.db.query("DELETE FROM project_environments WHERE workspace_id = ?").run(userId);
		})();
	}

	/**
	 * Where each of the workspace's projects runs, by project slug: the environment holding its
	 * folder. A project not listed runs on this machine.
	 */
	placements(workspace: string): Record<string, string> {
		const rows = this.db
			.query<{ project: string; environment_id: string }, [string]>(
				"SELECT project, environment_id FROM project_environments WHERE workspace_id = ?",
			)
			.all(workspace);
		return Object.fromEntries(rows.map((row) => [row.project, row.environment_id]));
	}

	/** Run a project on one of the workspace's environments, or (null) back on this machine. */
	place(workspace: string, project: string, environmentId: string | null): void {
		if (environmentId === null) {
			this.db
				.query("DELETE FROM project_environments WHERE workspace_id = ? AND project = ?")
				.run(workspace, project);
			return;
		}
		if (!this.target(workspace, environmentId)) {
			throw new EnvironmentError("That environment does not exist", 404);
		}
		this.db
			.query(
				`INSERT INTO project_environments (workspace_id, project, environment_id) VALUES (?, ?, ?)
				ON CONFLICT (workspace_id, project) DO UPDATE SET environment_id = excluded.environment_id`,
			)
			.run(workspace, project, environmentId);
	}

	list(workspace: string): Environment[] {
		return this.db
			.query<Row, [string]>("SELECT * FROM environments WHERE workspace_id = ? ORDER BY created_at")
			.all(workspace)
			.map(toEnvironment);
	}

	add(
		workspace: string,
		input: { label: string; url: string; peerId: string; secret: string; codespace?: string },
	): Environment {
		const row: Row = {
			id: crypto.randomUUID(),
			workspace_id: workspace,
			label: input.label.trim().slice(0, 80) || new URL(input.url).hostname,
			url: input.url.replace(/\/$/, ""),
			peer_id: input.peerId,
			secret: input.secret,
			codespace: input.codespace ?? null,
			created_at: new Date().toISOString(),
		};
		this.db
			.query(
				`INSERT INTO environments (id, workspace_id, label, url, peer_id, secret, codespace, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				row.id,
				row.workspace_id,
				row.label,
				row.url,
				row.peer_id,
				row.secret,
				row.codespace,
				row.created_at,
			);
		return toEnvironment(row);
	}

	/** Where to reach an environment and the token to present, if it is the workspace's. */
	target(workspace: string, id: string): { url: string; token: string } | null {
		const row = this.db
			.query<Row, [string, string]>("SELECT * FROM environments WHERE id = ? AND workspace_id = ?")
			.get(id, workspace);
		return row ? { url: row.url, token: environmentToken(row.peer_id, row.secret) } : null;
	}

	/** Forget an environment; its projects fall back to this machine. */
	remove(workspace: string, id: string): boolean {
		this.db
			.query("DELETE FROM project_environments WHERE workspace_id = ? AND environment_id = ?")
			.run(workspace, id);
		return (
			this.db.query("DELETE FROM environments WHERE id = ? AND workspace_id = ?").run(id, workspace)
				.changes > 0
		);
	}
}

function toEnvironment(row: Row): Environment {
	return {
		id: row.id,
		label: row.label,
		url: row.url,
		codespace: row.codespace ?? null,
		createdAt: row.created_at,
	};
}

function hasColumn(db: Database, table: string, column: string): boolean {
	return db
		.query<{ name: string }, []>(`PRAGMA table_info(${table})`)
		.all()
		.some((row) => row.name === column);
}
