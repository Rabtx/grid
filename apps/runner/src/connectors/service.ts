import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { McpServerSpec } from "../agents/provider";
import {
	CATALOG,
	type CatalogEntry,
	catalogEntry,
	GENERIC_CAPABILITIES,
	initialRules,
	type Rule,
	signInWays,
} from "./catalog";
import { httpTransport, McpAuthError, type Probe, probe, stdioTransport } from "./mcp-client";
import {
	authorizeUrl,
	challengeFor,
	discover,
	exchange,
	fresh,
	type Grant,
	OAuthError,
	randomToken,
	register,
	type ServerAuth,
	type Client,
} from "./oauth";
import { type AgentAccess, toolPolicy, type ToolPolicy } from "./rules";
import type { ActivityEntry, Connection, ConnectionStore } from "./store";
import type { Vault } from "./vault";

export class ConnectorError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "ConnectorError";
	}
}

/** A server the workspace adds itself: a command on this machine, or a URL. */
export type CustomServer = {
	name: string;
	transport: "stdio" | "http";
	url?: string;
	command?: string;
	env?: Record<string, { secret: string } | { value: string }>;
	/** A key for a URL that takes one (`Authorization: Bearer`). */
	key?: string;
};

export type ConnectorDeps = {
	store: ConnectionStore;
	vault: Vault;
	/** The GitHub CLI's token on this machine, when it is signed in. */
	githubToken: () => Promise<string | null>;
	/** A workspace's projects and their folders. */
	folders: (workspace: string) => Record<string, string>;
	/** A question in a thread, answered by the person (a tool set to "Ask me"). */
	ask: (thread: string, question: { title: string; detail?: string }) => Promise<boolean>;
	/** How the agents' proxies reach this runner. */
	runnerUrl: () => string;
	fetcher?: typeof fetch;
};

type Pending = {
	workspace: string;
	userId: string;
	url: string;
	auth: ServerAuth;
	client: Client;
	verifier: string;
	redirectUri: string;
	at: number;
};

type Held = { workspace: string; grant: Grant | null; gh: boolean; probe: Probe; at: number };

const PENDING_MS = 15 * 60_000;
const RECHECK_MS = 10 * 60_000;
const EXPIRY_WARNING_MS = 3 * 24 * 60 * 60_000;
const PROXY = join(import.meta.dir, "proxy.ts");

/** The name an agent sees a server by: letters, digits and dashes. */
function serverName(connection: Connection): string {
	const base = connection.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return base || connection.kind;
}

/** `owner/name` from a folder's GitHub remote, when it has one. */
function githubRepository(folder: string): string | null {
	try {
		const config = readFileSync(join(folder, ".git", "config"), "utf8");
		const url = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(config)?.[1] ?? "";
		const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(url);
		return match ? `${match[1]}/${match[2]}` : null;
	} catch {
		return null;
	}
}

function defaultBranchOf(folder: string): string {
	try {
		const head = readFileSync(join(folder, ".git", "refs", "remotes", "origin", "HEAD"), "utf8");
		return /refs\/remotes\/origin\/(.+)/.exec(head)?.[1]?.trim() ?? "main";
	} catch {
		return "main";
	}
}

export class Connectors {
	private readonly pending = new Map<string, Pending>();
	private readonly held = new Map<string, Held>();
	private readonly checking = new Set<string>();
	/** What the agents' proxies prove themselves with: made fresh each time the runner starts. */
	readonly proxyKey = randomToken();
	private readonly fetcher: typeof fetch;

	constructor(private readonly deps: ConnectorDeps) {
		this.fetcher = deps.fetcher ?? fetch;
	}

	private sweep(): void {
		const now = Date.now();
		for (const [key, item] of this.pending)
			if (now - item.at > PENDING_MS) this.pending.delete(key);
		for (const [key, item] of this.held) if (now - item.at > PENDING_MS) this.held.delete(key);
	}

	private capabilitiesOf(connection: Pick<Connection, "kind">) {
		return catalogEntry(connection.kind)?.capabilities ?? GENERIC_CAPABILITIES;
	}

