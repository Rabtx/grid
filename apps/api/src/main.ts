import { createDatabase } from "@grid/db";

import { createApp } from "./app";
import { createConfig } from "./config/config";
import { resendSender } from "./modules/email/email";
import { scheduleBackups } from "./modules/workspaces/data";
import { sessionLookup } from "./sessions";

const config = createConfig();
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

const server = Bun.serve({ port: config.port, hostname: "0.0.0.0", fetch: app.fetch });
console.log(`grid api on :${server.port}`);

const stop = async () => {
	stopBackups();
	await server.stop();
	await database.close();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
