/** What agents may do with one kind of action on a service. */
export type Rule = "allow" | "ask" | "never";

/** Per agent: the connector's rules, reading only, or no access. */
export type AgentAccess = "rules" | "read" | "off";

export type SignIn = "oauth" | "key" | "gh";

export interface Capability {
	id: string;
	label: string;
	hint: string | null;
	/** In a summary line ("Open PRs", "merging"). */
	short: string | null;
	initial: Rule;
}

/** A service Grid can connect to, through its official MCP server. */
export interface CatalogService {
	id: string;
	name: string;
	kind: string;
	category: "dev" | "ship" | "business";
	blurb: string;
	powers: string[];
	signIn: SignIn[];
	capabilities: Capability[];
}

export type SecretRef = { secret: string } | { value: string };

/** A service or MCP server connected to the workspace. */
export interface Connection {
	id: string;
	/** A catalog id, or "custom". */
	kind: string;
	name: string;
	transport: "http" | "stdio";
	url: string | null;
	command: string | null;
	env: Record<string, SecretRef>;
	auth: "oauth" | "key" | "gh" | "none";
	/** What it powers in Grid (catalog services). */
	powers: string[];
	enabled: boolean;
	rules: Record<string, Rule>;
	capabilities: Capability[];
	agents: Record<string, AgentAccess>;
	hiddenRepositories: string[];
	tools: string[];
	status: "healthy" | "error" | "signin";
	statusDetail: string | null;
	checkedAt: string | null;
	/** Set when its sign-in runs out within three days. */
	expiresAt: string | null;
}

export interface ConnectorsView {
	catalog: CatalogService[];
	connections: Connection[];
	/** Catalog ids not yet connected, those the projects use first. */
	suggested: string[];
	secrets: { name: string; updatedAt: string }[];
	/** Agents that cannot use connectors yet. */
	agentsWithoutConnectors: string[];
}

export interface ActivityEntry {
	at: string;
	agent: string;
	thread: string | null;
	tool: string;
	outcome: "done" | "blocked" | "denied" | "failed";
}

export interface Repository {
	repository: string;
	project: string;
	defaultBranch: string;
	shared: boolean;
}

export interface ConnectionDetail {
	connection: Connection;
	activity: ActivityEntry[];
	repositories: Repository[] | null;
	agentsWithoutConnectors: string[];
}

/** A sign-in held until the connector is added, and what the server offered. */
export interface HeldGrant {
	grant: string;
	tools: { name: string; description: string | null }[];
	ms: number;
}

export interface Probe {
	server: string | null;
	tools: { name: string; description: string | null }[];
	ms: number;
}

/** A server the workspace adds itself. */
export interface CustomServerInput {
	name: string;
	transport: "stdio" | "http";
	url?: string;
	command?: string;
	env?: Record<string, SecretRef>;
	key?: string;
}

/** A sign-in started from the connect dialog, as the runner last knew it. */
export type SignInOutcome =
	| { status: "waiting" }
	| ({ status: "done" } & HeldGrant)
	| { status: "failed"; message: string };
