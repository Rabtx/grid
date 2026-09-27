import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Setting an agent up on a machine from Grid: its vendor's own installer, its own sign-in, and a
 * quick check of whether it is signed in. Grid runs install and sign-in in a terminal on that
 * machine, so every sign-in style works as its vendor intends (a browser link, a device code, a
 * code pasted back) and the person sees exactly what runs.
 */
export type AgentSetup = {
	/** The vendor's documented install command, when there is one to run. */
	install?: string;
	/** The agent's own sign-in, meant for terminals without a browser where it can be. */
	signIn?: string;
	/** Whether the agent can work without signing in (opencode's free models). */
	signInOptional?: boolean;
	/** Where to read more, shown when Grid cannot install it. */
	docs: string;
	/** Signed in or not; null when the agent gives no way to tell. */
	signedIn?: () => Promise<boolean | null>;
};

export type SetupStep = "install" | "sign-in";

async function run(
	command: string[],
	timeoutMs = 8_000,
): Promise<{ code: number; output: string }> {
	try {
		// The environment is passed so a PATH extended at start-up (`withAgentBins`) is searched.
		const child = Bun.spawn(command, {
			env: process.env,
			stdout: "pipe",
			stderr: "pipe",
			stdin: "ignore",
		});
		const timer = setTimeout(() => child.kill(), timeoutMs);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		clearTimeout(timer);
		return { code, output: `${stdout}\n${stderr}` };
	} catch {
		return { code: 127, output: "" };
	}
}

export const AGENT_SETUP: Record<string, AgentSetup> = {
	claude: {
		install: "curl -fsSL https://claude.ai/install.sh | bash",
		// Prints a link; after signing in, paste the code it shows back into this terminal.
		signIn: "claude auth login",
		docs: "https://code.claude.com/docs/en/setup",
		async signedIn() {
			const result = await run(["claude", "auth", "status", "--json"]);
			try {
				return (JSON.parse(result.output) as { loggedIn?: unknown }).loggedIn === true;
			} catch {
				return result.code === 127 ? null : false;
			}
		},
	},
	codex: {
		install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
		// Device-code sign-in: made for machines without a local browser.
		signIn: "codex login --device-auth",
		docs: "https://github.com/openai/codex",
		async signedIn() {
			const result = await run(["codex", "login", "status"]);
			return result.code === 127 ? null : result.code === 0;
		},
	},
	opencode: {
		install: "curl -fsSL https://opencode.ai/install | bash",
		signIn: "opencode auth login",
		signInOptional: true,
		docs: "https://opencode.ai/docs",
		async signedIn() {
			const result = await run(["opencode", "auth", "list"]);
			const count = result.output.match(/(\d+) credentials?/)?.[1];
			return count === undefined ? null : Number(count) > 0;
		},
	},
	antigravity: { docs: "https://antigravity.google" },
	freebuff: {
		install: "npm install -g freebuff",
		signIn: "freebuff login",
		docs: "https://freebuff.com",
	},
};

/** The command a setup step runs, or null when Grid has none for that agent. */
export function setupCommand(agent: string, step: SetupStep): string | null {
	const setup = AGENT_SETUP[agent];
	return (step === "install" ? setup?.install : setup?.signIn) ?? null;
}

/**
 * Where these installers put their programs. The runner looks there too, so an agent installed
 * from Grid is found (and runs) at once, without a restart or a shell profile change.
 */
export function withAgentBins(path: string | undefined, home = homedir()): string {
	const bins = [".local/bin", ".opencode/bin", ".bun/bin", ".npm-global/bin"].map((dir) =>
		join(home, dir),
	);
	const current = (path ?? "").split(delimiter).filter(Boolean);
	return [...current, ...bins.filter((bin) => !current.includes(bin))].join(delimiter);
}
