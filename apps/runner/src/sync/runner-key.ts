import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The runner key this machine's API and runner share when neither was given `GRID_RUNNER_KEY`: a
 * checkout started with `bun run start`, where nothing hands them one (the launcher and the
 * one-line install do). Kept in `$XDG_DATA_HOME/grid/runner.key`, mode 600; whichever starts first
 * makes it, the other reads it. The API has the same function (`apps/api/src/config/runner-key.ts`).
 */
export function machineRunnerKey(env: Record<string, string | undefined> = process.env): string {
	const dir = join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "grid");
	const file = join(dir, "runner.key");
	const read = (): string | null => {
		try {
			// A file the other process has made but not yet written reads empty: wait for it.
			for (let i = 0; i < 20; i++) {
				const key = readFileSync(file, "utf8").trim();
				if (key) return key;
				Bun.sleepSync(25);
			}
			throw new Error(`${file} is empty`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	};
	const existing = read();
	if (existing) return existing;
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const key = randomBytes(32).toString("hex");
	try {
		writeFileSync(file, key, { flag: "wx", mode: 0o600 });
		return key;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		const theirs = read();
		if (!theirs) throw error;
		return theirs;
	}
}
