import { SQL } from "bun";
import { drizzle as bunDrizzle } from "drizzle-orm/bun-sql";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";

import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseOptions = {
	/** Pool size; scripts use one connection. */
	max?: number;
	/** Require TLS, for hosted Postgres. */
	ssl?: boolean;
	/** Directory for PGlite storage when DATABASE_URL is unset. Defaults to GRID_DATA_DIR/db or .grid/db. */
	dataDir?: string;
	/**
	 * When using PGlite, whether to start a PostgreSQL wire-protocol socket server for external
	 * processes (e.g. contract tests, psql).
	 */
	server?: boolean | { port?: number; host?: string };
};

export type DatabaseInstance = {
	db: Database;
	close: () => Promise<void>;
	kind: "postgres" | "pglite";
	url?: string;
	ready: Promise<void>;
	migrate: (options?: { migrationsFolder?: string }) => Promise<void>;
};

const defaultMigrationsFolder = resolve(import.meta.dir, "../migrations");

/** Default data directory: $GRID_DATA_DIR/db or <repo>/.grid/db. */
export function resolveDataDir(options?: DatabaseOptions): string {
	if (options?.dataDir) return resolve(options.dataDir);
	if (process.env.PGLITE_DATA_DIR) return resolve(process.env.PGLITE_DATA_DIR);
	if (process.env.GRID_DATA_DIR) return resolve(process.env.GRID_DATA_DIR, "db");
	const root = resolve(import.meta.dir, "../../..");
	return resolve(root, ".grid", "db");
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function getAvailablePort(preferredPort?: number, host = "127.0.0.1"): Promise<number> {
	return new Promise((resolvePort, rejectPort) => {
		if (preferredPort) {
			const srv = net.createServer();
			srv.listen(preferredPort, host, () => {
				srv.close(() => resolvePort(preferredPort));
			});
			srv.on("error", () => {
				const fallback = net.createServer();
				fallback.listen(0, host, () => {
					const free = (fallback.address() as net.AddressInfo).port;
					fallback.close(() => resolvePort(free));
				});
				fallback.on("error", rejectPort);
			});
			return;
		}
		const srv = net.createServer();
		srv.listen(0, host, () => {
			const free = (srv.address() as net.AddressInfo).port;
			srv.close(() => resolvePort(free));
		});
		srv.on("error", rejectPort);
	});
}

async function runMigrate(
	db: Database,
	kind: "postgres" | "pglite",
	migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
	if (kind === "postgres") {
		const { migrate } = await import("drizzle-orm/bun-sql/migrator");
		await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
	} else {
		const { migrate } = await import("drizzle-orm/pglite/migrator");
		await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
	}
}

/**
 * Grid's database client. When DATABASE_URL is provided, connects to PostgreSQL (Neon, hosted, or Docker)
 * using Bun.sql. When DATABASE_URL is unset, opens an embedded PGlite instance under the data directory.
 */
export function createDatabase(
	url?: string | null,
	options: DatabaseOptions = {},
): DatabaseInstance {
	const effectiveUrl = url || undefined;

	// 1. Explicit PostgreSQL URL: connect via Bun.sql
	if (effectiveUrl && /^postgres(?:ql)?:\/\//i.test(effectiveUrl)) {
		const client = new SQL(effectiveUrl, {
			max: options.max ?? 10,
			prepare: false,
			tls: options.ssl ?? false,
		});
		const db = bunDrizzle({ client, schema });
		return {
			db,
			close: async () => {
				await client.close({ timeout: 5 });
			},
			kind: "postgres",
			url: effectiveUrl,
			ready: Promise.resolve(),
			migrate: (opts) => runMigrate(db, "postgres", opts?.migrationsFolder),
		};
	}

	const isMemory = effectiveUrl === ":memory:" || effectiveUrl === "memory://";
	const dataDir = isMemory ? undefined : resolveDataDir(options);
	const urlFile = dataDir ? join(dataDir, "pglite.url") : undefined;

	// 2. Client mode without explicit URL: check if an active PGlite socket server is running
	const serverRequested =
		options.server === true ||
		typeof options.server === "object" ||
		process.env.PGLITE_SERVER === "1";

	if (!serverRequested && urlFile && existsSync(urlFile)) {
		try {
			const info = JSON.parse(readFileSync(urlFile, "utf8")) as { url?: string; pid?: number };
			if (info.url && typeof info.pid === "number" && isProcessAlive(info.pid)) {
				return createDatabase(info.url, options);
			}
			rmSync(urlFile, { force: true });
		} catch {
			rmSync(urlFile, { force: true });
		}
	}

	// 3. Embedded PGlite in-process
	if (dataDir) {
		mkdirSync(dataDir, { recursive: true });
	}
	const client = new PGlite(dataDir);
	const db = pgliteDrizzle({ client, schema });

	let socketServer: PGLiteSocketServer | null = null;
	let assignedUrl: string | undefined;

	const ready = (async () => {
		await client.waitReady;
		if (serverRequested) {
			const host =
				typeof options.server === "object" && options.server.host
					? options.server.host
					: "127.0.0.1";
			const preferredPort =
				typeof options.server === "object" && options.server.port
					? options.server.port
					: Number(process.env.PGLITE_PORT || 5433);
			const port = await getAvailablePort(preferredPort, host);
			socketServer = new PGLiteSocketServer({ db: client, port, host });
			await socketServer.start();
			assignedUrl = `postgresql://postgres:postgres@${host}:${port}/grid`;
			if (urlFile) {
				writeFileSync(urlFile, JSON.stringify({ url: assignedUrl, pid: process.pid }), {
					mode: 0o600,
				});
			}
		}
	})();

	return {
		db,
		close: async () => {
			if (urlFile && existsSync(urlFile)) {
				try {
					const info = JSON.parse(readFileSync(urlFile, "utf8")) as { pid?: number };
					if (info.pid === process.pid) rmSync(urlFile, { force: true });
				} catch {
					rmSync(urlFile, { force: true });
				}
			}
			if (socketServer) {
				await socketServer.stop();
			}
			await client.close();
		},
		kind: "pglite",
		get url() {
			return assignedUrl;
		},
		ready,
		migrate: (opts) => runMigrate(db, "pglite", opts?.migrationsFolder),
	};
}
