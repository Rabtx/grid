import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

/**
 * Sandboxed runs: a thread's agent in a throwaway Docker container instead of on this machine
 * itself. The container sees the thread's folder (its git repository, so commits work), the
 * agent's own sign-in and settings, and Grid's tools; nothing else of the machine. It shares the
 * machine's network, so the agent reaches its provider and Grid, and it is removed when the
 * agent's process ends: the next turn starts a fresh one.
 *
 * The agent's command is run by name from the image (`claude`, `codex`): the image has to have
 * it. Grid's image (`docker/sandbox/Dockerfile`) has Claude Code, Codex and OpenCode.
 */

/** How one agent process runs in a container. */
export type Sandbox = {
	image: string;
	/** The container's name, unique to this process: what removes it if the client is killed. */
	name: string;
	/** Folders and files of this machine the container sees, at the same paths. */
	mounts: { path: string; readOnly: boolean }[];
	/** Who the agent runs as in the container: the runner's own user, so files stay theirs. */
	user: string | null;
	home: string;
};

/** Grid's own image, built on the machine with `bun run sandbox:build`. */
export const DEFAULT_SANDBOX_IMAGE = "grid-sandbox";

/** Where each agent keeps its sign-in and settings, under the person's home. */
const AGENT_STATE = [
	".claude",
	".claude.json",
	".codex",
	".config/opencode",
	".local/share/opencode",
];
/** What git needs to commit as the person, read-only. */
const READ_ONLY_STATE = [".gitconfig", ".config/git", ".config/gh"];

const exists = (path: string) => {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
};

const git = (cwd: string, args: string[]): string | null => {
	try {
		const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });
		return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
	} catch {
		return null;
	}
};

/**
 * What a thread's agent process sees in its container: its repository (or folder), the
 * repository's git folder when that lives elsewhere (a worktree's), the agent's state, the
 * runner (Bun and Grid's tools, which the agent starts as an MCP server) and any folder its
 * environment points at (a provider account's own settings folder).
 */
export function sandboxFor(input: {
	image: string;
	cwd: string;
	env?: Record<string, string>;
	home?: string;
	/** Files and folders of the runner the agent's MCP servers run from. */
	runner?: string[];
}): Sandbox {
	const home = input.home ?? homedir();
	const mounts = new Map<string, boolean>();
	const add = (path: string, readOnly: boolean) => {
		if (!isAbsolute(path) || !exists(path)) return;
		const real = realpathSync(path);
		// Writable wins: a folder needed both ways is mounted to write.
		mounts.set(real, (mounts.get(real) ?? true) && readOnly);
		if (real !== path) mounts.set(path, (mounts.get(path) ?? true) && readOnly);
	};
	add(git(input.cwd, ["rev-parse", "--show-toplevel"]) ?? input.cwd, false);
	const common = git(input.cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	if (common) add(common, false);
	for (const name of AGENT_STATE) add(join(home, name), false);
	for (const name of READ_ONLY_STATE) add(join(home, name), true);
	for (const path of input.runner ?? []) add(path, true);
	for (const value of Object.values(input.env ?? {}))
		if (isAbsolute(value) && exists(value) && statSync(value).isDirectory()) add(value, false);
	const uid = process.getuid?.();
	const gid = process.getgid?.();
	return {
		image: input.image,
		name: `grid-${crypto.randomUUID().slice(0, 12)}`,
		mounts: [...mounts].map(([path, readOnly]) => ({ path, readOnly })),
		user: uid === undefined || gid === undefined ? null : `${uid}:${gid}`,
		home,
	};
}

/**
 * The `docker run` that runs `command` in `sandbox`. The agent's environment goes by name only
 * (`-e NAME`, its value taken from the docker client's own), so no secret is on a command line.
 */
/**
 * What of the runner's own environment an agent in a container still gets, when it is set: the
 * providers' keys and addresses, GitHub's token, and the proxy the machine goes out through.
 */
export const PASSED_ENV = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CLAUDE_CONFIG_DIR",
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
	"CODEX_HOME",
	"GH_TOKEN",
	"GITHUB_TOKEN",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"TZ",
	"LANG",
];

