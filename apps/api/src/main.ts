import { createDatabase } from "@grid/db";

import { createApp } from "./app";
import { createConfig } from "./config/config";
import { sessionLookup } from "./sessions";

const config = createConfig();
const database = createDatabase(config.databaseUrl, {
	max: config.databasePoolMax,
	ssl: config.databaseSsl,
});
const app = createApp({ config, sessions: sessionLookup(database.db) });

const server = Bun.serve({ port: config.port, hostname: "0.0.0.0", fetch: app.fetch });
console.log(
	`grid api on :${server.port}${config.legacyApiUrl ? `, forwarding unported routes to ${config.legacyApiUrl}` : ""}`,
);

const stop = async () => {
	await server.stop();
	await database.close();
	process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
