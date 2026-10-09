import { SITE_URL } from "@/app/site";

/**
 * A console people can sign in to, when one is hosted (NEXT_PUBLIC_CONSOLE_URL). Grid is
 * self-hosted, so without it the site offers no sign-in link at all rather than a dead one.
 */
const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL?.replace(/\/+$/, "");

/**
 * Copy for the landing page. Kept as data so the sections stay presentational and
 * the wording can be reviewed in one place. Everything here has to stay true of
 * the repository as it actually is — no invented customers, metrics or features.
 */

export const SITE = {
	name: "Grid",
	tagline: "A workspace for you and your coding agents",
	summary:
		"Grid gives you and agents like Claude Code, Codex and opencode one board, live threads, terminals and pull requests. It runs on your own machine, and you open it from any browser.",
	repoUrl: "https://github.com/rabtx/grid",
	docsUrl: "https://github.com/rabtx/grid/blob/main/apps/docs/content/docs/portable.mdx",
	signInUrl: CONSOLE_URL ? `${CONSOLE_URL}/login` : null,
} as const;

/** The installer this site serves (app/install.sh/route.ts). */
export const INSTALL_URL = `${SITE_URL}/install.sh`;

export const INSTALLS = [
	{
		id: "grid",
		label: "Grid",
		title: "Run Grid",
		command: `curl -fsSL ${INSTALL_URL} | bash`,
		summary: "The whole of Grid on this machine, behind one port.",
		steps: [
			"Installs Bun if it is missing",
			"Downloads Grid to ~/.grid",
			"Starts it on port 8080 as a user service",
			"Prints a link that creates your account",
		],
		needs: "Linux or macOS, with git",
	},
	{
		id: "runner",
		label: "Runner only",
		title: "Add a machine",
		command: `curl -fsSL ${INSTALL_URL} | bash -s -- runner`,
		summary: "A VPS, a Codespace or a second laptop, driven from the Grid you already run.",
		steps: [
			"Downloads only the runner, about 10 MB",
			"Listens on your Tailscale network and nowhere else",
			"Prints its address and a one-time pairing code",
			"Add both in Settings → Environments on your Grid",
		],
		needs: "Linux or macOS, with git and Tailscale",
	},
] as const;

export type Install = (typeof INSTALLS)[number];

/** What `grid` does once installed (scripts/bash/grid.sh). */
export const COMMANDS = [
	["grid status", "Whether it is running, and where"],
	["grid logs", "Follow its log"],
	["grid pair", "A pairing code for another Grid"],
	["grid update", "Update to the latest version"],
	["grid uninstall", "Remove it; your data stays unless you add --purge"],
] as const;

/** What the console does today. Each one is in apps/console and apps/runner now. */
export const FEATURES = [
	{
		id: "board",
		title: "One board",
		body: "Tasks for people and agents side by side. Hand a card to an agent and follow it through review.",
	},
	{
		id: "threads",
		title: "Agent threads",
		body: "Chat with any agent in a project. See each command it runs and each file it changes, and answer what it asks.",
	},
	{
		id: "terminals",
		title: "Terminals and files",
		body: "Real terminals and a file browser for every project. A shell keeps running when your phone locks.",
	},
	{
		id: "pulls",
		title: "Pull requests",
		body: "Read the diffs, checks and comments on your GitHub pull requests without leaving Grid.",
	},
	{
		id: "machines",
		title: "Your machines",
		body: "Pair a VPS, a Codespace or another laptop, and choose for each project where its work runs.",
	},
	{
		id: "phone",
		title: "On your phone",
		body: "Install Grid as an app. A push notification tells you when an agent needs an answer.",
	},
] as const;

/** Agents the runner drives today (apps/runner/src/agents). */
export const AGENTS = [
	"Claude Code",
	"Codex",
	"opencode",
	"Gemini",
	"Antigravity",
	"Any ACP agent",
] as const;

export const PERMISSIONS = [
	"Read files",
	"Edit files",
	"Run commands",
	"Install packages",
	"Use the network",
] as const;

export const PRINCIPLES = [
	{
		id: "yours",
		title: "On your machines",
		body: "Grid and your code stay on hardware you choose: a laptop, a VPS or a Codespace. The browser is only the screen.",
	},
	{
		id: "any-agent",
		title: "Any agent",
		body: "No model provider is built in. Grid drives the agent CLIs you already use, signed in with your own accounts.",
	},
	{
		id: "portable",
		title: "Easy to move",
		body: "Grid keeps its database, threads and settings in one data folder, so it can move to another machine.",
	},
	{
		id: "open",
		title: "Open source",
		body: "MIT or Apache-2.0. Read the code, run it, change it.",
	},
] as const;
