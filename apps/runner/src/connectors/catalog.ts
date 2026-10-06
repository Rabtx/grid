/**
 * The services Grid connects to (Settings → Connectors), each through its own official MCP
 * server. Every one here is a remote server that signs people in with OAuth; GitHub can also use
 * the GitHub CLI's sign-in on this machine.
 *
 * What agents may do with a service is said in capabilities: each a kind of action, the tools
 * that belong to it (by name), and what it starts as. A tool no capability claims is reading when
 * its name says so and a change otherwise.
 */

export type Rule = "allow" | "ask" | "never";
export type Category = "dev" | "ship" | "business";

export type Capability = {
	id: string;
	label: string;
	/** A line under the label: what happens when it is asked for. */
	hint?: string;
	/** In a summary line: "Open PRs · merging asks you". */
	short?: string;
	/** Tool names that belong to it. */
	tools: RegExp;
	/** What it starts as when the service is connected. */
	initial: Rule;
	/** Reading: allowed even for an agent kept to read only. */
	read?: boolean;
};

/** How a service signs in: OAuth in the browser, a key pasted in, or the GitHub CLI's sign-in. */
export type SignIn = "oauth" | "key" | "gh";

export type CatalogEntry = {
	id: string;
	/** The ways it signs in, the first offered first. OAuth when not said. */
	signIn?: SignIn[];
	name: string;
	/** The small word under the name (Code, Plan, Ship). */
	kind: string;
	category: Category;
	/** What Grid uses it for, on its card. */
	blurb: string;
	/** What it powers in Grid, on its page. */
	powers: string[];
	url: string;
	capabilities: Capability[];
	/** Files and packages that say a project already uses it ("Suggested for you"). */
	signals?: { files?: string[]; packages?: RegExp };
};

/** Tool names that only read: get_issue, list_projects, search_code… */
export const READ_TOOL =
	/^(get|list|search|read|fetch|find|query|describe|explain|view|show|lookup|retrieve|whoami|check)(_|-|$)|_(get|list|search|read)$/i;

/** Any server the catalog does not know: reading, and everything else. */
export const GENERIC_CAPABILITIES: Capability[] = [
	{ id: "read", label: "Read", tools: READ_TOOL, initial: "allow", read: true },
	{ id: "write", label: "Change things", short: "changes", tools: /.*/, initial: "ask" },
];

