import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { Environment } from "../environments/registry";
import type { Gh } from "./gh";

/**
 * GitHub Codespaces from Grid: sign in with GitHub, list, create, start and stop Codespaces, and
 * connect one as an environment in one step. `gh` holds the GitHub sign-in for the machine; the
 * first Grid user to use it claims it, and only they can drive it from Grid.
 */

export class GitHubError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "GitHubError";
	}
}

export type GitHubStatus = {
	/** Whether `gh` is installed where the runner runs. */
	installed: boolean;
	/** The GitHub account `gh` is signed in to here, if any. */
	login: string | null;
	/** Whether that sign-in may manage Codespaces (the `codespace` scope). */
	canManageCodespaces: boolean;
	/** Who in Grid uses it: this person, someone else, or nobody yet. */
	claimedBy: "you" | "someone-else" | null;
	/** A sign-in waiting for the person to enter this code on github.com. */
	pending: { code: string; url: string } | null;
	error: string | null;
};

export type Codespace = {
	name: string;
	displayName: string;
	repository: string;
	state: string;
	machine: string;
	lastUsedAt: string;
	/** The environment it is paired as, if any. */
	environment: string | null;
	/** Where a connection in progress has got to, or why it stopped. */
	connecting: { step: string; error: string | null } | null;
};

/** What Grid needs from the rest of the runner to connect a Codespace. */
export type CodespaceHooks = {
	/** The workspace's environments. */
	environments: (workspace: string) => Environment[];
	/** Pair one as an environment of the workspace. */
	pair: (
		workspace: string,
		input: { url: string; code: string; label: string; codespace: string },
	) => Promise<Environment>;
};

const DEVICE_URL = "https://github.com/login/device";
const NAME = /^[\w-]{1,100}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
const BRANCH = /^[\w./-]{1,200}$/;

export class CodespacesLink {
	private readonly db: Database;
	private installed: boolean | null = null;
	private pending: {
		ownerId: string;
		code: string | null;
		error: string | null;
		kill: () => void;
	} | null = null;
	private readonly jobs = new Map<
		string,
		{ ownerId: string; step: string; error: string | null }
	>();

