import { remoteToUrl } from "../folders/folders";
import type { Gh } from "../github/gh";
import type { AutonomyStore, PullSnapshot, PullWatch } from "./autonomy-store";
import { ChatError, type ChatHub, type GridTool } from "./hub";
import type { ChatSessionRow } from "./store";

/**
 * Agents watch pull requests: `watch_pull_request` and Grid checks the pull request every couple
 * of minutes, waking the thread's agent (a message from Grid, queued while it works) when a check
 * fails, every check has passed, someone else reviews or comments, or the branch starts to
 * conflict. Threads watching the same pull request share one check.
 *
 * A watch ends when the pull request is merged or closed, when the agent unwatches it, when the
 * person stops the thread, after `MAX_COMMENT_WAKES` wakes in a row that brought only comments,
 * or after `MAX_FAILURES` failed reads in a row. GitHub's rate limit only pauses it. Watching again
 * starts from what the pull request is now: news is what changes after.
 */

export const MAX_COMMENT_WAKES = 10;
export const MAX_FAILURES = 8;
const EXCERPT = 400;
const NEWS_PER_KIND = 3;

type CheckItem = {
	__typename?: string;
	name?: string;
	context?: string;
	status?: string;
	conclusion?: string | null;
	state?: string;
};
type Remark = { id?: string; author?: { login?: string } | null; body?: string; state?: string };

/** A pull request as `gh pr view --json` gives it. */
export type PullView = {
	number: number;
	title: string;
	url: string;
	state: string;
	mergeable?: string;
	headRefOid: string;
	statusCheckRollup?: CheckItem[];
	reviews?: Remark[];
	comments?: Remark[];
};

const FAILED = new Set([
	"FAILURE",
	"TIMED_OUT",
	"CANCELLED",
	"ACTION_REQUIRED",
	"STARTUP_FAILURE",
	"ERROR",
]);
const PENDING = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"]);

