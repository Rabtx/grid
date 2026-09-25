import { providerRegistry } from "./agents/registry";
import { createTokenVerifier } from "./auth";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { attentionMessage, PushNotifier } from "./push/notifier";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

const config = readConfig();
const store = new TerminalStore(config, spawnPty);
const chat = new ChatHub(new ChatStore(config.chatDb), providerRegistry(), config.projectsDir);
// A turn that ends, or an approval that waits, while no device is looking becomes a notification.
const push = new PushNotifier(config.chatDb);
chat.onUnwatchedAttention((session, event) => {
	const message = attentionMessage(session, event);
	if (message) void push.notify(session.ownerId, message);
});
const server = startServer(config, store, createTokenVerifier(config.apiUrl), chat, push);

console.log(
	`[runner] terminals on http://${server.hostname}:${server.port} (shell ${config.shell})`,
);

// Shells are children of the runner: end them with it rather than leaving orphans behind.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		store.closeAll();
		chat.closeAll();
		void server.stop(true);
		process.exit(0);
	});
}