// Not listed: Slack and Figma. Checked on 2026-10-07: Slack's MCP server offers no way for an
// app to register itself (it needs a Slack app made by hand), and Figma's turns away every app it
// has not approved itself (403), whatever address it comes back to. A button for either could only
// fail. Both can still be added under "Add MCP server" by someone who has an approved setup.
export const CATALOG: CatalogEntry[] = [
	{
		id: "github",
		name: "GitHub",
		// GitHub registers no apps on the fly: this machine's GitHub CLI sign-in, or a token.
		signIn: ["gh", "key"],
		kind: "Code",
		category: "dev",
		blurb: "Board, pull requests, CI checks",
		powers: ["Board sync", "Pull requests", "CI checks", "Deploy previews", "Run replay links"],
		url: "https://api.githubcopilot.com/mcp/",
		capabilities: [
			{
				id: "read",
				label: "Read code, issues and checks",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "open",
				label: "Open branches and pull requests",
				short: "Open PRs",
				hint: "Always on a new branch",
				tools:
					/^(create_branch|create_pull_request|update_pull_request|push_files|create_or_update_file|delete_file|fork_repository|create_issue|update_issue)$/,
				initial: "allow",
			},
			{
				id: "comment",
				label: "Comment and request reviews",
				short: "comments",
				tools: /comment|review/,
				initial: "allow",
			},
			{
				id: "merge",
				label: "Merge pull requests",
				short: "merging",
				hint: "Sends you an approval in Inbox",
				tools: /^merge_pull_request$/,
				initial: "ask",
			},
			{
				id: "push_main",
				label: "Push to main",
				hint: "Blocked for agents",
				// Writes that name the default branch; told apart by their arguments (see rules.ts).
				tools: /^$/,
				initial: "never",
			},
			{
				id: "settings",
				label: "Change repository settings",
				tools: /^(create_repository|delete_repository|update_repository|.*_settings|.*secret.*)$/,
				initial: "never",
			},
		],
	},
	{
		id: "linear",
		name: "Linear",
		kind: "Plan",
		category: "dev",
		blurb: "Board sync both ways",
		powers: ["Board sync", "Issues in threads"],
		url: "https://mcp.linear.app/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read issues and projects",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "update",
				label: "Create and update issues",
				short: "Read and update issues",
				tools: /^(create|update|save)_/,
				initial: "allow",
			},
			{ id: "delete", label: "Delete and archive", tools: /delete|archive/, initial: "never" },
		],
		signals: { packages: /^@linear\// },
	},
	{
		id: "vercel",
		name: "Vercel",
		kind: "Ship",
		category: "ship",
		blurb: "Deploys and previews",
		powers: ["Deploy previews", "Ship"],
		url: "https://mcp.vercel.com/",
		capabilities: [
			{
				id: "read",
				label: "Read deployments and logs",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "deploy",
				label: "Deploy previews",
				short: "Previews",
				tools: /deploy/,
				initial: "allow",
			},
			{
				id: "settings",
				label: "Change projects and domains",
				tools: /project|domain|env/,
				initial: "never",
			},
		],
		signals: { files: ["vercel.json", ".vercel"], packages: /^@vercel\// },
	},
	{
		id: "sentry",
		name: "Sentry",
		kind: "Observe",
		category: "ship",
		blurb: "Incidents and error triage",
		powers: ["Incidents", "Error triage"],
		url: "https://mcp.sentry.dev/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read issues, traces and releases",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "resolve",
				label: "Resolve and assign issues",
				short: "resolving issues",
				hint: "Sends you an approval first",
				tools: /^(update_issue|assign|resolve)/,
				initial: "ask",
			},
			{
				id: "settings",
				label: "Change alerts and project settings",
				tools: /^(create|update)_(project|team|dsn|alert)/,
				initial: "never",
			},
		],
		signals: { packages: /^@sentry\// },
	},
	{
		id: "stripe",
		name: "Stripe",
		kind: "Revenue",
		category: "business",
		blurb: "Pulse: revenue and churn",
		powers: ["Pulse", "Revenue and churn"],
		url: "https://mcp.stripe.com",
		capabilities: [
			{
				id: "read",
				label: "Read customers, payments and plans",
				// Stripe's server reads through stripe_api_read and its analytics and docs tools.
				tools:
					/^(stripe_api_read|stripe_api_search|stripe_api_details|stripe_analytics|get_.*|search_.*)$/,
				initial: "allow",
				read: true,
			},
			{
				id: "write",
				label: "Change records and move money",
				hint: "Refunds and payouts also ask in Stripe",
				short: "changes",
				tools: /^stripe_api_write$/,
				initial: "never",
			},
		],
		signals: { packages: /^(stripe|@stripe\/)/ },
	},
	{
		id: "posthog",
		name: "PostHog",
		kind: "Analytics",
		category: "business",
		blurb: "Pulse: signups and activation",
		powers: ["Pulse", "Signups and activation"],
		url: "https://mcp.posthog.com/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read insights and events",
				// PostHog names its tools with dashes: execute-sql, query-trends, insights-get-all.
				tools: /^(execute-sql|query-[\w-]+)$|(^|-)(get|list|retrieve|search)(-|$)/,
				initial: "allow",
				read: true,
			},
			{
				id: "write",
				label: "Create insights and flags",
				short: "new insights",
				tools: /(^|-)(create|update)(-|$)/,
				initial: "ask",
			},
			{ id: "delete", label: "Delete", tools: /delete/, initial: "never" },
		],
		signals: { packages: /^posthog/ },
	},
	{
		id: "supabase",
		name: "Supabase",
		kind: "Database",
		category: "dev",
		blurb: "Database, auth and migrations — migrations ask you first",
		powers: ["Database", "Migrations"],
		url: "https://mcp.supabase.com/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read tables, logs and docs",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "migrate",
				label: "Run SQL and migrations",
				short: "migrations",
				hint: "Sends you an approval first",
				tools: /migration|execute_sql|deploy/,
				initial: "ask",
			},
			{
				id: "projects",
				label: "Create, pause and delete projects",
				tools: /project|branch|pause|restore/,
				initial: "never",
			},
		],
		signals: { files: ["supabase"], packages: /^@supabase\// },
	},
	{
		id: "cloudflare",
		name: "Cloudflare",
		kind: "Edge",
		category: "ship",
		blurb: "Workers logs and analytics",
		powers: ["Workers", "Logs"],
		url: "https://observability.mcp.cloudflare.com/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read logs and analytics",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{ id: "write", label: "Change accounts and settings", tools: /.*/, initial: "never" },
		],
		signals: { files: ["wrangler.toml", "wrangler.jsonc"], packages: /^wrangler$/ },
	},
	{
		id: "intercom",
		name: "Intercom",
		kind: "Support",
		category: "business",
		blurb: "Support inbox — agents draft replies, you send",
		powers: ["Support inbox"],
		url: "https://mcp.intercom.com/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read conversations and contacts",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "reply",
				label: "Reply to customers",
				tools: /reply|send|create|update/,
				initial: "never",
			},
		],
	},
	{
		id: "notion",
		name: "Notion",
		kind: "Docs",
		category: "business",
		blurb: "Specs and docs in threads",
		powers: ["Docs"],
		url: "https://mcp.notion.com/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read pages and databases",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "write",
				label: "Create and edit pages",
				short: "editing pages",
				tools: /create|update|append|move/,
				initial: "ask",
			},
		],
	},
	{
		id: "neon",
		name: "Neon",
		kind: "Database",
		category: "dev",
		blurb: "Postgres branches for every task",
		powers: ["Database"],
		url: "https://mcp.neon.tech/mcp",
		capabilities: [
			{
				id: "read",
				label: "Read schemas and data",
				tools: READ_TOOL,
				initial: "allow",
				read: true,
			},
			{
				id: "migrate",
				label: "Run SQL and migrations",
				short: "migrations",
				tools: /sql|migration|branch/,
				initial: "ask",
			},
			{ id: "projects", label: "Create and delete projects", tools: /project/, initial: "never" },
		],
		signals: { packages: /^@neondatabase\// },
	},
];

export function catalogEntry(id: string): CatalogEntry | undefined {
	return CATALOG.find((entry) => entry.id === id);
}

/** What each capability starts as. */
export function initialRules(capabilities: readonly Capability[]): Record<string, Rule> {
	return Object.fromEntries(capabilities.map((item) => [item.id, item.initial]));
}

export function signInWays(entry: CatalogEntry): SignIn[] {
	return entry.signIn ?? ["oauth", "key"];
}
