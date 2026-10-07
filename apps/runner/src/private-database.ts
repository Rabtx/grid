import { Database } from "bun:sqlite";
import { chmodSync, closeSync, existsSync, openSync } from "node:fs";

/**
 * A SQLite database only its owner can read. The runner's databases hold transcripts, tool output
 * and connector settings; opened with the process's default mode they came out world-readable
 * (0644). Not done with a process-wide umask: terminals and agents inherit the runner's, and the
 * files people make in them must keep their usual permissions.
 */
export function openPrivateDatabase(path: string): Database {
	const inMemory = path === ":memory:" || path === "";
	if (!inMemory && !existsSync(path)) closeSync(openSync(path, "a", 0o600));
	const db = new Database(path, { create: true });
	if (!inMemory) keepPrivate(path);
	return db;
}

/** Tightens the database and the journal files SQLite keeps beside it, created already or later. */
export function keepPrivate(path: string): void {
	for (const file of [path, `${path}-wal`, `${path}-shm`, `${path}-journal`]) {
		try {
			chmodSync(file, 0o600);
		} catch (cause) {
			// Not there (yet): SQLite creates these as it needs them, with the main file's mode.
			if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
		}
	}
}
