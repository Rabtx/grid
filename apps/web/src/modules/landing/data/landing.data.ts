/**
 * Copy for the landing page. Kept as data so the sections stay presentational and
 * the wording can be reviewed in one place. Everything here has to stay true of
 * the repository as it actually is — no invented customers, metrics or features.
 */

export const SITE = {
	name: "Grid",
	tagline: "An AI-native operating system for building and running a startup",
	summary:
		"Grid brings projects, agents, development, deployment, infrastructure and operations into one browser-accessible control plane. Humans and AI agents are both first-class workers inside it.",
	repoUrl: "https://github.com/shabirkhan-dev/grid",
	docsUrl: "/docs",
	signInUrl: "/login",
	appUrl: "/admin",
} as const;

/** The lifecycle Grid is being built to hold, from the product definition. */
export const LIFECYCLE = [
	"Idea",
	"Research",
	"Requirements",
	"Design",
	"Tasks",
	"Development",
	"Review",
	"QA",
	"Deployment",
	"Monitoring",
	"Incidents",
	"Release",
	"Feedback",
] as const;

export const PRINCIPLES = [
	{
		id: "browser-first",
		title: "Browser first",
		body: "The browser is the interface, not the machine. Execution happens on a host you choose — local, Docker, SSH or a remote VPS — and the same workspace opens from any device.",
	},
	{
		id: "agent-native",
		title: "Agent native",
		body: "Agents are workers, not a chat sidebar. Grid owns the coordination: who holds which task, what they may touch, and what has to pass before work moves on.",
	},
	{
		id: "provider-agnostic",
		title: "Provider agnostic",
		body: "No AI vendor becomes architectural bedrock. An agent runs through whichever provider you point it at, and swapping one out is configuration rather than a rewrite.",
	},
	{
		id: "portable",
		title: "Portable by default",
		body: "The machine is never the product. Projects, tasks, sessions and context outlive the box they ran on, so a dead laptop costs you a reconnect rather than a rebuild.",
	},
] as const;

export const NOT_LIST = [
	"just an IDE",
	"just an agent harness",
	"just a chatbot",
	"just a Kanban board",
	"just a CI dashboard",
	"another wrapper around one model",
] as const;

/**
 * Honest status. Grid is early, and the landing page says so rather than
 * describing the roadmap in the present tense.
 */
export const STATUS = {
	heading: "Where Grid is today",
	body: "Grid is early and open. The engineering spine is real — a Bun and Turborepo monorepo with a Next.js control plane, a NestJS API over Postgres, a shared UI package, a docs site and a full lint, typecheck, test and CI pipeline. You can sign in today, create a project and file tasks on a board; the surfaces that turn those tasks into agent work are next.",
	shipped: ["Projects and tasks", "The board", "Auth, MFA and passkeys", "Docs site"],
	next: ["Agent runs in isolated worktrees", "Review and diff surface", "Ship and operate"],
} as const;

export const INSTALL_STEPS = [
	{
		id: "clone",
		label: "Clone the repository",
		command: "git clone https://github.com/shabirkhan-dev/grid.git\ncd grid",
	},
	{
		id: "install",
		label: "Install dependencies with Bun",
		command: "bun install\nbun run prepare",
	},
	{
		id: "run",
		label: "Start every workspace",
		command: "bun run dev",
	},
] as const;

export const REQUIREMENTS = [
	"Bun 1.3.13",
	"PostgreSQL (or Docker Compose)",
	"Node-compatible system dependencies",
] as const;
