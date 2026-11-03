import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Setting an agent up on a machine from Grid: its vendor's own installer, sign-in and update, and
 * a quick check of who is signed in. Grid runs install, sign-in and update in a terminal on that
 * machine, so every sign-in style works as its vendor intends (a browser link, a device code, a
 * code pasted back) and the person sees exactly what runs.
 */
export type AgentSetup = {
	/** The vendor's documented install command, when there is one to run. */
	install?: string;
	/** The agent's own sign-in, meant for terminals without a browser where it can be. */
	signIn?: string;
	/** The agent's own update to its latest version. */
	update?: string;
	/** Whether the agent can work without signing in (opencode's free models). */
	signInOptional?: boolean;
	/** Where to read more, shown when Grid cannot install it. */
	docs: string;
	/** Signed in or not (null when the agent gives no way to tell), and as whom when it says. */
	status?: () => Promise<AgentStatus>;
};

export type AgentStatus = { signedIn: boolean | null; account?: string | null };

export type SetupStep = "install" | "sign-in" | "update";

async function run(
	command: string[],
	timeoutMs = 8_000,
): Promise<{ code: number; output: string }> {
	try {
		// The environment is passed so a PATH extended at start-up (`withAgentBins`) is searched.
		const child = Bun.spawn(command, {
			env: { ...process.env, NO_COLOR: "1" },
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

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** `claude auth status --json`: logged in, and the account's email or organisation. */
export function claudeStatus(output: string, code: number): AgentStatus {
	try {
		const status = JSON.parse(output) as { loggedIn?: unknown; email?: unknown; orgName?: unknown };
		const signedIn = status.loggedIn === true;
		const account = typeof status.email === "string" ? status.email : status.orgName;
		return { signedIn, account: signedIn && typeof account === "string" ? account : null };
	} catch {
		return { signedIn: code === 127 ? null : false };
	}
}

/** `codex login status`: exits 0 when signed in, saying how ("Logged in using ChatGPT"). */
export function codexStatus(output: string, code: number): AgentStatus {
	if (code === 127) return { signedIn: null };
	const line =
		output
			.split("\n")
			.find((text) => text.trim())
			?.trim() ?? null;
	return { signedIn: code === 0, account: code === 0 ? line : null };
}

/**
 * `opencode auth list`: opencode 1 counts its credentials; opencode 2 lists one provider a row
 * ("OpenCode Console  Default  stored"). Its providers are the account.
 */
export function opencodeStatus(output: string): AgentStatus {
	const count = output.match(/(\d+) credentials?/)?.[1];
	const names = output
		.split("\n")
		.map((line) => line.replace(/[│┌└●◇◆○]/g, "").trim())
		.filter((line) => /\S\s{2,}\S/.test(line))
		.map((line) => line.split(/\s{2,}/)[0] ?? "")
		.filter((name) => name && !/^(provider|name)$/i.test(name));
	if (count !== undefined)
		return { signedIn: Number(count) > 0, account: names.length ? names.join(", ") : null };
	return names.length ? { signedIn: true, account: names.join(", ") } : { signedIn: null };
}

/** `cursor-agent status` (`--format json` where it can): signed in, and the account's email. */
export function cursorStatus(output: string, code: number): AgentStatus {
	if (code === 127) return { signedIn: null };
	try {
		const status = JSON.parse(output) as Record<string, unknown>;
		const flag = status.isAuthenticated ?? status.authenticated ?? status.loggedIn;
		const email = [status.email, status.userEmail, status.account].find(
			(value): value is string => typeof value === "string" && value.length > 0,
		);
		if (typeof flag === "boolean")
			return { signedIn: flag, account: flag ? (email ?? null) : null };
		if (email) return { signedIn: true, account: email };
	} catch {
		// Text, from a version without --format json.
	}
	if (/not (logged|signed) in|unauthenticated|not authenticated/i.test(output))
		return { signedIn: false };
	const email = output.match(EMAIL)?.[0] ?? null;
	if (email || /logged in|signed in|authenticated/i.test(output))
		return { signedIn: true, account: email };
	return { signedIn: code === 0 ? null : false };
}

/** Antigravity has no status command; `agy models` answers only for a signed-in session. */
export function agyStatus(output: string, code: number): AgentStatus {
	if (code === 127) return { signedIn: null };
	if (code === 0 && output.trim())
		return { signedIn: true, account: output.match(EMAIL)?.[0] ?? null };
	return /sign|log ?in|auth|credential/i.test(output) ? { signedIn: false } : { signedIn: null };
}

/**
 * `grok models` says whether it is signed in ("You are logged in", "Not logged in") without
 * starting the agent. An expired token prints the logged-out line and is refreshed in the same
 * run, so a "no" is asked once more before it counts (as t3code does).
 */
export function grokStatus(output: string, code: number): AgentStatus {
	if (code === 127) return { signedIn: null };
	if (/you are logged in/i.test(output)) return { signedIn: true, account: "Grok account" };
	if (/not authenticated|not logged in/i.test(output)) return { signedIn: false };
	return { signedIn: null };
}

export const AGENT_SETUP: Record<string, AgentSetup> = {
	claude: {
		install: "curl -fsSL https://claude.ai/install.sh | bash",
		// Prints a link; after signing in, paste the code it shows back into this terminal.
		signIn: "claude auth login",
		update: "claude update",
		docs: "https://code.claude.com/docs/en/setup",
		async status() {
			const result = await run(["claude", "auth", "status", "--json"]);
			return claudeStatus(result.output, result.code);
		},
	},
	codex: {
		install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
		// Device-code sign-in: made for machines without a local browser.
		signIn: "codex login --device-auth",
		// The installer replaces Codex with its latest release.
		update: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
		docs: "https://github.com/openai/codex",
		async status() {
			const result = await run(["codex", "login", "status"]);
			return codexStatus(result.output, result.code);
		},
	},
	opencode: {
		install: "curl -fsSL https://opencode.ai/install | bash",
		signIn: "opencode auth login",
		update: "opencode upgrade",
		signInOptional: true,
		docs: "https://opencode.ai/docs",
		async status() {
			return opencodeStatus((await run(["opencode", "auth", "list"])).output);
		},
	},
	cursor: {
		install: "curl https://cursor.com/install -fsS | bash",
		// Prints the sign-in link instead of opening a browser on the machine.
		signIn: "NO_OPEN_BROWSER=1 cursor-agent login",
		update: "cursor-agent update",
		docs: "https://cursor.com/docs/cli/overview",
		async status() {
			const result = await run(["cursor-agent", "status", "--format", "json"]);
			return cursorStatus(result.output, result.code);
		},
	},
	grok: {
		install: "curl -fsSL https://x.ai/cli/install.sh | bash",
		// Device-code sign-in: a link and a code to enter on any device.
		signIn: "grok login --device-auth",
		update: "grok update",
		docs: "https://x.ai/cli",
		async status() {
			const first = grokStatus((await run(["grok", "models"], 20_000)).output, 0);
			if (first.signedIn !== false) return first;
			const again = await run(["grok", "models"], 20_000);
			const second = grokStatus(again.output, again.code);
			return second.signedIn === null ? first : second;
		},
	},
	antigravity: {
		install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
		// `agy` signs in when it first starts; on a machine without a browser it prints a link and
		// takes the code back here. Quit it once it is signed in.
		signIn: "agy",
		update: "agy update",
		docs: "https://antigravity.google",
		async status() {
			const result = await run(["agy", "models"], 20_000);
			return agyStatus(result.output, result.code);
		},
	},
};

const STATUS_MS = 30_000;
const statuses = new Map<string, { at: number; status: Promise<AgentStatus> }>();

/** An installed agent's sign-in status, asked at most every 30 seconds (some checks are slow). */
export function agentStatus(agent: string, fresh = false): Promise<AgentStatus> {
	const setup = AGENT_SETUP[agent];
	if (!setup?.status) return Promise.resolve({ signedIn: null });
	const kept = statuses.get(agent);
	if (!fresh && kept && Date.now() - kept.at < STATUS_MS) return kept.status;
	const status = setup.status().catch((): AgentStatus => ({ signedIn: null }));
	statuses.set(agent, { at: Date.now(), status });
	return status;
}

/** The command a setup step runs, or null when Grid has none for that agent. */
export function setupCommand(agent: string, step: SetupStep): string | null {
	const setup = AGENT_SETUP[agent];
	const command = { install: setup?.install, "sign-in": setup?.signIn, update: setup?.update }[
		step
	];
	return command ?? null;
}

/**
 * Where these installers put their programs. The runner looks there too, so an agent installed
 * from Grid is found (and runs) at once, without a restart or a shell profile change.
 */
export function withAgentBins(path: string | undefined, home = homedir()): string {
	const bins = [".local/bin", ".opencode/bin", ".bun/bin", ".npm-global/bin", ".grok/bin"].map(
		(dir) => join(home, dir),
	);
	const current = (path ?? "").split(delimiter).filter(Boolean);
	return [...current, ...bins.filter((bin) => !current.includes(bin))].join(delimiter);
}