	// ---------------------------------------------------------------------------------- reading

	/** The catalog, what is connected, and what the workspace's projects suggest. */
	view(workspace: string) {
		const connections = this.deps.store.list(workspace);
		for (const connection of connections) this.recheck(connection);
		const connected = new Set(connections.map((item) => item.kind));
		return {
			catalog: CATALOG.map((entry) => ({
				id: entry.id,
				name: entry.name,
				kind: entry.kind,
				category: entry.category,
				blurb: entry.blurb,
				powers: entry.powers,
				signIn: signInWays(entry),
				capabilities: entry.capabilities.map(({ id, label, hint, initial }) => ({
					id,
					label,
					hint: hint ?? null,
					initial,
				})),
			})),
			connections: connections.map((item) => this.connectionView(item)),
			suggested: this.suggest(workspace).filter((id) => !connected.has(id)),
			secrets: this.deps.vault.names(workspace),
		};
	}

	connectionView(connection: Connection) {
		const capabilities = this.capabilitiesOf(connection);
		const expiring =
			connection.expiresAt && Date.parse(connection.expiresAt) - Date.now() < EXPIRY_WARNING_MS
				? connection.expiresAt
				: null;
		return {
			id: connection.id,
			kind: connection.kind,
			name: connection.name,
			transport: connection.transport,
			url: connection.url,
			command: connection.command ? [connection.command, ...connection.args].join(" ") : null,
			env: Object.fromEntries(
				Object.entries(connection.env).map(([key, value]) => [
					key,
					"secret" in value ? { secret: value.secret } : { value: value.value },
				]),
			),
			auth: connection.auth,
			enabled: connection.enabled,
			rules: { ...initialRules(capabilities), ...connection.rules },
			capabilities: capabilities.map(({ id, label, hint, initial }) => ({
				id,
				label,
				hint: hint ?? null,
				initial,
			})),
			agents: connection.agents,
			hiddenRepositories: connection.hiddenRepositories,
			tools: connection.tools,
			status: connection.status,
			statusDetail: connection.statusDetail,
			checkedAt: connection.checkedAt,
			expiresAt: expiring,
		};
	}

	get(workspace: string, id: string): Connection {
		const connection = this.deps.store.get(workspace, id);
		if (!connection) throw new ConnectorError("That connector is not in this workspace", 404);
		return connection;
	}

	activity(workspace: string, id: string): ActivityEntry[] {
		return this.deps.store.activity(this.get(workspace, id).id);
	}

	/** GitHub: the workspace's projects on GitHub, and whether agents may work in each. */
	repositories(workspace: string, id: string) {
		const connection = this.get(workspace, id);
		const hidden = new Set(connection.hiddenRepositories.map((item) => item.toLowerCase()));
		const seen = new Set<string>();
		return Object.entries(this.deps.folders(workspace)).flatMap(([project, folder]) => {
			const repository = existsSync(folder) ? githubRepository(folder) : null;
			if (!repository || seen.has(repository.toLowerCase())) return [];
			seen.add(repository.toLowerCase());
			return [
				{
					repository,
					project,
					defaultBranch: defaultBranchOf(folder),
					shared: !hidden.has(repository.toLowerCase()),
				},
			];
		});
	}

	/** Catalog services a workspace's projects already use: by their files and packages. */
	private suggest(workspace: string): string[] {
		const found = new Set<string>();
		for (const folder of Object.values(this.deps.folders(workspace))) {
			if (!existsSync(folder)) continue;
			let packages: string[] = [];
			try {
				const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as {
					dependencies?: Record<string, string>;
					devDependencies?: Record<string, string>;
				};
				packages = [
					...Object.keys(pkg.dependencies ?? {}),
					...Object.keys(pkg.devDependencies ?? {}),
				];
			} catch {
				// Not a JavaScript project; files still count.
			}
			for (const entry of CATALOG) {
				const signals = entry.signals;
				if (!signals) continue;
				if (signals.files?.some((file) => existsSync(join(folder, file)))) found.add(entry.id);
				if (signals.packages && packages.some((name) => signals.packages?.test(name)))
					found.add(entry.id);
			}
		}
		// What the projects use first, then the rest of the catalog in its order.
		return [
			...CATALOG.filter((entry) => found.has(entry.id)).map((entry) => entry.id),
			...CATALOG.filter((entry) => !found.has(entry.id)).map((entry) => entry.id),
		];
	}

