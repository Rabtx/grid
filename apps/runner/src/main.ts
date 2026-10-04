import { dirname, join } from "node:path";

import { AcpAgentStore } from "./agents/acp-agents";
import { policyOf } from "./agents/policy";
import { addAcpAgent, agentBinary, providerRegistry } from "./agents/registry";
import { agentVersion } from "./agents/versions";
import { KeepAwake, type MachinePrefs, MachinePrefsStore } from "./machine/prefs";
import { Automations } from "./automations/service";
import { AutomationStore } from "./automations/store";
import { withAgentBins } from "./agents/setup";
import {
	createTokenVerifier,
	signedOut,
	type Verify,
	type WorkspaceSettings,
	type Who,
} from "./auth";
import { may } from "./permissions";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { DiagnosticJournal } from "./diagnostics/journal";
import { installProcessDiagnostics } from "./diagnostics/runtime";
import { isEnvironmentToken, PairingStore } from "./environments/pairing";
import { checkEnvironmentUrl, EnvironmentStore } from "./environments/registry";
import { type EnvironmentDeps, pairEnvironment } from "./environments/routes";
import { CodespacesLink } from "./github/codespaces";
import { createGh } from "./github/gh";
import { Connectors } from "./connectors/service";
import { ConnectionStore } from "./connectors/store";
import { Vault } from "./connectors/vault";
import { Pulse } from "./pulse/service";
import { PulseStore } from "./pulse/store";
import { type ApiFindings, Search } from "./search/service";
import { PullRequests } from "./github/pulls";
import { inboxItem } from "./inbox/attention";
import { GithubInbox } from "./inbox/github";
import { InboxStore } from "./inbox/store";
import { RoleStore } from "./roles/store";
import { creditNote, gitEnvironment, signingKey } from "./prefs/git";
import { PrefsStore } from "./prefs/store";
import {
	approvalActions,
	attentionMessage,
	lastReply,
	notifyKind,
	PushNotifier,
} from "./push/notifier";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

// Agents installed from Grid land in these folders: found at once, and on terminals' PATH too.
process.env.PATH = withAgentBins(process.env.PATH);

