import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

import { type Database, schema } from "@grid/db";
import { eq, inArray, sql } from "drizzle-orm";

import { requireRole, workspaceAccess, type WorkspaceScope } from "./access";

/**
 * Where a workspace's data lives (Settings → General → Data): the database's health and size, its
 * backups, and an export of the workspace. Everything stays on the machine running Grid.
 */

/** How many backups are kept; older ones are removed as new ones are made. */
const KEEP_BACKUPS = 7;
/** Nightly backups run after this hour, local time. */
const BACKUP_HOUR = 3;
const BACKUP_FILE = /^grid-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.dump$/;

export type BackupDeps = { db: Database; databaseUrl: string; backupsDir: string };

type Backup = { file: string; at: string; sizeBytes: number };

async function backups(dir: string): Promise<Backup[]> {
	const names = await readdir(dir).catch(() => [] as string[]);
	const found = await Promise.all(
		names
			.filter((name) => BACKUP_FILE.test(name))
			.map(async (name) => {
				const info = await stat(join(dir, name));
				return { file: name, at: info.mtime.toISOString(), sizeBytes: info.size };
			}),
	);
	return found.sort((a, b) => b.at.localeCompare(a.at));
}

/** Whether `pg_dump` is on this machine, for the Backups row to say so when it is not. */
function canBackUp(): boolean {
	return Bun.which("pg_dump") !== null;
}

/** The database's version, size and host, and the backups there are. */
export async function dataStatus(deps: BackupDeps, scope: WorkspaceScope) {
	const access = await workspaceAccess(deps.db, scope);
	requireRole(access, "admin");
	let database: { version: string; sizeBytes: number; healthy: boolean };
	try {
		// Bun's SQL client hands rows back as an array.
		const rows = (await deps.db.execute(
			sql`select current_setting('server_version') as version, pg_database_size(current_database())::text as size`,
		)) as unknown as { version: string; size: string }[];
		const row = rows[0];
		database = {
			version: `Postgres ${String(row?.version ?? "").split(" ")[0]}`,
			sizeBytes: Number(row?.size ?? 0),
			healthy: true,
		};
	} catch {
		database = { version: "Postgres", sizeBytes: 0, healthy: false };
	}
	const list = await backups(deps.backupsDir);
	return {
		host: hostname(),
		database,
		backups: {
			available: canBackUp(),
			hour: BACKUP_HOUR,
			last: list[0] ?? null,
			count: list.length,
		},
	};
}

/**
 * Back the whole database up with `pg_dump` (custom format, restorable with `pg_restore`), keep
 * the newest seven, and say what was written.
 */
export async function backUp(deps: Omit<BackupDeps, "db">): Promise<Backup> {
	if (!canBackUp()) throw new Error("pg_dump is not installed on this machine");
	await mkdir(deps.backupsDir, { recursive: true });
	const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
	const file = `grid-${stamp}.dump`;
	const path = join(deps.backupsDir, file);
	const run = Bun.spawn(["pg_dump", "--format=custom", `--file=${path}`, deps.databaseUrl], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([run.exited, new Response(run.stderr).text()]);
	if (code !== 0) {
		await rm(path, { force: true });
		throw new Error(`pg_dump failed: ${stderr.trim().split("\n").pop() ?? `exit ${code}`}`);
	}
	const list = await backups(deps.backupsDir);
	await Promise.all(
		list.slice(KEEP_BACKUPS).map((old) => rm(join(deps.backupsDir, old.file), { force: true })),
	);
	return (
		list.find((backup) => backup.file === file) ?? {
			file,
			at: new Date().toISOString(),
			sizeBytes: 0,
		}
	);
}

/** A backup made from Settings: admins of any workspace on this Grid may ask for one. */
export async function backUpNow(deps: BackupDeps, scope: WorkspaceScope): Promise<Backup> {
	const access = await workspaceAccess(deps.db, scope);
	requireRole(access, "admin");
	return backUp(deps);
}

/**
 * The nightly backup: after three in the morning, when the newest one is older than twenty hours.
 * Checked every few minutes by the API; quiet when there is no `pg_dump`.
 */
export function scheduleBackups(deps: Omit<BackupDeps, "db">, every = 10 * 60_000): () => void {
	let running = false;
	const tick = async () => {
		if (running || !canBackUp() || new Date().getHours() < BACKUP_HOUR) return;
		const last = (await backups(deps.backupsDir))[0];
		if (last && Date.now() - Date.parse(last.at) < 20 * 3_600_000) return;
		running = true;
		try {
			await backUp(deps);
		} catch (cause) {
			console.error("[api] nightly backup failed", cause instanceof Error ? cause.message : cause);
		} finally {
			running = false;
		}
	};
	const timer = setInterval(() => void tick(), every);
	return () => clearInterval(timer);
}

/** The workspace's projects, tasks and notes (with their Markdown), as one JSON document. */
export async function exportWorkspace(db: Database, scope: WorkspaceScope) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "admin");
	const projects = await db
		.select()
		.from(schema.projects)
		.where(eq(schema.projects.workspaceId, access.workspace.id));
	const ids = projects.map((project) => project.id);
	const [tasks, notes] = ids.length
		? await Promise.all([
				db.select().from(schema.tasks).where(inArray(schema.tasks.projectId, ids)),
				db.select().from(schema.notes).where(inArray(schema.notes.projectId, ids)),
			])
		: [[], []];
	return {
		format: "grid-workspace-export",
		version: 1,
		exportedAt: new Date().toISOString(),
		workspace: {
			slug: access.workspace.slug,
			name: access.workspace.name,
			settings: access.workspace.settings,
		},
		projects,
		tasks,
		notes,
	};
}