	constructor(
		path: string,
		private readonly gh: Gh,
		private readonly hooks: CodespaceHooks,
		private readonly sleep: (ms: number) => Promise<void> = Bun.sleep,
	) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS github_link (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				owner_id TEXT NOT NULL,
				login TEXT NOT NULL
			);
		`);
	}

	private claim(): { ownerId: string; login: string } | null {
		const row = this.db
			.query<{ owner_id: string; login: string }, []>(
				"SELECT owner_id, login FROM github_link WHERE id = 1",
			)
			.get();
		return row ? { ownerId: row.owner_id, login: row.login } : null;
	}

	private async auth(): Promise<{ login: string | null; scopes: string[] }> {
		const result = await this.gh.run(["auth", "status", "--hostname", "github.com"], {
			timeoutMs: 15_000,
		});
		const text = `${result.stdout}\n${result.stderr}`;
		const login = result.code === 0 ? (text.match(/account (\S+)/)?.[1] ?? null) : null;
		const scopes = [...(text.match(/Token scopes: (.*)/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
			(match) => match[1],
		);
		return { login, scopes };
	}

	async status(ownerId: string): Promise<GitHubStatus> {
		this.installed ??= (await this.gh.run(["--version"], { timeoutMs: 10_000 })).code === 0;
		const claim = this.claim();
		const base = {
			installed: this.installed,
			claimedBy: claim
				? claim.ownerId === ownerId
					? ("you" as const)
					: ("someone-else" as const)
				: null,
			pending:
				this.pending?.ownerId === ownerId && this.pending.code
					? { code: this.pending.code, url: DEVICE_URL }
					: null,
			error: this.pending?.ownerId === ownerId ? this.pending.error : null,
		};
		if (!this.installed) return { ...base, login: null, canManageCodespaces: false };
		const { login, scopes } = await this.auth();
		return { ...base, login, canManageCodespaces: scopes.includes("codespace") };
	}

	/**
	 * Connect Grid to GitHub. A machine already signed in (with the Codespaces scope) is simply
	 * claimed; otherwise this starts GitHub's device sign-in and returns the code to enter on
	 * github.com. The sign-in finishes on its own once the person approves it there.
	 */
	async signIn(ownerId: string): Promise<GitHubStatus> {
		const claim = this.claim();
		if (claim && claim.ownerId !== ownerId) {
			throw new GitHubError("Someone else in this Grid has connected GitHub here", 403);
		}
		if (this.pending?.ownerId === ownerId && this.pending.code) return this.status(ownerId);
		const { login, scopes } = await this.auth();
		if (login && scopes.includes("codespace")) {
			this.bind(ownerId, login);
			return this.status(ownerId);
		}
		this.pending?.kill();
		const args = login
			? ["auth", "refresh", "--hostname", "github.com", "--scopes", "codespace"]
			: [
					"auth",
					"login",
					"--hostname",
					"github.com",
					"--git-protocol",
					"https",
					"--web",
					"--scopes",
					"codespace",
					"--skip-ssh-key",
				];
		const child = this.gh.spawn(args);
		const flow = {
			ownerId,
			code: null as string | null,
			error: null as string | null,
			kill: child.kill,
		};
		this.pending = flow;
		const codeSeen = new Promise<void>((resolve) => {
			let seen = "";
			child.output((text) => {
				seen += text;
				const code = seen.match(/code[^A-Z0-9]*([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
				if (code && !flow.code) {
					flow.code = code;
					resolve();
				}
			});
			void child.exited.then(() => resolve());
		});
		void child.exited.then(async (code) => {
			if (this.pending !== flow) return;
			if (code === 0) {
				const signedIn = await this.auth();
				if (signedIn.login) this.bind(ownerId, signedIn.login);
				this.pending = null;
			} else {
				flow.code = null;
				flow.error = "GitHub sign-in did not finish. Try again.";
			}
		});
		await Promise.race([codeSeen, this.sleep(20_000)]);
		if (!flow.code && !flow.error)
			flow.error = "GitHub did not hand out a sign-in code. Try again.";
		return this.status(ownerId);
	}

	/**
	 * Stop using GitHub from Grid. The machine's own `gh` sign-in stays as it is: it may be the
	 * person's CLI login too.
	 */
	signOut(ownerId: string): void {
		this.assertOwner(ownerId);
		if (this.pending?.ownerId === ownerId) {
			this.pending.kill();
			this.pending = null;
		}
		this.db.query("DELETE FROM github_link WHERE id = 1").run();
	}

	private bind(ownerId: string, login: string): void {
		this.db
			.query(
				"INSERT INTO github_link (id, owner_id, login) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET login = excluded.login",
			)
			.run(ownerId, login);
	}

	/** Throws unless this person is the one who connected GitHub here. */
	assertOwner(ownerId: string): void {
		const claim = this.claim();
		if (!claim) throw new GitHubError("Connect GitHub first", 409);
		if (claim.ownerId !== ownerId) {
			throw new GitHubError("Someone else in this Grid has connected GitHub here", 403);
		}
	}

	private async ghJson<T>(args: string[], timeoutMs = 60_000): Promise<T> {
		const result = await this.gh.run(args, { timeoutMs });
		if (result.code !== 0) throw new GitHubError(firstLine(result.stderr) || "GitHub said no", 502);
		try {
			return JSON.parse(result.stdout) as T;
		} catch {
			throw new GitHubError("GitHub's answer could not be read", 502);
		}
	}

	/** The signed-in person's Codespaces, with which of them are the workspace's environments. */
	async list(ownerId: string, workspace: string): Promise<Codespace[]> {
		this.assertOwner(ownerId);
		const rows = await this.ghJson<
			{
				name: string;
				displayName: string;
				repository: string;
				state: string;
				machineName: string;
				lastUsedAt: string;
			}[]
		>(["codespace", "list", "--json", "name,displayName,repository,state,machineName,lastUsedAt"]);
		const paired = new Map(
			this.hooks
				.environments(workspace)
				.filter((environment) => environment.codespace)
				.map((environment) => [environment.codespace as string, environment.id]),
		);
		return rows.map((row) => {
			const job = this.jobs.get(row.name);
			return {
				name: row.name,
				displayName: row.displayName || row.name,
				repository: row.repository,
				state: row.state,
				machine: row.machineName,
				lastUsedAt: row.lastUsedAt,
				environment: paired.get(row.name) ?? null,
				connecting: job?.ownerId === ownerId ? { step: job.step, error: job.error } : null,
			};
		});
	}

	async start(ownerId: string, name: string): Promise<void> {
		this.assertOwner(ownerId);
		checkName(name);
		await this.ghJson(["api", "--method", "POST", `user/codespaces/${name}/start`]);
	}

	async stop(ownerId: string, name: string): Promise<void> {
		this.assertOwner(ownerId);
		checkName(name);
		const result = await this.gh.run(["codespace", "stop", "--codespace", name], {
			timeoutMs: 120_000,
		});
		if (result.code !== 0)
			throw new GitHubError(firstLine(result.stderr) || "Could not stop it", 502);
	}

	/** A new Codespace on a repository (and branch), on the smallest machine it offers. */
	async create(ownerId: string, input: { repository: string; branch?: string }): Promise<string> {
		this.assertOwner(ownerId);
		if (!REPO.test(input.repository))
			throw new GitHubError("Give the repository as owner/name", 400);
		if (input.branch && !BRANCH.test(input.branch))
			throw new GitHubError("That branch name is not valid", 400);
		const machines = await this.ghJson<{ machines: { name: string; cpus: number }[] }>([
			"api",
			`repos/${input.repository}/codespaces/machines`,
		]);
		const machine = [...machines.machines].sort((a, b) => a.cpus - b.cpus)[0]?.name;
		if (!machine) throw new GitHubError("That repository offers no Codespaces machines", 409);
		const args = ["codespace", "create", "--repo", input.repository, "--machine", machine];
		if (input.branch) args.push("--branch", input.branch);
		const result = await this.gh.run(args, { timeoutMs: 15 * 60_000 });
		const name = result.stdout.trim().split("\n").at(-1)?.trim() ?? "";
		if (result.code !== 0 || !NAME.test(name)) {
			throw new GitHubError(firstLine(result.stderr) || "GitHub did not create the Codespace", 502);
		}
		return name;
	}

	/**
	 * Connect a Codespace as an environment, in the background: start it, wait until it is up,
	 * ask Grid inside it for a pairing code over GitHub's own SSH channel, and pair. Progress
	 * shows on the Codespace in `list`.
	 */
	connect(ownerId: string, workspace: string, name: string): void {
		this.assertOwner(ownerId);
		checkName(name);
		const running = this.jobs.get(name);
		if (running && !running.error) return;
		const job = { ownerId, step: "Starting the Codespace…", error: null as string | null };
		this.jobs.set(name, job);
		void this.runConnect(workspace, name, job).then(
			() => this.jobs.delete(name),
			(cause: unknown) => {
				job.error = cause instanceof Error ? cause.message : "Could not connect it";
			},
		);
	}

	private async runConnect(
		workspace: string,
		name: string,
		job: { step: string; error: string | null },
	): Promise<void> {
		const info = await this.ghJson<{
			state: string;
			repository: { name: string };
			display_name: string;
		}>(["api", `user/codespaces/${name}`]);
		if (info.state !== "Available") {
			await this.ghJson(["api", "--method", "POST", `user/codespaces/${name}/start`]).catch(
				() => undefined,
			);
			for (let tries = 0; ; tries++) {
				const state = (await this.ghJson<{ state: string }>(["api", `user/codespaces/${name}`]))
					.state;
				if (state === "Available") break;
				if (tries > 72) throw new GitHubError("The Codespace did not start in six minutes", 504);
				await this.sleep(5_000);
			}
		}

		// Grid inside starts a little after the Codespace does, then joins the tailnet: ask until
		// it answers, for a few minutes.
		job.step = "Waiting for Grid inside it…";
		const folder = `/workspaces/${info.repository.name}`;
		for (let tries = 0; ; tries++) {
			const result = await this.gh.run(
				[
					"codespace",
					"ssh",
					"--codespace",
					name,
					"--",
					`cd ${shellQuote(folder)} && GRID_PAIRING=1 bun run grid:pair`,
				],
				{ timeoutMs: 120_000 },
			);
			const output = `${result.stdout}\n${result.stderr}`;
			const code = output.match(/Pairing code: ([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
			const url = output.match(/Address: (\S+)/)?.[1];
			if (code && url) {
				job.step = "Pairing…";
				await this.hooks.pair(workspace, {
					url,
					code,
					label: info.display_name || name,
					codespace: name,
				});
				return;
			}
			if (/not on a tailnet/.test(output) && tries >= 6) {
				throw new GitHubError(
					"The Codespace is not on your tailnet. Add a TS_AUTH_KEY Codespaces secret and rebuild it.",
					409,
				);
			}
			if (/Missing script|grid:pair/.test(output) && /error: /i.test(output) && tries >= 2) {
				throw new GitHubError(
					"This Codespace has no Grid in it: open one on the Grid repository",
					409,
				);
			}
			if (tries > 18) throw new GitHubError("Grid inside the Codespace did not answer", 504);
			await this.sleep(10_000);
		}
	}
}

function checkName(name: string): void {
	if (!NAME.test(name)) throw new GitHubError("That is not a Codespace name", 400);
}

function shellQuote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}

function firstLine(text: string): string {
	return text.trim().split("\n")[0]?.trim() ?? "";
}
