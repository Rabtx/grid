import { existsSync } from "node:fs";

import type { FileDiff } from "../agents/diff";
import type { Who } from "../auth";
import type { ChatHub } from "../chat/hub";
import { agentOf } from "../folders/project-git";
import { runOf } from "../github/fix";
import { pullAgent, splitDiff } from "../github/pulls";
import { may, NOT_ALLOWED } from "../permissions";
import { lastAnswer } from "../pulse/service";
import { githubRepository } from "../pulse/shipping";
import type { PulseStore } from "../pulse/store";
import type { PushMessage } from "../push/notifier";
import {
	type DeployState,
	type Deployment,
	durationOf,
	type EnvironmentGroup,
	type EnvironmentKind,
	environmentKind,
	groupEnvironments,
	hostOf,
	nextVersion,
	versionOf,
} from "./deployments";
import {
	checksSummary,
	logExcerpt,
	type OpenPull,
	type RepoDeployments,
	type ShipCheck,
	type ShipGitHub,
} from "./github";
import {
	type DeployMethod,
	describeMethod,
	detectMethod,
	readWorkflows,
	workflowEnvironments,
} from "./methods";
import {
	type EnvironmentSettings,
	p95,
	type Probe,
	type ShipStore,
	uptime,
	type Watch,
} from "./store";

export type EnvState = "healthy" | "failing" | "deploying" | "down" | "idle";

export type EnvironmentSummary = {
	name: string;
	kind: EnvironmentKind;
	/** What is live: its release tag or short sha. */
	version: string | null;
	sha: string | null;
	state: EnvState;
	url: string | null;
	deployedAt: string | null;
	/** Commits it has that production does not (for staging). */
	ahead: number | null;
};

export type PipelineSummary = {
	/** `main` (the default branch), or a pull request's number. */
	id: string;
	label: string;
	title: string;
	state: "passing" | "failing" | "running" | "none";
	failing: number;
	at: string | null;
	/** A Grid thread is working on its branch. */
	fix: boolean;
};

export type ShipOverview = {
	repository: string;
	defaultBranch: string;
	environments: EnvironmentSummary[];
	previews: { live: number; open: number };
	pipelines: PipelineSummary[];
};

export type HistoryEntry = {
	id: number;
	version: string;
	sha: string;
	title: string;
	author: string;
	agent: string | null;
	at: string;
	seconds: number | null;
	state: DeployState;
	logUrl: string | null;
	canRollback: boolean;
};

export type Promotion = {
	/** Where the commit comes from: staging, or the default branch. */
	from: { name: string; version: string; sha: string; url: string | null };
	/** Commits it adds; null for a first deploy. */
	ahead: number | null;
	commits: { sha: string; title: string; author: string; agent: string | null }[];
	checks: { total: number; passed: number; failed: number; pending: number };
	migrations: string[];
	/** What it goes live as. */
	version: string;
	/** How, in words. */
	method: string;
	/** Grid knows how to promote here. */
	ready: boolean;
};

export type EnvironmentDetail = EnvironmentSummary & {
	repository: string;
	host: string | null;
	deployedBy: string | null;
	health: {
		/** From Pulse's last reading of Sentry. */
		errorRate: { value: number; at: string } | null;
		/** Grid's own checks of the site. */
		p95: number | null;
		uptime: number | null;
		checks: number;
		deploysWeek: number;
	};
	promotion: Promotion | null;
	history: HistoryEntry[];
	watch: Watch | null;
	method: string;
	settings: EnvironmentSettings;
	/** This person may deploy here. */
	allowed: boolean;
};

export type Preview = {
	number: number;
	title: string;
	branch: string;
	url: string | null;
	state: "ready" | "building" | "failed" | "none";
	at: string | null;
	author: string;
	agent: string | null;
	thread: { id: string; title: string; provider: string } | null;
	pullUrl: string;
};

export type PipelineDetail = {
	id: string;
	label: string;
	title: string;
	sha: string;
	branch: string;
	number: number | null;
	url: string;
	author: string;
	agent: string | null;
	at: string | null;
	checks: ShipCheck[];
	summary: { total: number; passed: number; failed: number; pending: number };
	/** The first failing Actions check: why it failed is read with `failureLog`. */
	failing: string | null;
	thread: {
		id: string;
		title: string;
		provider: string;
		busy: boolean;
		reply: string;
		diff: FileDiff[];
		changed: number;
		unpushed: number;
	} | null;
	allowed: { rerun: boolean; push: boolean };
};

