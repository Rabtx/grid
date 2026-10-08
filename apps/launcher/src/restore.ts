import { join, resolve } from "node:path";

import { readLaunchConfig } from "./config";
import { loadSecrets } from "./secrets";

/**
 * `bun run grid:restore [machine]`: another machine's threads, back on this one from Grid's
 * database. Lists the machines without an argument; see `apps/runner/src/restore.ts`. Grid must be
 * running, since the threads come through its API.
 */
const root = resolve(import.meta.dir, "../../..");
const config = readLaunchConfig(process.env, root);
const secrets = loadSecrets(config.dataDir);
const child = Bun.spawn(["bun", "src/restore.ts", ...process.argv.slice(2)], {
	cwd: join(root, "apps/runner"),
	env: {
		...process.env,
		GRID_API_URL: `http://127.0.0.1:${config.apiPort}`,
		GRID_RUNNER_KEY: secrets.runnerKey,
		RUNNER_CHAT_DB: join(config.dataDir, "chat.db"),
		RUNNER_PROJECTS_DIR: config.projectsDir,
	},
	stdout: "inherit",
	stderr: "inherit",
});
process.exit(await child.exited);
