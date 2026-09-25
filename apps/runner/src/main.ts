import { providerRegistry } from "./agents/registry";
import { createTokenVerifier } from "./auth";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { isEnvironmentToken, PairingStore } from "./environments/pairing";
import { checkEnvironmentUrl, EnvironmentStore } from "./environments/registry";
import { type EnvironmentDeps, pairEnvironment } from "./environments/routes";
import { CodespacesLink } from "./github/codespaces";
import { createGh } from "./github/gh";
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

// Another Grid may drive this one as an environment, with a token only it holds; everyone else
// signs in through this Grid's own API as usual.
const pairing = config.pairing ? new PairingStore(config.chatDb) : undefined;
const signIn = createTokenVerifier(config.apiUrl);
const verify = async (token: string) =>
	pairing && isEnvironmentToken(token) ? pairing.verify(token) : signIn(token);

const environments: EnvironmentDeps = {
	store: new EnvironmentStore(config.chatDb),
	checkUrl: (raw) => checkEnvironmentUrl(raw, config.environmentHosts),
};
// Codespaces connect over the tailnet like any environment; GitHub only starts them and hands
// Grid their pairing code.
const github = new CodespacesLink(config.chatDb, createGh(), {
	environments: (ownerId) => environments.store.list(ownerId),
	pair: (ownerId, input) => pairEnvironment(environments, ownerId, input),
});

const server = startServer(config, store, verify, chat, { push, pairing, environments, github });

console.log(
	`[runner] terminals on http://${server.hostname}:${server.port} (shell ${config.shell})`,
);
if (pairing && pairing.peers().length === 0) {
	console.log(
		`[runner] pairing is on. Pair from your home Grid with code ${pairing.newCode()} (valid 10 minutes; bun --cwd=apps/runner run pair makes another).`,
	);
}

// Shells are children of the runner: end them with it rather than leaving orphans behind.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		store.closeAll();
		chat.closeAll();
		void server.stop(true);
		process.exit(0);
	});
}