	// ---------------------------------------------------------------------------------- signing in

	private entry(id: string): CatalogEntry {
		const entry = catalogEntry(id);
		if (!entry) throw new ConnectorError("That service is not in the catalog", 404);
		return entry;
	}

	/** Starts an OAuth sign-in: the address to send the person to. */
	async startSignIn(
		workspace: string,
		userId: string,
		input: { service?: string; url?: string; redirectUri: string },
	): Promise<{ url: string; state: string }> {
		this.sweep();
		const url = input.service ? this.entry(input.service).url : input.url;
		if (!url || !url.startsWith("https://")) throw new ConnectorError("Use an https address");
		try {
			const auth = await discover(url, this.fetcher);
			const client = await register(auth, input.redirectUri, this.fetcher);
			const verifier = randomToken(48);
			const state = randomToken();
			this.pending.set(state, {
				workspace,
				userId,
				url,
				auth,
				client,
				verifier,
				redirectUri: input.redirectUri,
				at: Date.now(),
			});
			return {
				url: authorizeUrl(auth, client, {
					redirectUri: input.redirectUri,
					state,
					challenge: await challengeFor(verifier),
				}),
				state,
			};
		} catch (cause) {
			throw new ConnectorError(
				cause instanceof Error ? cause.message : "Could not start the sign-in",
				502,
			);
		}
	}

	/** The person came back from signing in: the grant, held until the connector is added. */
	async finishSignIn(workspace: string, state: string, code: string) {
		const pending = this.pending.get(state);
		if (!pending || pending.workspace !== workspace)
			throw new ConnectorError("That sign-in has expired: start again", 410);
		this.pending.delete(state);
		try {
			const grant = await exchange(
				pending.auth,
				pending.client,
				{ code, verifier: pending.verifier, redirectUri: pending.redirectUri },
				this.fetcher,
			);
			return this.hold(workspace, pending.url, grant, false);
		} catch (cause) {
			throw new ConnectorError(cause instanceof Error ? cause.message : "Signing in failed", 502);
		}
	}

	/** An API key in place of signing in, for servers that take one. */
	async useKey(workspace: string, input: { service?: string; url?: string; key: string }) {
		const url = input.service ? this.entry(input.service).url : input.url;
		if (!url) throw new ConnectorError("Say which server");
		const grant: Grant = {
			access: input.key.trim(),
			refresh: null,
			expiresAt: null,
			tokenEndpoint: "",
			client: { clientId: "", clientSecret: null },
			resource: url,
		};
		return this.hold(workspace, url, grant, false);
	}

	/** GitHub through the GitHub CLI's sign-in on this machine. */
	async useGithubCli(workspace: string) {
		if (!(await this.deps.githubToken()))
			throw new ConnectorError("Sign in to GitHub on this machine first", 409);
		return this.hold(workspace, this.entry("github").url, null, true);
	}

	private async hold(workspace: string, url: string, grant: Grant | null, gh: boolean) {
		const tested = await this.tryProbe(() =>
			httpTransport(
				url,
				async () => (gh ? this.deps.githubToken() : (grant?.access ?? null)),
				this.fetcher,
			),
		);
		if ("error" in tested) throw new ConnectorError(tested.error, 502);
		const id = randomToken(16);
		this.held.set(id, { workspace, grant, gh, probe: tested.probe, at: Date.now() });
		return { grant: id, tools: tested.probe.tools, ms: tested.probe.ms };
	}

