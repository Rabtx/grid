import { providerRegistry } from "./agents/registry";
import { withAgentBins } from "./agents/setup";
import { createTokenVerifier, signedOut, type Verify } from "./auth";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { isEnvironmentToken, PairingStore } from "./environments/pairing";
import { checkEnvironmentUrl, EnvironmentStore } from "./environments/registry";
import { type EnvironmentDeps, pairEnvironment } from "./environments/routes";
import { CodespacesLink } from "./github/codespaces";
import { createGh } from "./github/gh";
import { PullRequests } from "./github/pulls";
import { inboxItem } from "./inbox/attention";
import { GithubInbox } from "./inbox/github";
import { InboxStore } from "./inbox/store";
import { attentionMessage, PushNotifier } from "./push/notifier";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

// Agents installed from Grid land in these folders: found at once, and on terminals' PATH too.
process.env.PATH = withAgentBins(process.env.PATH);

const config = readConfig();
const store = new TerminalStore(config, spawnPty);
const chat = new ChatHub(new ChatStore(config.chatDb), providerRegistry(), config.projectsDir);
// Everything waiting on the people in a workspace, kept in the same database as their chats.
const inbox = new InboxStore(config.chatDb);
// A turn that ends, or an approval that waits, while no device is looking becomes a notification
// and a row on the Inbox: one decision about what deserves attention, two things done with it.
const push = new PushNotifier(config.chatDb);
chat.onUnwatchedAttention((session, event) => {
	const message = attentionMessage(session, event);
	if (message) void push.notify(session.ownerId, message);
	const item = inboxItem(session, event);
	if (item) inbox.keep(item);
});

// Another Grid may drive this one as an environment, with a token only it holds; everyone else
// signs in through this Grid's own API as usual.
const pairing = config.pairing ? new PairingStore(config.chatDb) : undefined;
const environments: EnvironmentDeps = {
	store: new EnvironmentStore(config.chatDb),
	checkUrl: (raw) => checkEnvironmentUrl(raw, config.environmentHosts),
};
// What people kept here before workspaces moves into their default workspace when they use it.
const signIn = createTokenVerifier(config.apiUrl, fetch, (who) => {
	chat.adopt(who);
	environments.store.adopt(who.userId, who.workspace);
});
// A paired Grid acts under the key it paired with (its home workspace), whichever it names.
const verify: Verify = async (token, workspace) => {
	if (!pairing || !isEnvironmentToken(token)) return signIn(token, workspace);
	const key = pairing.verify(token);
	return key ? { who: { userId: key, workspace: key } } : signedOut;
};
// Codespaces connect over the tailnet like any environment; GitHub only starts them and hands
// Grid their pairing code.
const gh = createGh();
const github = new CodespacesLink(config.chatDb, gh, {
	environments: (ownerId) => environments.store.list(ownerId),
	pair: (ownerId, input) => pairEnvironment(environments, ownerId, input),
});

const pulls = new PullRequests(gh, (userId) => github.assertOwner(userId));
const githubInbox = new GithubInbox(inbox, {
	pulls,
	// The same claim the pull request routes make, asked without throwing so one person's GitHub
	// sign-in is not read as a failure on the page.
	isOwner: (userId) => {
		try {
			github.assertOwner(userId);
			return true;
		} catch {
			return false;
		}
	},
	foldersOf: (workspaceId) => chat.projectFolders(workspaceId),
});

const server = startServer(config, store, verify, chat, {
	push,
	pairing,
	environments,
	github,
	pulls,
	inbox: { store: inbox, github: githubInbox, projectsDir: config.projectsDir },
});

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