export function sandboxCommand(
	command: readonly string[],
	options: {
		cwd: string;
		env?: Record<string, string>;
		/** The runner's own variables that are set, of `PASSED_ENV`. */
		inherited?: readonly string[];
	},
	sandbox: Sandbox,
	docker = "docker",
): string[] {
	const [binary, ...args] = command;
	const run = [
		docker,
		"run",
		"--rm",
		"-i",
		"--name",
		sandbox.name,
		"--network",
		"host",
		"--workdir",
		options.cwd,
		// An empty home of its own to write in (caches, history), under what is mounted into it.
		"--tmpfs",
		`${sandbox.home}:rw,exec,mode=1777`,
		"-e",
		`HOME=${sandbox.home}`,
		"-e",
		"NO_COLOR",
	];
	if (sandbox.user) run.push("--user", sandbox.user);
	const names = new Set([...(options.inherited ?? []), ...Object.keys(options.env ?? {})]);
	for (const name of names)
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name !== "HOME" && name !== "NO_COLOR")
			run.push("-e", name);
	for (const mount of sandbox.mounts)
		run.push("-v", `${mount.path}:${mount.path}${mount.readOnly ? ":ro" : ""}`);
	// The agent the image has, by name: this machine's binary may not run there.
	run.push(sandbox.image, basename(binary ?? ""), ...args);
	return run;
}

/** Remove a sandbox's container, if it is still there (its client was killed, say). */
export function removeSandbox(sandbox: Sandbox, docker = "docker"): void {
	try {
		Bun.spawn([docker, "rm", "-f", sandbox.name], { stdout: "ignore", stderr: "ignore" });
	} catch (cause) {
		console.warn(
			"[sandbox] could not remove",
			sandbox.name,
			cause instanceof Error ? cause.message : cause,
		);
	}
}

export type SandboxStatus = {
	/** Docker answers on this machine. */
	available: boolean;
	/** Why not, in words, when it does not. */
	reason: string | null;
	image: string;
	/** The image is on this machine already (null when Docker is not there to say). */
	imageReady: boolean | null;
};

/** Docker on this machine, as the Sandbox settings show it, and the image threads use. */
export class Sandboxes {
	private known: { at: number; status: SandboxStatus } | null = null;

	constructor(
		private readonly options: {
			image?: () => string | null;
			docker?: string;
			/** The runner's files the agents' MCP servers run from (Bun, Grid's tools). */
			runner?: string[];
		} = {},
	) {}

	get docker(): string {
		return this.options.docker ?? process.env.GRID_DOCKER ?? "docker";
	}

	image(): string {
		return this.options.image?.() || process.env.GRID_SANDBOX_IMAGE || DEFAULT_SANDBOX_IMAGE;
	}

	/** Whether Docker answers, asked at most every 30 seconds. */
	status(fresh = false): SandboxStatus {
		if (!fresh && this.known && Date.now() - this.known.at < 30_000) return this.known.status;
		const image = this.image();
		let status: SandboxStatus;
		try {
			const info = Bun.spawnSync([this.docker, "version", "--format", "{{.Server.Version}}"], {
				env: process.env,
				stdout: "pipe",
				stderr: "pipe",
				timeout: 10_000,
			});
			if (info.exitCode !== 0) {
				const said = info.stderr.toString().trim().split("\n")[0] ?? "";
				status = {
					available: false,
					reason: said
						? `Docker is not running here: ${said.slice(0, 200)}`
						: "Docker is not running on this machine",
					image,
					imageReady: null,
				};
			} else {
				const inspect = Bun.spawnSync([this.docker, "image", "inspect", image], {
					stdout: "ignore",
					stderr: "ignore",
					timeout: 10_000,
				});
				status = { available: true, reason: null, image, imageReady: inspect.exitCode === 0 };
			}
		} catch {
			status = {
				available: false,
				reason: "Docker is not installed on this machine",
				image,
				imageReady: null,
			};
		}
		this.known = { at: Date.now(), status };
		return status;
	}

	/** How a thread's agent runs, for one process. */
	plan(image: string, cwd: string, env?: Record<string, string>): Sandbox {
		return sandboxFor({ image, cwd, env, runner: this.options.runner });
	}
}

/** The runner's own files an agent in a sandbox needs: Bun, and the folder Grid's tools are in. */
export function runnerFiles(): string[] {
	return [process.execPath, join(import.meta.dir, "..", "chat")];
}