export type ShipDeps = {
	chat: ChatHub;
	github: ShipGitHub;
	store: ShipStore;
	/** Pulse's readings: the error rate Sentry gave. */
	pulse?: PulseStore;
	/** Tell someone what a watch did. */
	notify?: (userId: string, message: PushMessage) => void;
	fetcher?: typeof fetch;
};

export class ShipError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "ShipError";
	}
}

const CACHE_MS = 20_000;
const WATCH_MS = 15 * 60_000;
const START_WITHIN_MS = 30 * 60_000;
const PROBE_EVERY_MS = 5 * 60_000;
const MISSES_TO_ROLL_BACK = 3;
const COMMAND_MS = 10 * 60_000;
const MIGRATION = /(^|\/)migrations?\//i;

async function git(
	folder: string,
	args: string[],
): Promise<{ ok: boolean; out: string; err: string }> {
	const child = Bun.spawn(["git", "-C", folder, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { ok: code === 0, out, err };
}

/** A person's command for a host Grid can't drive, run in the project's folder. */
async function runCommand(folder: string, command: string, env: Record<string, string>) {
	const child = Bun.spawn(["sh", "-c", command], {
		cwd: folder,
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		env: { ...process.env, ...env },
	});
	const timer = setTimeout(() => child.kill(), COMMAND_MS);
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	if (code !== 0) {
		const said = (err.trim() || out.trim()).split("\n").at(-1) ?? "";
		throw new ShipError(`The command failed${said ? `: ${said}` : ` (exit ${code})`}`, 502);
	}
}

function coauthors(message: string): string[] {
	return [...message.matchAll(/^co-authored-by:\s*(.+)$/gim)].map((match) => match[1] ?? "");
}

function summaryState(checks: readonly { state: ShipCheck["state"] }[]): PipelineSummary["state"] {
	if (!checks.length) return "none";
	const summary = checksSummary(checks);
	if (summary.failed) return "failing";
	if (summary.pending) return "running";
	return "passing";
}

/**
 * Ship (Figma 19): a project's environments as its deployments on GitHub say they are, promoting
 * what staging has to production, rolling back to an earlier deploy, the checks on main and on
 * each pull request, and the preview each pull request gets. Grid deploys through what the project
 * already uses — a release tag, a branch, a workflow, or a command — never a host of its own.
 */
export class Ship {
	private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();

	constructor(private readonly deps: ShipDeps) {}

	private cached<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
		const hit = this.cache.get(key);
		if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
		const value = load();
		this.cache.set(key, { at: Date.now(), value });
		value.catch(() => this.cache.delete(key));
		return value;
	}

	/** After a deploy: what GitHub says is read again. */
	private forget(repo: string): void {
		for (const key of this.cache.keys()) if (key.startsWith(`${repo}:`)) this.cache.delete(key);
	}

	private place(workspace: string, project: string): { folder: string; repo: string } {
		const folder = this.deps.chat.projectFolders(workspace)[project];
		if (!folder || !existsSync(folder))
			throw new ShipError("Choose this project's folder first", 409);
		const repo = githubRepository(folder);
		if (!repo)
			throw new ShipError("This project's folder has no GitHub repository as its origin", 409);
		return { folder, repo };
	}

	/** The environments: those deployed to, and those the workflows deploy to. */
	private groups(folder: string, data: RepoDeployments): EnvironmentGroup[] {
		return groupEnvironments(data.deployments, workflowEnvironments(readWorkflows(folder)));
	}

	private data(repo: string, fresh = false): Promise<RepoDeployments> {
		return this.cached(`${repo}:deployments`, () => this.deps.github.deployments(repo), fresh);
	}

	private checks(repo: string, sha: string, fresh = false): Promise<ShipCheck[]> {
		return this.cached(`${repo}:checks:${sha}`, () => this.deps.github.checks(repo, sha), fresh);
	}

	private pulls(repo: string): Promise<OpenPull[]> {
		return this.cached(`${repo}:pulls`, () => this.deps.github.openPulls(repo));
	}

	private compare(repo: string, base: string, head: string) {
		return this.cached(`${repo}:compare:${base}:${head}`, () =>
			this.deps.github.compare(repo, base, head),
		);
	}

	private method(
		folder: string,
		settings: EnvironmentSettings,
		environment: string,
	): DeployMethod | null {
		if (settings.promote) return { kind: "command", command: settings.promote };
		return detectMethod(readWorkflows(folder), environment);
	}

	private siteOf(group: EnvironmentGroup, settings: EnvironmentSettings): string | null {
		const live = group.history.find((item) => item.state === "live");
		return settings.url || live?.url || group.history.find((item) => item.url)?.url || null;
	}

	private state(group: EnvironmentGroup, site: string | null): EnvState {
		const latest = group.history[0];
		if (!latest) return "idle";
		if (latest.state === "running") return "deploying";
		if (latest.state === "failed") return "failing";
		if (!group.history.some((item) => item.state === "live")) return "idle";
		if (site) {
			const recent = this.deps.store.probes(site, new Date(Date.now() - 3 * PROBE_EVERY_MS));
			if (recent.length >= 2 && recent.slice(-2).every((probe) => !probe.ok)) return "down";
		}
		return "healthy";
	}

	private summary(
		group: EnvironmentGroup,
		data: RepoDeployments,
		settings: EnvironmentSettings,
		ahead: number | null,
	): EnvironmentSummary {
		const live = group.history.find((item) => item.state === "live");
		const site = this.siteOf(group, settings);
		if (site) this.deps.store.rememberSite(site);
		return {
			name: group.name,
			kind: group.kind,
			version: live ? versionOf(live.sha, data.tags) : null,
			sha: live?.sha ?? null,
			state: this.state(group, site),
			url: site,
			deployedAt: live?.finishedAt ?? live?.createdAt ?? null,
			ahead,
		};
	}

	/** Where production is promoted from: staging when there is one, else the default branch. */
	private source(
		group: EnvironmentGroup,
		groups: readonly EnvironmentGroup[],
		data: RepoDeployments,
		method: DeployMethod | null,
	): Promotion["from"] | null {
		if (group.kind !== "production") return null;
		const staging = groups
			.filter((item) => item.kind === "staging")
			.map((item) => ({ item, live: item.history.find((entry) => entry.state === "live") }))
			.find((found) => found.live);
		if (staging?.live)
			return {
				name: staging.item.name,
				version: versionOf(staging.live.sha, data.tags),
				sha: staging.live.sha,
				url: staging.live.url,
			};
		// Production that deploys on every push to the default branch has nothing to promote.
		if (method?.kind === "branch" && method.branch === data.defaultBranch) return null;
		if (!data.head) return null;
		return {
			name: data.defaultBranch,
			version: versionOf(data.head, data.tags),
			sha: data.head,
			url: null,
		};
	}

	private async pipelines(
		who: Who,
		project: string,
		repo: string,
		data: RepoDeployments,
	): Promise<PipelineSummary[]> {
		const threads = this.deps.chat.branchThreads(who.workspace, project);
		const [main, pulls] = await Promise.all([
			data.head ? this.checks(repo, data.head).catch(() => []) : Promise.resolve([]),
			this.pulls(repo).catch(() => [] as OpenPull[]),
		]);
		const finished = main
			.map((check) =>
				check.startedAt && check.seconds !== null
					? new Date(Date.parse(check.startedAt) + check.seconds * 1000).toISOString()
					: check.startedAt,
			)
			.filter((at): at is string => Boolean(at))
			.sort();
		const rank = { failing: 0, running: 1, passing: 2, none: 3 } as const;
		const prs = pulls
			.map((pull) => ({
				id: String(pull.number),
				label: `PR #${pull.number}`,
				title: pull.title,
				state: summaryState(pull.checks),
				failing: checksSummary(pull.checks).failed,
				at: pull.updatedAt,
				fix: threads.has(pull.branch),
			}))
			.sort((a, b) => rank[a.state] - rank[b.state] || (b.at ?? "").localeCompare(a.at ?? ""))
			.slice(0, 5);
		return [
			{
				id: "main",
				label: data.defaultBranch,
				title: data.defaultBranch,
				state: summaryState(main),
				failing: checksSummary(main).failed,
				at: finished.at(-1) ?? null,
				fix: false,
			},
			...prs,
		];
	}

	/** The panel and the phone's list: environments, previews, pipelines. */
	async overview(who: Who, project: string): Promise<ShipOverview> {
		const { folder, repo } = this.place(who.workspace, project);
		const data = await this.data(repo);
		const settings = this.deps.store.settings(who.workspace, project);
		const groups = this.groups(folder, data);
		const production = groups.find((group) => group.kind === "production");
		const productionSha = production?.history.find((item) => item.state === "live")?.sha;
		const environments = Promise.all(
			groups
				.filter((group) => group.kind !== "preview")
				.map(async (group) => {
					const sha = group.history.find((item) => item.state === "live")?.sha;
					const ahead =
						group.kind === "staging" && sha && productionSha && sha !== productionSha
							? await this.compare(repo, productionSha, sha).then(
									(found) => found.ahead,
									() => null,
								)
							: group.kind === "staging" && sha && sha === productionSha
								? 0
								: null;
					return this.summary(group, data, settings[group.name] ?? {}, ahead);
				}),
		);
		const [previews, pipelines] = await Promise.all([
			this.previews(who, project).catch(() => [] as Preview[]),
			this.pipelines(who, project, repo, data),
		]);
		return {
			repository: repo,
			defaultBranch: data.defaultBranch,
			environments: await environments,
			previews: {
				live: previews.filter((preview) => preview.state === "ready").length,
				open: previews.length,
			},
			pipelines,
		};
	}

	/** One environment: what is live, how healthy, what can be promoted, and its deploys. */
	async environment(who: Who, project: string, name: string): Promise<EnvironmentDetail> {
		const { folder, repo } = this.place(who.workspace, project);
		const data = await this.data(repo);
		const groups = this.groups(folder, data);
		const group = groups.find((item) => item.name === name);
		if (!group) throw new ShipError("No deploys to this environment", 404);
		const settings = this.deps.store.settings(who.workspace, project)[name] ?? {};
		const method = this.method(folder, settings, name);
		const live = group.history.find((item) => item.state === "live");
		const from = this.source(group, groups, data, method);
		const promotion = from ? await this.promotion(repo, data, group, from, method) : null;
		const summary = this.summary(group, data, settings, null);
		const site = summary.url;
		const now = Date.now();
		const month: Probe[] = site
			? this.deps.store.probes(site, new Date(now - 30 * 86_400_000))
			: [];
		const day = month.filter((probe) => Date.parse(probe.at) >= now - 86_400_000);
		const reading =
			this.deps.pulse?.get(who.workspace, 7) ?? this.deps.pulse?.get(who.workspace, 30);
		const errorRate = reading?.reading?.errorRate;
		return {
			...summary,
			repository: repo,
			host:
				hostOf(live?.creator ?? group.history[0]?.creator ?? "") ??
				(group.history[0]?.logUrl?.includes("/actions/") ? "GitHub Actions" : null),
			deployedBy: live?.author ?? null,
			health: {
				errorRate: errorRate && reading ? { value: errorRate.value, at: reading.at } : null,
				p95: p95(day),
				uptime: uptime(month),
				checks: month.length,
				deploysWeek: group.history.filter(
					(item) => Date.parse(item.createdAt) >= now - 7 * 86_400_000,
				).length,
			},
			promotion,
			history: group.history.slice(0, 12).map((item) => this.entry(item, data, settings)),
			watch: this.deps.store.watch(who.workspace, project, name),
			method: describeMethod(method),
			settings,
			allowed: this.mayDeploy(who, group.kind),
		};
	}

	private entry(
		item: Deployment,
		data: RepoDeployments,
		settings: EnvironmentSettings,
	): HistoryEntry {
		return {
			id: item.id,
			version: versionOf(item.sha, data.tags),
			sha: item.sha,
			title: item.title,
			author: item.author,
			agent: agentOf(item.author, "", []),
			at: item.createdAt,
			seconds: durationOf(item),
			state: item.state,
			logUrl: item.logUrl,
			canRollback:
				(item.state === "success" || item.state === "inactive") &&
				Boolean(settings.rollback || runOf(item.logUrl)),
		};
	}

	private async promotion(
		repo: string,
		data: RepoDeployments,
		group: EnvironmentGroup,
		from: Promotion["from"],
		method: DeployMethod | null,
	): Promise<Promotion | null> {
		const live = group.history.find((item) => item.state === "live");
		if (live?.sha === from.sha) return null;
		const [compared, checks] = await Promise.all([
			live ? this.compare(repo, live.sha, from.sha).catch(() => null) : Promise.resolve(null),
			this.checks(repo, from.sha).catch(() => [] as ShipCheck[]),
		]);
		if (compared && compared.ahead === 0) return null;
		return {
			from,
			ahead: compared?.ahead ?? null,
			commits: (compared?.commits ?? [])
				.slice(-20)
				.reverse()
				.map((commit) => ({
					sha: commit.sha,
					title: commit.title,
					author: commit.author,
					agent: agentOf(commit.author, commit.email, coauthors(commit.message)),
				})),
			checks: checksSummary(checks),
			migrations: (compared?.files ?? [])
				.filter((file) => file.status === "added" && MIGRATION.test(file.path))
				.map((file) => file.path.split("/").at(-1) ?? file.path),
			version: method?.kind === "tag" ? nextVersion(data.tagNames, method.prefix) : from.version,
			method: describeMethod(method),
			ready: method !== null,
		};
	}

	private mayDeploy(who: Who, kind: EnvironmentKind): boolean {
		return may(who, kind === "production" ? "production" : "mergePulls");
	}

	/** Put what staging (or the default branch) has live here, the way this environment deploys. */
	async promote(
		who: Who,
		project: string,
		name: string,
		options: { watch: boolean },
	): Promise<{ version: string }> {
		const { folder, repo } = this.place(who.workspace, project);
		if (!this.mayDeploy(who, environmentKind(name))) throw new ShipError(NOT_ALLOWED, 403);
		const data = await this.data(repo, true);
		const groups = this.groups(folder, data);
		const group = groups.find((item) => item.name === name);
		if (!group) throw new ShipError("No deploys to this environment", 404);
		const settings = this.deps.store.settings(who.workspace, project)[name] ?? {};
		const method = this.method(folder, settings, name);
		if (!method)
			throw new ShipError(
				"Grid can't tell how this environment deploys: set a promote command in its settings",
				409,
			);
		const from = this.source(group, groups, data, method);
		if (!from) throw new ShipError("There is nothing new to promote", 409);
		const version =
			method.kind === "tag" ? nextVersion(data.tagNames, method.prefix) : from.version;
		switch (method.kind) {
			case "tag": {
				await git(folder, ["fetch", "--quiet", "origin", from.sha]);
				const tagged = await git(folder, ["tag", version, from.sha]);
				if (!tagged.ok)
					throw new ShipError(`Could not tag ${version}: ${tagged.err.trim().split("\n")[0]}`, 409);
				const pushed = await git(folder, ["push", "--quiet", "origin", `refs/tags/${version}`]);
				if (!pushed.ok) {
					await git(folder, ["tag", "-d", version]);
					throw new ShipError(
						`Could not push ${version}: ${pushed.err.trim().split("\n")[0]}`,
						502,
					);
				}
				break;
			}
			case "branch":
				await this.deps.github.moveBranch(repo, method.branch, from.sha);
				break;
			case "dispatch":
				await this.deps.github.dispatch(
					repo,
					method.workflow,
					from.name === data.defaultBranch ? data.defaultBranch : from.sha,
				);
				break;
			case "command":
				await runCommand(folder, method.command, {
					GRID_SHA: from.sha,
					GRID_VERSION: version,
					GRID_ENVIRONMENT: name,
				});
				break;
		}
		const live = group.history.find((item) => item.state === "live");
		if (options.watch && live)
			this.deps.store.saveWatch({
				workspace: who.workspace,
				project,
				environment: name,
				userId: who.userId,
				previous: { id: live.id, sha: live.sha, version: versionOf(live.sha, data.tags) },
				sha: from.sha,
				version,
				startedAt: new Date().toISOString(),
				until: null,
				misses: 0,
				outcome: "watching",
				detail: null,
			});
		this.forget(repo);
		return { version };
	}

	private async rollbackTo(
		folder: string,
		repo: string,
		environment: string,
		settings: EnvironmentSettings,
		entry: Pick<Deployment, "sha" | "logUrl">,
		version: string,
	): Promise<void> {
		if (settings.rollback) {
			await runCommand(folder, settings.rollback, {
				GRID_SHA: entry.sha,
				GRID_VERSION: version,
				GRID_ENVIRONMENT: environment,
			});
			return;
		}
		const target = runOf(entry.logUrl);
		if (!target)
			throw new ShipError(
				"Grid can't roll back here: set a rollback command in this environment's settings",
				409,
			);
		// The job that deployed it, run again: the same commit goes out the same way.
		await this.deps.github.rerun(repo, target.run, { job: target.job });
	}

	/** Deploy an earlier deploy's commit again. */
	async rollback(
		who: Who,
		project: string,
		name: string,
		id: number,
	): Promise<{ version: string }> {
		const { folder, repo } = this.place(who.workspace, project);
		if (!this.mayDeploy(who, environmentKind(name))) throw new ShipError(NOT_ALLOWED, 403);
		const data = await this.data(repo, true);
		const entry = data.deployments.find((item) => item.id === id && item.environment === name);
		if (!entry) throw new ShipError("That deploy is not in this environment's history", 404);
		const settings = this.deps.store.settings(who.workspace, project)[name] ?? {};
		const version = versionOf(entry.sha, data.tags);
		await this.rollbackTo(folder, repo, name, settings, entry, version);
		this.forget(repo);
		return { version };
	}

	setSettings(who: Who, project: string, name: string, settings: EnvironmentSettings): void {
		this.place(who.workspace, project);
		if (!may(who, "production")) throw new ShipError(NOT_ALLOWED, 403);
		this.deps.store.setEnvironment(who.workspace, project, name, settings);
	}

	/** One preview per open pull request: its address and whether it is up. */
	async previews(who: Who, project: string): Promise<Preview[]> {
		const { repo } = this.place(who.workspace, project);
		const [data, pulls] = await Promise.all([this.data(repo), this.pulls(repo)]);
		const threads = this.deps.chat.branchThreads(who.workspace, project);
		const candidates = data.deployments.filter((item) => {
			const kind = environmentKind(item.environment);
			return kind === "preview" || kind === "other";
		});
		return pulls.map((pull) => {
			const deploy = candidates.find(
				(item) =>
					item.ref === pull.branch ||
					new RegExp(`(^|[^\\d])${pull.number}$`).test(item.environment),
			);
			const thread = threads.get(pull.branch);
			return {
				number: pull.number,
				title: pull.title,
				branch: pull.branch,
				url: deploy?.url ?? null,
				state: !deploy
					? "none"
					: deploy.state === "running"
						? "building"
						: deploy.state === "failed"
							? "failed"
							: "ready",
				at: deploy?.finishedAt ?? deploy?.createdAt ?? null,
				author: pull.author,
				agent: pullAgent(pull.author, pull.body),
				thread: thread ? { id: thread.id, title: thread.title, provider: thread.provider } : null,
				pullUrl: pull.url,
			};
		});
	}

	/** The checks on main, or on a pull request: why one failed, and the thread fixing it. */
	async pipeline(who: Who, project: string, id: string): Promise<PipelineDetail> {
		const { repo } = this.place(who.workspace, project);
		const data = await this.data(repo);
		let detail: Omit<PipelineDetail, "checks" | "summary" | "failing" | "thread" | "allowed">;
		if (id === "main") {
			const commit = await this.cached(`${repo}:commit:${data.head}`, () =>
				this.deps.github.commit(repo, data.head),
			);
			detail = {
				id,
				label: data.defaultBranch,
				title: commit.title,
				sha: data.head,
				branch: data.defaultBranch,
				number: null,
				url: `https://github.com/${repo}/commit/${data.head}`,
				author: commit.author,
				agent: agentOf(commit.author, commit.email, coauthors(commit.message)),
				at: commit.at || null,
			};
		} else {
			const number = Number(id);
			const pull = (await this.pulls(repo)).find((item) => item.number === number);
			if (!pull) throw new ShipError("Not an open pull request", 404);
			detail = {
				id,
				label: `PR #${pull.number}`,
				title: pull.title,
				sha: pull.head,
				branch: pull.branch,
				number: pull.number,
				url: pull.url,
				author: pull.author,
				agent: pullAgent(pull.author, pull.body),
				at: pull.updatedAt,
			};
		}
		const checks = await this.checks(repo, detail.sha, true);
		return {
			...detail,
			checks,
			summary: checksSummary(checks),
			failing:
				checks.find((check) => check.state === "failure" && check.run !== null)?.name ?? null,
			thread: detail.number === null ? null : await this.thread(who, project, detail.branch),
			allowed: { rerun: may(who, "mergePulls"), push: may(who, "startAgents") },
		};
	}

	/** Why a pipeline's first failing check failed: its log, cut down. Slow, so asked on its own. */
	async failureLog(
		who: Who,
		project: string,
		id: string,
	): Promise<{ check: string; excerpt: string } | null> {
		const { repo } = this.place(who.workspace, project);
		const data = await this.data(repo);
		const sha =
			id === "main"
				? data.head
				: (await this.pulls(repo)).find((pull) => pull.number === Number(id))?.head;
		if (!sha) throw new ShipError("Not an open pull request", 404);
		const failed = (await this.checks(repo, sha)).find(
			(check) => check.state === "failure" && check.run !== null,
		);
		if (!failed?.run) return null;
		const run = failed.run;
		const log = await this.cached(`${repo}:log:${run}:${failed.job ?? ""}`, () =>
			this.deps.github.failedLog(repo, run, failed.job),
		).catch(() => "");
		return log ? { check: failed.name, excerpt: logExcerpt(log) } : null;
	}

	/** The Grid thread on a branch: what it said last, and the change it has not pushed. */
	private async thread(
		who: Who,
		project: string,
		branch: string,
	): Promise<PipelineDetail["thread"]> {
		const found = this.deps.chat.branchThreads(who.workspace, project).get(branch);
		if (!found) return null;
		const worktree = this.deps.chat.worktree(who.workspace, found.id);
		let diff: FileDiff[] = [];
		if (worktree?.exists) {
			const upstream = await git(worktree.path, [
				"rev-parse",
				"--verify",
				"--quiet",
				"@{upstream}",
			]);
			const patch = await git(worktree.path, ["diff", upstream.ok ? "@{upstream}" : "HEAD"]);
			diff = splitDiff(patch.out)
				.slice(0, 6)
				.map((file) => ({
					...file,
					patch: file.patch.length > 6_000 ? file.patch.slice(0, 6_000) : file.patch,
				}));
		}
		const reply = lastAnswer(this.deps.chat.events(who.workspace, found.id)).trim();
		return {
			id: found.id,
			title: found.title,
			provider: found.provider,
			busy: this.deps.chat.running(who.workspace).some((item) => item.id === found.id),
			reply: reply.length > 1_200 ? `${reply.slice(0, 1_200)} …` : reply,
			diff,
			changed: worktree?.changed ?? 0,
			unpushed: worktree?.unpushed ?? 0,
		};
	}

	/** Run checks again: those that failed, one by name, or all of them. */
	async rerun(
		who: Who,
		project: string,
		id: string,
		which: { failed: boolean; check?: string },
	): Promise<void> {
		if (!may(who, "mergePulls")) throw new ShipError(NOT_ALLOWED, 403);
		const { repo } = this.place(who.workspace, project);
		const pipeline = await this.pipeline(who, project, id);
		const picked = which.check
			? pipeline.checks.filter((check) => check.name === which.check)
			: pipeline.checks.filter((check) => !which.failed || check.state === "failure");
		const runs = new Map<number, number | null>();
		for (const check of picked)
			if (check.run !== null) runs.set(check.run, which.check ? check.job : null);
		if (!runs.size)
			throw new ShipError("Only GitHub Actions checks can be run again from Grid", 409);
		const failures: string[] = [];
		for (const [run, job] of runs) {
			await this.deps.github
				.rerun(repo, run, { failed: which.failed, job })
				.catch((cause: unknown) =>
					failures.push(cause instanceof Error ? cause.message : String(cause)),
				);
		}
		if (failures.length === runs.size) throw new ShipError(failures[0] ?? "GitHub said no", 502);
		this.forget(repo);
	}

	/** Ask the thread fixing a pull request to push what it has. */
	pushFix(who: Who, project: string, number: number): Promise<void> {
		if (!may(who, "startAgents")) throw new ShipError(NOT_ALLOWED, 403);
		const { repo } = this.place(who.workspace, project);
		return this.pulls(repo).then((pulls) => {
			const pull = pulls.find((item) => item.number === number);
			if (!pull) throw new ShipError("Not an open pull request", 404);
			const thread = this.deps.chat.branchThreads(who.workspace, project).get(pull.branch);
			if (!thread) throw new ShipError("No thread is working on this pull request", 404);
			void this.deps.chat
				.prompt(
					who.workspace,
					thread.id,
					`Commit your fix if you have not yet, and push it to \`${pull.branch}\` now, so pull request #${number} runs its checks again.`,
				)
				.catch((cause: unknown) =>
					console.warn(
						"[runner] could not ask the thread to push:",
						cause instanceof Error ? cause.message : cause,
					),
				);
		});
	}

	private async probe(url: string): Promise<Probe> {
		const started = performance.now();
		let ok = false;
		try {
			const response = await (this.deps.fetcher ?? fetch)(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(10_000),
			});
			ok = response.status < 500;
			await response.body?.cancel();
		} catch {
			ok = false;
		}
		return { at: new Date().toISOString(), ok, ms: performance.now() - started };
	}

	/** Every minute: check the sites people look at, and the watches still running. */
	async tick(now = new Date()): Promise<void> {
		for (const url of this.deps.store.sites(new Date(now.getTime() - 86_400_000))) {
			if (this.deps.store.probes(url, new Date(now.getTime() - PROBE_EVERY_MS)).length) continue;
			this.deps.store.recordProbe(url, await this.probe(url));
		}
		for (const watch of this.deps.store.watching())
			await this.checkWatch(watch, now).catch((cause: unknown) =>
				console.warn(
					"[runner] a ship watch failed:",
					cause instanceof Error ? cause.message : cause,
				),
			);
	}

	private tell(watch: Watch, title: string, body: string): void {
		this.deps.notify?.(watch.userId, {
			title,
			body,
			url: `/ship/${encodeURIComponent(watch.project)}/env/${encodeURIComponent(watch.environment)}`,
			tag: `ship-${watch.project}-${watch.environment}`,
		});
	}

	private async checkWatch(watch: Watch, now: Date): Promise<void> {
		const finish = (outcome: Watch["outcome"], detail: string) =>
			this.deps.store.saveWatch({ ...watch, outcome, detail });
		let place: { folder: string; repo: string };
		try {
			place = this.place(watch.workspace, watch.project);
		} catch {
			finish("failed", "The project's folder is gone from this machine");
			return;
		}
		const data = await this.data(place.repo, true);
		const group = groupEnvironments(data.deployments).find(
			(item) => item.name === watch.environment,
		);
		const started = Date.parse(watch.startedAt) - 60_000;
		const deploy = group?.history.find(
			(item) => item.sha === watch.sha && Date.parse(item.createdAt) >= started,
		);
		if (!deploy) {
			if (now.getTime() - Date.parse(watch.startedAt) > START_WITHIN_MS) {
				finish("failed", `${watch.version} did not start deploying within 30 minutes`);
				this.tell(
					watch,
					`${watch.version} never started deploying`,
					`${watch.previous.version} is still live on ${watch.environment}.`,
				);
			}
			return;
		}
		if (deploy.state === "running") return;
		if (deploy.state === "failed") {
			finish(
				"failed",
				`${watch.version} failed to deploy; ${watch.previous.version} is still live`,
			);
			this.tell(
				watch,
				`${watch.version} failed to deploy`,
				`${watch.previous.version} is still live on ${watch.environment}.`,
			);
			return;
		}
		const until =
			watch.until ??
			new Date(Date.parse(deploy.finishedAt ?? now.toISOString()) + WATCH_MS).toISOString();
		const settings =
			this.deps.store.settings(watch.workspace, watch.project)[watch.environment] ?? {};
		const site = settings.url || deploy.url;
		let misses = watch.misses;
		if (site) {
			const probe = await this.probe(site);
			this.deps.store.recordProbe(site, probe);
			misses = probe.ok ? 0 : misses + 1;
		}
		if (misses >= MISSES_TO_ROLL_BACK) {
			const previous = data.deployments.find((item) => item.id === watch.previous.id);
			try {
				await this.rollbackTo(
					place.folder,
					place.repo,
					watch.environment,
					settings,
					previous ?? { sha: watch.previous.sha, logUrl: null },
					watch.previous.version,
				);
				this.deps.store.saveWatch({
					...watch,
					until,
					misses,
					outcome: "rolled-back",
					detail: `${site} stopped answering after ${watch.version} went live; rolled back to ${watch.previous.version}`,
				});
				this.tell(
					watch,
					`Rolled back ${watch.environment} to ${watch.previous.version}`,
					`${site} stopped answering after ${watch.version} went live.`,
				);
			} catch (cause) {
				const why = cause instanceof Error ? cause.message : String(cause);
				this.deps.store.saveWatch({
					...watch,
					until,
					misses,
					outcome: "failed",
					detail: `${site} stopped answering, and rolling back failed: ${why}`,
				});
				this.tell(
					watch,
					`${watch.environment} is down after ${watch.version}`,
					`Rolling back failed: ${why}`,
				);
			}
			this.forget(place.repo);
			return;
		}
		if (now.getTime() >= Date.parse(until)) {
			this.deps.store.saveWatch({
				...watch,
				until,
				misses,
				outcome: "clean",
				detail: `${watch.version} stayed up for 15 minutes`,
			});
			return;
		}
		this.deps.store.saveWatch({ ...watch, until, misses });
	}
}