	private async tryProbe(
		make: () => ReturnType<typeof httpTransport>,
	): Promise<{ probe: Probe } | { error: string; signin?: boolean }> {
		try {
			return { probe: await probe(make()) };
		} catch (cause) {
			if (cause instanceof McpAuthError || cause instanceof OAuthError)
				return { error: cause.message, signin: true };
			return { error: cause instanceof Error ? cause.message : "The server did not answer" };
		}
	}

	// ---------------------------------------------------------------------------------- adding

	/** A catalog service, signed in a moment ago. */
	async addService(
		workspace: string,
		userId: string,
		input: { service: string; grant: string; rules?: Record<string, Rule> },
	): Promise<Connection> {
		const entry = this.entry(input.service);
		const held = this.held.get(input.grant);
		if (!held || held.workspace !== workspace)
			throw new ConnectorError("That sign-in has expired: start again", 410);
		this.held.delete(input.grant);
		const id = randomToken(12);
		if (held.grant)
			await this.deps.vault.set(workspace, `connector:${id}`, JSON.stringify(held.grant));
		return this.deps.store.save({
			id,
			workspace,
			kind: entry.id,
			name: entry.name,
			transport: "http",
			url: entry.url,
			command: null,
			args: [],
			env: {},
			auth: held.gh ? "gh" : held.grant?.tokenEndpoint ? "oauth" : "key",
			enabled: true,
			rules: {
				...initialRules(entry.capabilities),
				...this.validRules(entry.capabilities, input.rules),
			},
			agents: {},
			hiddenRepositories: [],
			tools: held.probe.tools.map((tool) => tool.name),
			status: "healthy",
			statusDetail: null,
			checkedAt: new Date().toISOString(),
			expiresAt: held.grant?.refresh ? null : (held.grant?.expiresAt ?? null),
			createdBy: userId,
			createdAt: new Date().toISOString(),
		});
	}

	private validRules(
		capabilities: readonly { id: string }[],
		rules: Record<string, Rule> | undefined,
	): Record<string, Rule> {
		const known = new Set(capabilities.map((item) => item.id));
		return Object.fromEntries(
			Object.entries(rules ?? {}).filter(
				([key, value]) => known.has(key) && ["allow", "ask", "never"].includes(value),
			),
		);
	}