function cut(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT)}…` : flat;
}

/** What a pull request's state means for a watch: its checks, conflict, and remarks by others. */
export function snapshotOf(view: PullView, me: string | null): PullSnapshot {
	const checks = view.statusCheckRollup ?? [];
	const failing: string[] = [];
	let pending = false;
	for (const check of checks) {
		const name = check.name ?? check.context ?? "check";
		const outcome = (check.conclusion ?? check.state ?? "").toUpperCase();
		if (FAILED.has(outcome)) failing.push(name);
		else if (
			(check.status && check.status.toUpperCase() !== "COMPLETED") ||
			PENDING.has(outcome) ||
			(!outcome && !check.status)
		)
			pending = true;
	}
	const remarks = [...(view.reviews ?? []), ...(view.comments ?? [])].filter(
		(remark) => remark.id && remark.author?.login !== me,
	);
	return {
		state: view.state,
		head: view.headRefOid,
		failing: [...new Set(failing)].sort(),
		passed: checks.length > 0 && !pending && failing.length === 0,
		conflict: view.mergeable === "CONFLICTING",
		seen: remarks.map((remark) => remark.id as string),
	};
}

/**
 * What changed between two looks at a pull request, as lines for the agent; `commentsOnly` when
 * all that changed is what people wrote. Null before: the first look only sets where news starts.
 */
export function newsOf(
	view: PullView,
	before: PullSnapshot,
	after: PullSnapshot,
	me: string | null,
): { lines: string[]; commentsOnly: boolean; ended: boolean } {
	const lines: string[] = [];
	if (after.state === "MERGED")
		return { lines: ["It was merged."], commentsOnly: false, ended: true };
	if (after.state === "CLOSED")
		return { lines: ["It was closed."], commentsOnly: false, ended: true };
	const newHead = after.head !== before.head;
	const newlyFailing = after.failing.filter((name) => newHead || !before.failing.includes(name));
	if (newlyFailing.length) lines.push(`Checks failed: ${newlyFailing.join(", ")}.`);
	if (after.passed && (newHead || !before.passed)) lines.push("Every check has passed.");
	if (after.conflict && !before.conflict) lines.push("The branch now conflicts with its base.");
	const seen = new Set(before.seen);
	const remarks = [
		...(view.reviews ?? []).map((item) => ({ ...item, review: true })),
		...(view.comments ?? []).map((item) => ({ ...item, review: false })),
	].filter((remark) => remark.id && !seen.has(remark.id) && remark.author?.login !== me);
	const statusLines = lines.length;
	for (const remark of remarks.slice(0, NEWS_PER_KIND)) {
		const who = remark.author?.login ?? "someone";
		const what = remark.review
			? `${who} reviewed${remark.state ? ` (${remark.state.toLowerCase().replace(/_/g, " ")})` : ""}`
			: `${who} commented`;
		lines.push(remark.body?.trim() ? `${what}: ${cut(remark.body)}` : `${what}.`);
	}
	if (remarks.length > NEWS_PER_KIND)
		lines.push(`And ${remarks.length - NEWS_PER_KIND} more remarks.`);
	return { lines, commentsOnly: statusLines === 0 && lines.length > 0, ended: false };
}

/** `owner/name` of a GitHub remote URL, or null for one that is not GitHub's. */
export function repoOf(url: string | null): string | null {
	const match = url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i);
	return match?.[1] ?? null;
}

type RestPull = {
	number?: number;
	title?: string;
	html_url?: string;
	state?: string;
	merged?: boolean;
	mergeable_state?: string;
	head?: { sha?: string };
};
type RestRun = { name?: string; status?: string; conclusion?: string | null };
type RestStatus = { context?: string; state?: string };
type RestRemark = {
	id?: number;
	user?: { login?: string } | null;
	body?: string | null;
	state?: string;
};

function remarkOf(remark: RestRemark, id: string): Remark {
	return {
		id,
		author: { login: remark.user?.login ?? "" },
		body: remark.body ?? "",
		...(remark.state ? { state: remark.state } : {}),
	};
}

function failed(result: { code: number; stdout: string; stderr: string }): {
	error: string;
	rateLimited: boolean;
} {
	const error = (result.stderr || result.stdout).trim() || `gh exited with ${result.code}`;
	return { error, rateLimited: /rate limit/i.test(error) };
}

export class PullWatches {
	private timer: ReturnType<typeof setInterval> | null = null;
	private me: string | null | undefined;
	private checking = false;

	constructor(
		private readonly hub: ChatHub,
		private readonly store: AutonomyStore,
		private readonly gh: Gh,
		private readonly options: {
			/** The GitHub remote of a thread's folder; `git remote get-url origin` by default. */
			remoteOf?: (cwd: string) => string | null;
		} = {},
	) {
		hub.onStopped((session) => this.store.dropPullWatch(session.id));
		hub.onRemoved((thread) => this.store.dropPullWatch(thread));
		for (const tool of this.tools()) hub.registerTool(tool);
	}

	/** Check every watched pull request every so often. */
	watch(everyMs = 120_000): void {
		this.timer ??= setInterval(() => {
			void this.tick().catch((cause: unknown) => {
				console.warn("[pulls] check failed:", cause instanceof Error ? cause.message : cause);
			});
		}, everyMs);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private async login(): Promise<string | null> {
		if (this.me !== undefined) return this.me;
		const result = await this.gh.run(["api", "user", "--jq", ".login"], { timeoutMs: 20_000 });
		this.me = result.code === 0 ? result.stdout.trim() || null : null;
		return this.me;
	}

	/**
	 * A pull request as the watch reads it, through GitHub's REST API (`gh api`): the pull request,
	 * its head commit's check runs and statuses, its reviews and its comments. REST rather than
	 * `gh pr view`, which needs GraphQL that some tokens and proxies do not allow.
	 */
	private async read(
		repo: string,
		number: number,
	): Promise<PullView | { error: string; rateLimited: boolean }> {
		const pull = await this.api<RestPull>(`repos/${repo}/pulls/${number}`);
		if ("error" in pull) return pull;
		const sha = pull.head?.sha ?? "";
		const [runs, statuses, reviews, comments] = await Promise.all([
			this.lines<RestRun>(`repos/${repo}/commits/${sha}/check-runs?per_page=100`, ".check_runs[]"),
			this.lines<RestStatus>(`repos/${repo}/commits/${sha}/status?per_page=100`, ".statuses[]"),
			this.lines<RestRemark>(`repos/${repo}/pulls/${number}/reviews?per_page=100`, ".[]"),
			this.lines<RestRemark>(`repos/${repo}/issues/${number}/comments?per_page=100`, ".[]"),
		]);
		for (const part of [runs, statuses, reviews, comments]) if ("error" in part) return part;
		const list = <T>(part: T[] | { error: string }) => ("error" in part ? [] : part);
		return {
			number: pull.number ?? number,
			title: pull.title ?? "",
			url: pull.html_url ?? "",
			state: pull.merged ? "MERGED" : pull.state === "closed" ? "CLOSED" : "OPEN",
			mergeable: pull.mergeable_state === "dirty" ? "CONFLICTING" : "MERGEABLE",
			headRefOid: sha,
			statusCheckRollup: [
				...list(runs).map((run) => ({
					name: run.name,
					status: run.status?.toUpperCase(),
					conclusion: run.conclusion?.toUpperCase() ?? null,
				})),
				...list(statuses).map((status) => ({
					context: status.context,
					state: status.state?.toUpperCase(),
				})),
			],
			reviews: list(reviews)
				// A review still being written is not one yet.
				.filter((review) => review.state !== "PENDING")
				.map((review) => remarkOf(review, `review-${review.id}`)),
			comments: list(comments).map((comment) => remarkOf(comment, `comment-${comment.id}`)),
		};
	}

	/** One REST call's JSON, or what went wrong. */
	private async api<T>(path: string): Promise<T | { error: string; rateLimited: boolean }> {
		const result = await this.gh.run(["api", path], { timeoutMs: 30_000 });
		if (result.code !== 0) return failed(result);
		try {
			return JSON.parse(result.stdout) as T;
		} catch {
			return { error: "GitHub answered something that is not JSON", rateLimited: false };
		}
	}

	/** Every item of a paged REST list, one per line through `--jq`, or what went wrong. */
	private async lines<T>(
		path: string,
		jq: string,
	): Promise<T[] | { error: string; rateLimited: boolean }> {
		const result = await this.gh.run(["api", "--paginate", path, "--jq", jq], {
			timeoutMs: 30_000,
		});
		if (result.code !== 0) return failed(result);
		try {
			return result.stdout
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => JSON.parse(line) as T);
		} catch {
			return { error: "GitHub answered something that is not JSON", rateLimited: false };
		}
	}

	private repoFor(session: ChatSessionRow, given: string): string {
		if (given) {
			if (!/^[\w.-]+\/[\w.-]+$/.test(given)) throw new ChatError("repo is owner/name", 400);
			return given;
		}
		const remote = (this.options.remoteOf ?? originOf)(session.cwd);
		const repo = repoOf(remoteToUrl(remote ?? "") ?? remote);
		if (!repo)
			throw new ChatError(
				"This thread's folder has no GitHub remote; pass repo as owner/name",
				400,
			);
		return repo;
	}

	/** One pass: each watched pull request read once, its news told to each thread watching it. */
	async tick(): Promise<void> {
		if (this.checking) return;
		this.checking = true;
		try {
			const watches = this.store.pullWatches();
			const byPull = new Map<string, PullWatch[]>();
			for (const watch of watches) {
				const key = `${watch.repo}#${watch.number}`;
				byPull.set(key, [...(byPull.get(key) ?? []), watch]);
			}
			const me = await this.login();
			for (const group of byPull.values()) {
				const [first] = group;
				if (!first) continue;
				const view = await this.read(first.repo, first.number);
				for (const watch of group) await this.apply(watch, view, me);
			}
		} finally {
			this.checking = false;
		}
	}

	private async apply(
		watch: PullWatch,
		view: PullView | { error: string; rateLimited: boolean },
		me: string | null,
	): Promise<void> {
		const session = this.hub.sessionRow(watch.sessionId);
		if (!session) {
			this.store.dropPullWatch(watch.sessionId);
			return;
		}
		const label = `#${watch.number} in ${watch.repo}`;
		if ("error" in view) {
			if (view.rateLimited) return;
			const failures = watch.failures + 1;
			if (failures < MAX_FAILURES) {
				this.store.updatePullWatch(watch, { failures });
				return;
			}
			this.store.dropPullWatch(watch.sessionId, watch.repo, watch.number);
			this.wake(session, label, watch.title, watch.url, [
				`Grid stopped watching it: ${MAX_FAILURES} reads in a row failed (${cut(view.error)}).`,
			]);
			return;
		}
		const after = snapshotOf(view, me);
		const before = watch.snapshot;
		if (!before) {
			this.store.updatePullWatch(watch, { snapshot: after, failures: 0, title: view.title });
			return;
		}
		const news = newsOf(view, before, after, me);
		if (news.ended) {
			this.store.dropPullWatch(watch.sessionId, watch.repo, watch.number);
			this.wake(session, label, view.title, view.url, [...news.lines, "Grid stopped watching it."]);
			return;
		}
		if (!news.lines.length) {
			this.store.updatePullWatch(watch, { snapshot: after, failures: 0, title: view.title });
			return;
		}
		const commentWakes = news.commentsOnly ? watch.commentWakes + 1 : 0;
		if (commentWakes >= MAX_COMMENT_WAKES) {
			this.store.dropPullWatch(watch.sessionId, watch.repo, watch.number);
			news.lines.push(
				`Grid stopped watching it after ${MAX_COMMENT_WAKES} wakes in a row with only comments; watch it again if you still need to.`,
			);
		} else {
			this.store.updatePullWatch(watch, {
				snapshot: after,
				failures: 0,
				commentWakes,
				title: view.title,
			});
		}
		this.wake(session, label, view.title, view.url, news.lines);
	}

	/** Tell the thread's agent, as a message from Grid that waits while it works. */
	private wake(
		session: ChatSessionRow,
		label: string,
		title: string,
		url: string,
		lines: string[],
	): void {
		const text = `[Pull request ${label}: ${title}]\n${lines.map((line) => `- ${line}`).join("\n")}\n${url}\n\nLook into it: fix what is yours to fix and push, and tell the person what needs them. Call unwatch_pull_request when you hand the work back.`;
		void this.hub
			.prompt(session.workspaceId, session.id, text, [], "send", {
				origin: { kind: "grid", reason: "pull" },
			})
			.catch((cause: unknown) => {
				console.warn(
					"[pulls] could not wake a thread:",
					cause instanceof Error ? cause.message : cause,
				);
			});
	}

	private tools(): GridTool[] {
		const number = (args: Record<string, unknown>): number => {
			const value = Number(args.number);
			if (!Number.isSafeInteger(value) || value < 1)
				throw new ChatError("number is the pull request's number", 400);
			return value;
		};
		const repoArg = (args: Record<string, unknown>) =>
			typeof args.repo === "string" ? args.repo.trim() : "";
		return [
			{
				name: "watch_pull_request",
				description:
					"Watch a pull request: Grid checks it every couple of minutes and wakes you with a message when a check fails, every check passes, someone else reviews or comments, or the branch starts to conflict. It ends when the pull request is merged or closed, when you unwatch it, or when the person stops this thread. repo is owner/name (this thread's folder's GitHub repository by default).",
				inputSchema: {
					type: "object",
					properties: { number: { type: "number" }, repo: { type: "string" } },
					required: ["number"],
				},
				run: async (session, args) => {
					const pull = number(args);
					const repo = this.repoFor(session, repoArg(args));
					const view = await this.read(repo, pull);
					if ("error" in view)
						throw new ChatError(`Could not read ${repo}#${pull}: ${cut(view.error)}`, 502);
					if (view.state !== "OPEN")
						return `${repo}#${pull} is ${view.state.toLowerCase()}; there is nothing to watch.`;
					const snapshot = snapshotOf(view, await this.login());
					this.store.addPullWatch({
						sessionId: session.id,
						repo,
						number: pull,
						title: view.title,
						url: view.url,
						snapshot,
						createdAt: new Date().toISOString(),
					});
					const now = [
						snapshot.failing.length ? `failing: ${snapshot.failing.join(", ")}` : null,
						snapshot.passed ? "every check passed" : null,
						snapshot.conflict ? "conflicts with its base" : null,
					].filter(Boolean);
					return `Watching ${repo}#${pull} (${view.title}).${now.length ? ` Right now it is ${now.join("; ")}.` : ""} You will be woken when that changes.`;
				},
			},
			{
				name: "unwatch_pull_request",
				description:
					"Stop watching a pull request (number), or every pull request this thread watches (no number). Do it when you hand the work back to the person.",
				inputSchema: {
					type: "object",
					properties: { number: { type: "number" }, repo: { type: "string" } },
				},
				run: (session, args) => {
					if (args.number === undefined || args.number === null) {
						const dropped = this.store.dropPullWatch(session.id);
						return dropped
							? `Stopped watching ${dropped} pull request${dropped === 1 ? "" : "s"}.`
							: "This thread watches no pull requests.";
					}
					const pull = number(args);
					const watched = this.store
						.pullWatches(session.id)
						.find(
							(item) => item.number === pull && (!repoArg(args) || item.repo === repoArg(args)),
						);
					if (!watched) return `This thread does not watch #${pull}.`;
					this.store.dropPullWatch(session.id, watched.repo, watched.number);
					return `Stopped watching ${watched.repo}#${pull}.`;
				},
			},
		];
	}
}

/** The `origin` remote of a folder, or null. */
/** The `origin` remote of a folder's git repository, or null. */
export function originOf(cwd: string): string | null {
	try {
		const result = Bun.spawnSync(["git", "-C", cwd, "remote", "get-url", "origin"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
	} catch {
		return null;
	}
}
