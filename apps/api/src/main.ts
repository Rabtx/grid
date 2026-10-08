import { createDatabase } from "@grid/db";

import { createApp } from "./app";
import { createConfig } from "./config/config";
import { machineRunnerKey } from "./config/runner-key";
import { resendSender } from "./modules/email/email";
import { scheduleBackups } from "./modules/workspaces/data";
import { sessionLookup } from "./sessions";

const base = createConfig();
// Without GRID_RUNNER_KEY, the key this machine's runner also reads, so a checkout's threads sync.
const config = { ...base, runnerKey: base.runnerKey ?? machineRunnerKey() };
const database = createDatabase(config.databaseUrl, {
	max: config.databasePoolMax,
	ssl: config.databaseSsl,
	server: true,
});
await database.ready;
const app = createApp({
	config,
	db: database.db,
	sessions: sessionLookup(database.db),
	send: resendSender({ apiKey: config.resendApiKey, from: config.authEmailFrom }),
});

// A nightly database backup into Grid's data folder (Settings → General → Backups).
const stopBackups = scheduleBackups({
	databaseUrl: config.databaseUrl,
	backupsDir: config.backupsDir,
});

// Bun closes a request after 10 seconds by default; an upload, an export or a slow provider can
// take longer, and would otherwise fail with a reset connection instead of an answer.
const server = Bun.serve({
	port: config.port,
	hostname: "0.0.0.0",
	idleTimeout: 120,
	fetch: app.fetch,
});
console.log(`grid api on :${server.port}`);

const stop = async () => {
	stopBackups();
	await server.stop();
	await database.close();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
