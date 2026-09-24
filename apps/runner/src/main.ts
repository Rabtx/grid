import { createTokenVerifier } from "./auth";
import { readConfig } from "./config";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

const config = readConfig();
const store = new TerminalStore(config, spawnPty);
const server = startServer(config, store, createTokenVerifier(config.apiUrl));

console.log(
	`[runner] terminals on http://${server.hostname}:${server.port} (shell ${config.shell})`,
);

// Shells are children of the runner: end them with it rather than leaving orphans behind.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		store.closeAll();
		void server.stop(true);
		process.exit(0);
	});
}