const config = readConfig();
const diagnostics = new DiagnosticJournal(config.chatDb);
installProcessDiagnostics(diagnostics);
const store = new TerminalStore(config, spawnPty);
const providers = providerRegistry();
// ACP agents added from Settings → Agents & permissions, driven alongside the built-in ones.
const acpAgents = new AcpAgentStore(config.chatDb);
for (const agent of acpAgents.list()) addAcpAgent(providers, agent);
const chat = new ChatHub(new ChatStore(config.chatDb), providers, config.projectsDir);
chat.setDescribe(async (id, installed) => ({
	version: installed ? await agentVersion(agentBinary(id)) : null,
	custom: acpAgents.list().some((agent) => agent.id === id),
}));
// This machine's runner settings: how many agents work at once, and staying awake while they do.
const machinePrefs = new MachinePrefsStore(config.chatDb);
const keepAwake = new KeepAwake();
const applyMachine = (saved: MachinePrefs) => {
	chat.setTurnLimit(saved.concurrency);
	keepAwake.enabled = saved.keepAwake;
	keepAwake.update(chat.busyCount());
};
applyMachine(machinePrefs.get());
chat.onBusy((running) => keepAwake.update(running));
// Everything waiting on the people in a workspace, kept in the same database as their chats.
const inbox = new InboxStore(config.chatDb);
const roles = new RoleStore(config.chatDb);
const automations = new Automations(new AutomationStore(config.chatDb), chat, inbox, {
	roleOf: (workspace, id) => roles.get(workspace, id),
	// The pull request a run opened: the open one from the branch its worktree is on. Asked only
	// once a run ends, long after `pulls` below exists.
	pullOf: async (ownerId, project, workspace, branch) => {
		const folder = chat.projectFolders(workspace)[project];
		if (!folder) return null;
		const open = await pulls.list(ownerId, folder, "open");
		return open.find((pull) => pull.branch === branch)?.number ?? null;
	},
});
// A turn that ends, or an approval that waits, while no device is looking becomes a notification
// and a row on the Inbox: one decision about what deserves attention, two things done with it.
const push = new PushNotifier(config.chatDb);
// What each person set for themselves: who their agents' commits are by, and when to reach them.
const prefs = new PrefsStore(config.chatDb);
push.setPrefs((ownerId) => prefs.get(ownerId).notify);
chat.setPersonal((ownerId) => {
	const git = prefs.get(ownerId).git;
	return { env: gitEnvironment(git, signingKey()), note: creditNote(git) };
});
// Updates held through quiet hours go out once they end.
setInterval(() => void push.flushHeld().catch(() => undefined), 60_000);
chat.onTurnFailed((session) => {
	try {
		diagnostics.record({
			kind: "error",
			source: "agent",
			workspace: session.workspaceId,
			message: "Agent turn ended with an error",
			details: { sessionId: session.id },
		});
	} catch {
		console.error("[runner] could not write an agent diagnostic event");
	}
});
chat.onUnwatchedAttention((session, event) => {
	const message = attentionMessage(session, event);
	if (message) {
		const notify = prefs.get(session.ownerId).notify;
		const kind = notifyKind(event, lastReply(chat.events(session.workspaceId, session.id)));
		// A locked phone can answer an approval from the notification, with a one-time token.
		if (event.type === "approval" && notify.lockScreen) {
			message.act = push.createAct({
				ownerId: session.ownerId,
				workspace: session.workspaceId,
				sessionId: session.id,
				approvalId: event.id,
			});
			message.actions = approvalActions(event.options);
		}
		void push.notify(session.ownerId, message, kind).catch(() => undefined);
	}
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
// What each workspace sets for everyone, as last heard from the API: the run-log retention below.
const workspaceSettings = new Map<string, WorkspaceSettings>();
// What agents may do on their own in each workspace, as its settings say.
chat.setPolicy((workspace) => {
	const settings = workspaceSettings.get(workspace);
	return { policy: policyOf(settings), defaultBranch: settings?.defaultBranch ?? "main" };
});
setInterval(() => {
	for (const [workspace, settings] of workspaceSettings) {
		const days = settings.logRetentionDays ?? 0;
		const cleared = days > 0 ? chat.prune(workspace, days) : 0;
		if (cleared) console.log(`[runner] cleared ${cleared} threads older than ${days} days`);
	}
}, 3_600_000);
const signIn = createTokenVerifier(
	config.apiUrl,
	fetch,
	(who) => {
		chat.adopt(who);
		environments.store.adopt(who.userId, who.workspace);
	},
	(workspace, settings) => workspaceSettings.set(workspace, settings),
);
// A paired Grid acts under the key it paired with (its home workspace), whichever it names.
// Each person's latest role per workspace, for answers that arrive without a sign-in (a button on
// a locked phone's notification).
const lastSeen = new Map<string, Who>();
const verify: Verify = async (token, workspace) => {
	if (!pairing || !isEnvironmentToken(token)) {
		const verified = await signIn(token, workspace);
		if ("who" in verified)
			lastSeen.set(`${verified.who.userId}:${verified.who.workspace}`, verified.who);
		return verified;
	}
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

// Settings → Connectors: services and MCP servers agents may use, behind Grid's proxy. Secrets
// sit in the vault beside the database, under a key only this user can read.
const connections = new ConnectionStore(config.chatDb);
const connectors = new Connectors({
	store: connections,
	vault: new Vault(config.chatDb, join(dirname(config.chatDb), "vault.key")),
	githubToken: async () => {
		const result = await gh.run(["auth", "token"], { timeoutMs: 10_000 });
		return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : null;
	},
	folders: (workspace) => chat.projectFolders(workspace),
	ask: (thread, question) => chat.ask(thread, question),
	runnerUrl: () => `http://127.0.0.1:${server.port}`,
});
chat.setMcp((workspace, agent, thread) => connectors.serversFor(workspace, agent, thread));
const pulse = new Pulse({ chat, gh, connections, store: new PulseStore(config.chatDb) });
// Search and Ask Grid: tasks and notes come from the API, asked as the person searching.
const search = new Search({
	chat,
	gh,
	apiSearch: async (auth, query, project) => {
		const empty: ApiFindings = { tasks: [], notes: [] };
		if (!auth.token || !auth.workspace) return empty;
		const params = new URLSearchParams({ q: query, ...(project ? { project } : {}) });
		const response = await fetch(
			`${config.apiUrl}/api/v1/workspaces/${encodeURIComponent(auth.workspace)}/search?${params}`,
			{ headers: { authorization: `Bearer ${auth.token}` } },
		);
		if (!response.ok) return empty;
		const body = (await response.json().catch(() => null)) as { data?: ApiFindings } | null;
		return body?.data ?? empty;
	},
});
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
	onEvents: (workspace, ownerId, project, type, itemId, openedAt) => {
		automations.event(workspace, ownerId, project, type, itemId, openedAt);
		if (type === "review_requested")
			void push
				.notifyOnce(
					ownerId,
					`review:${workspace}:${project}:${itemId}`,
					{
						title: "Review requested",
						body: `Pull request #${itemId} in ${project} is waiting for your review`,
						url: `/pulls/${encodeURIComponent(project)}/${itemId}`,
						tag: `review-${project}-${itemId}`,
					},
					"reviews",
				)
				.catch(() => undefined);
	},
	onError: (workspace, ownerId, project, message) =>
		automations.eventError(workspace, ownerId, project, message),
	needsOpen: (workspace, ownerId, project) =>
		automations.store.hasPullOpened(workspace, ownerId, project),
});
automations.setEventSync(async (workspace, ownerId) => {
	if (githubInbox.available(ownerId) && githubInbox.stale(workspace))
		await githubInbox.sync(ownerId, workspace, config.projectsDir);
});

const server = startServer(config, store, verify, chat, {
	push,
	connectors,
	pulse,
	search,
	// Someone not seen since the runner started keeps the access their notification was sent with.
	mayApprove: (act) => {
		const who = lastSeen.get(`${act.ownerId}:${act.workspace}`);
		return !who || may(who, "approveCommands");
	},
	prefs,
	diagnostics,
	pairing,
	environments,
	github,
	pulls,
	inbox: { store: inbox, github: githubInbox, projectsDir: config.projectsDir },
	automations,
	roles: { store: roles, knownProvider: (id) => chat.knowsProvider(id) },
	machine: {
		prefs: machinePrefs,
		acpAgents,
		projectsDir: config.projectsDir,
		startedAt: Date.now(),
		counts: () => ({ agents: chat.busyCount(), terminals: store.count() }),
		apply: applyMachine,
		addAgent: (agent) => addAcpAgent(providers, agent),
		removeAgent: (id) => providers.delete(id),
		knownAgent: (id) => providers.has(id),
	},
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
		automations.stop();
		void server.stop(true);
		// Agents are stdio children, not shells, so nothing signals them when this process ends.
		// `closeAll` only schedules their `close()` as a microtask, and `exit` below discards the
		// queue, which is what left them running: give those microtasks the one tick they need.
		setTimeout(() => process.exit(0), 0);
	});
}