	private customParts(server: CustomServer): { command: string; args: string[] } | null {
		if (server.transport !== "stdio") return null;
		const words = (server.command ?? "").match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
		const [command, ...args] = words.map((word) => word.replace(/^["']|["']$/g, ""));
		if (!command) throw new ConnectorError("Give the command that starts the server");
		return { command, args };
	}

	private async customEnv(
		workspace: string,
		env: CustomServer["env"],
	): Promise<Record<string, string>> {
		const resolved: Record<string, string> = {};
		for (const [key, value] of Object.entries(env ?? {})) {
			if ("value" in value) resolved[key] = value.value;
			else {
				const secret = await this.deps.vault.get(workspace, value.secret);
				if (secret === null)
					throw new ConnectorError(`The secret ${value.secret} is not in the vault`);
				resolved[key] = secret;
			}
		}
		return resolved;
	}

	/** Tries a server the workspace is adding, before it is saved. */
	async testCustom(workspace: string, server: CustomServer): Promise<Probe> {
		const parts = this.customParts(server);
		// The environment is resolved first, so a missing secret says so before anything runs.
		const env = parts ? await this.customEnv(workspace, server.env) : {};
		const tested = await this.tryProbe(() =>
			parts
				? stdioTransport([parts.command, ...parts.args], env, () => {})
				: httpTransport(server.url ?? "", async () => server.key ?? null, this.fetcher),
		);
		if ("error" in tested) throw new ConnectorError(tested.error, 502);
		return tested.probe;
	}

	async addCustom(workspace: string, userId: string, server: CustomServer): Promise<Connection> {
		const name = server.name.trim();
		if (!name || name.length > 60) throw new ConnectorError("Give it a name");
		if (server.transport === "http" && !/^https?:\/\//.test(server.url ?? ""))
			throw new ConnectorError("Give the server's address");
		const tested = await this.testCustom(workspace, server);
		const parts = this.customParts(server);
		const id = randomToken(12);
		if (server.key)
			await this.deps.vault.set(
				workspace,
				`connector:${id}`,
				JSON.stringify({
					access: server.key,
					refresh: null,
					expiresAt: null,
					tokenEndpoint: "",
					client: { clientId: "", clientSecret: null },
					resource: server.url ?? "",
				} satisfies Grant),
			);
		return this.deps.store.save({
			id,
			workspace,
			kind: "custom",
			name,
			transport: server.transport,
			url: server.transport === "http" ? (server.url ?? null) : null,
			command: parts?.command ?? null,
			args: parts?.args ?? [],
			env: server.env ?? {},
			auth: server.key ? "key" : "none",
			enabled: true,
			rules: initialRules(GENERIC_CAPABILITIES),
			agents: {},
			hiddenRepositories: [],
			tools: tested.tools.map((tool) => tool.name),
			status: "healthy",
			statusDetail: null,
			checkedAt: new Date().toISOString(),
			expiresAt: null,
			createdBy: userId,
			createdAt: new Date().toISOString(),
		});
	}

	// ---------------------------------------------------------------------------------- changing

	update(
		workspace: string,
		id: string,
		patch: {
			enabled?: boolean;
			name?: string;
			rules?: Record<string, Rule>;
			agents?: Record<string, AgentAccess | null>;
			hiddenRepositories?: string[];
		},
	): Connection {
		const connection = this.get(workspace, id);
		const agents = { ...connection.agents };
		for (const [agent, access] of Object.entries(patch.agents ?? {})) {
			if (access === null || access === "rules") delete agents[agent];
			else if (access === "read" || access === "off") agents[agent] = access;
		}
		return this.deps.store.save({
			...connection,
			...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
			...(patch.name?.trim() ? { name: patch.name.trim().slice(0, 60) } : {}),
			rules: {
				...connection.rules,
				...this.validRules(this.capabilitiesOf(connection), patch.rules),
			},
			agents,
			...(patch.hiddenRepositories
				? {
						hiddenRepositories: patch.hiddenRepositories.filter((item) =>
							/^[\w.-]+\/[\w.-]+$/.test(item),
						),
					}
				: {}),
		});
	}

	async saveSecret(workspace: string, name: string, value: string): Promise<void> {
		await this.deps.vault.set(workspace, name, value);
	}

	deleteSecret(workspace: string, name: string): void {
		this.deps.vault.delete(workspace, name);
	}

	remove(workspace: string, id: string): void {
		this.get(workspace, id);
		this.deps.store.delete(workspace, id);
		this.deps.vault.delete(workspace, `connector:${id}`);
	}

	/** The token a connection uses now, renewed and saved when it had run out. */
	private async tokenFor(connection: Connection): Promise<string | null> {
		if (connection.auth === "gh") return this.deps.githubToken();
		if (connection.auth === "none") return null;
		const stored = await this.deps.vault.get(connection.workspace, `connector:${connection.id}`);
		if (!stored) throw new OAuthError("The sign-in is gone: sign in again");
		const grant = JSON.parse(stored) as Grant;
		if (!grant.tokenEndpoint) return grant.access;
		const renewed = await fresh(grant, this.fetcher);
		if (renewed !== grant)
			await this.deps.vault.set(
				connection.workspace,
				`connector:${connection.id}`,
				JSON.stringify(renewed),
			);
		return renewed.access;
	}

	private async transportFor(connection: Connection) {
		if (connection.transport === "http")
			return httpTransport(connection.url ?? "", () => this.tokenFor(connection), this.fetcher);
		const env = await this.customEnv(connection.workspace, connection.env);
		return stdioTransport([connection.command ?? "", ...connection.args], env, () => {});
	}

	/** Checks a connection now: does it answer, and with which tools. */
	async test(workspace: string, id: string): Promise<Connection> {
		const connection = this.get(workspace, id);
		let result: { probe: Probe } | { error: string; signin?: boolean };
		try {
			const transport = await this.transportFor(connection);
			result = await this.tryProbe(() => transport);
		} catch (cause) {
			result = {
				error: cause instanceof Error ? cause.message : "The server did not answer",
				signin: cause instanceof OAuthError,
			};
		}
		const current = this.deps.store.get(workspace, id) ?? connection;
		return this.deps.store.save({
			...current,
			...("probe" in result
				? {
						status: "healthy" as const,
						statusDetail: null,
						tools: result.probe.tools.map((tool) => tool.name),
					}
				: {
						status: result.signin ? ("signin" as const) : ("error" as const),
						statusDetail: result.error,
					}),
			checkedAt: new Date().toISOString(),
		});
	}

	/** Checked again in the background when the last check is old. */
	private recheck(connection: Connection): void {
		if (!connection.enabled || this.checking.has(connection.id)) return;
		if (connection.checkedAt && Date.now() - Date.parse(connection.checkedAt) < RECHECK_MS) return;
		this.checking.add(connection.id);
		void this.test(connection.workspace, connection.id)
			.catch(() => undefined)
			.finally(() => this.checking.delete(connection.id));
	}

	// ---------------------------------------------------------------------------------- agents

	private access(connection: Connection, agent: string): AgentAccess {
		return connection.agents[agent] ?? "rules";
	}

	/**
	 * The MCP servers a thread's agent is started with: the workspace's connectors it may use,
	 * each behind Grid's proxy so its rules hold whatever the agent does.
	 */
	serversFor(workspace: string, agent: string, thread: string): McpServerSpec[] {
		return this.deps.store
			.list(workspace)
			.filter(
				(item) => item.enabled && item.status !== "signin" && this.access(item, agent) !== "off",
			)
			.map((item) => ({
				name: serverName(item),
				command: process.execPath,
				args: [PROXY],
				env: {
					GRID_RUNNER_URL: this.deps.runnerUrl(),
					GRID_CONNECTOR_KEY: this.proxyKey,
					GRID_CONNECTOR_ID: item.id,
					GRID_CONNECTOR_AGENT: agent,
					GRID_CONNECTOR_THREAD: thread,
				},
			}));
	}

	/** What a proxy needs to stand in for a connection: where it is, and the rules for this agent. */
	async proxyConfig(id: string, agent: string) {
		const connection = this.deps.store.byId(id);
		if (!connection || !connection.enabled) throw new ConnectorError("That connector is off", 404);
		const repositories =
			connection.kind === "github"
				? this.repositories(connection.workspace, connection.id)
						.filter((item) => item.shared)
						.map((item) => item.repository)
				: null;
		const policy: ToolPolicy = toolPolicy(
			this.capabilitiesOf(connection),
			connection.rules,
			this.access(connection, agent),
			{
				repositories: repositories && repositories.length > 0 ? repositories : null,
				defaultBranch: "main",
			},
		);
		return {
			name: connection.name,
			transport: connection.transport,
			url: connection.url,
			command: connection.command ? [connection.command, ...connection.args] : null,
			env:
				connection.transport === "stdio"
					? await this.customEnv(connection.workspace, connection.env)
					: {},
			policy,
		};
	}

	async proxyToken(id: string): Promise<string | null> {
		const connection = this.deps.store.byId(id);
		if (!connection) throw new ConnectorError("That connector is gone", 404);
		return this.tokenFor(connection);
	}

	proxyActivity(id: string, entry: Omit<ActivityEntry, "connection" | "at">): void {
		if (!this.deps.store.byId(id)) return;
		this.deps.store.record({ ...entry, connection: id, at: new Date().toISOString() });
	}

	async proxyAsk(
		id: string,
		thread: string | null,
		tool: string,
		detail: string,
	): Promise<boolean> {
		const connection = this.deps.store.byId(id);
		if (!connection || !thread) return false;
		return this.deps.ask(thread, {
			title: `${connection.name}: ${tool.replaceAll("_", " ")}`,
			detail,
		});
	}
}
