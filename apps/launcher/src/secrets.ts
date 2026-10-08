import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Secrets = { jwtSecret: string; authTokenSecret: string; runnerKey: string };

/**
 * Secrets are generated once per data directory, so sessions survive restarts. One added later
 * (the runner key) is generated into an existing file the first time it is missing.
 */
export function loadSecrets(dataDir: string): Secrets {
	const file = join(dataDir, "secrets.json");
	const saved = existsSync(file)
		? (JSON.parse(readFileSync(file, "utf8")) as Partial<Secrets>)
		: {};
	const secrets: Secrets = {
		jwtSecret: saved.jwtSecret ?? randomBytes(32).toString("hex"),
		authTokenSecret: saved.authTokenSecret ?? randomBytes(32).toString("hex"),
		// What this Grid's runner sends its threads to the API with.
		runnerKey: saved.runnerKey ?? randomBytes(32).toString("hex"),
	};
	if (Object.keys(saved).length !== Object.keys(secrets).length)
		writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
	return secrets;
}
