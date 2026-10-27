import type { Database } from "bun:sqlite";

import type { AuditDraft } from "../audit/audit-log";
import type { Who } from "../auth";
import { ChatError, type ChatHub } from "../chat/hub";
import { originOf, repoOf } from "../chat/pull-watch";
import { remoteToUrl } from "../folders/folders";
import { isAdmin } from "../permissions";
import { openPrivateDatabase } from "../private-database";
import type { Gh } from "./gh";

/**
 * A review agent on every pull request: with it on for a project, Grid looks at the project's
 * GitHub repository every few minutes, and each pull request opened or pushed to since (drafts
 * aside) gets a thread whose agent reads the diff, and the project around it, and writes a
 * review. Grid posts that on the pull request as a comment. Each commit is reviewed once; one
 * can be reviewed again by hand. The thread stays, so the review can be talked over.
 *
 * The agent works in the project's folder, in its read-only mode where it has one, and is told
 * to change nothing: the diff comes in the message, so it needs no tools to see it. Spending
 * limits apply to it as to any thread.
 */

export type ReviewSettings = {
	workspaceId: string;
	project: string;
	enabled: boolean;
	provider: string;
	model: string | null;
	/** What else the project wants a review to look for, in its own words. */
	instructions: string | null;
	/** Whose the review threads are: who turned it on. */
	ownerId: string;
	/** Pull requests opened or pushed to before this are left alone (they can be asked for). */
	since: string;
	updatedAt: string;
};

export type ReviewStatus = "running" | "posted" | "failed";

export type PullReview = {
	id: string;
	workspaceId: string;
	project: string;
	repo: string;
	number: number;
	title: string;
	/** The commit it reviewed. */
	head: string;
	status: ReviewStatus;
	sessionId: string | null;
	commentUrl: string | null;
	error: string | null;
	at: string;
	/** By hand ("Review now"), not because the pull request changed. */
	manual: boolean;
};

type SettingsRow = { workspace_id: string; project: string; data: string };
type ReviewRow = {
	id: string;
	workspace_id: string;
	project: string;
	repo: string;
	number: number;
	title: string;
	head: string;
	status: ReviewStatus;
	session_id: string | null;
	comment_url: string | null;
	error: string | null;
	at: string;
	manual: number;
};

const reviewOf = (row: ReviewRow): PullReview => ({
	id: row.id,
	workspaceId: row.workspace_id,
	project: row.project,
	repo: row.repo,
	number: row.number,
	title: row.title,
	head: row.head,
	status: row.status,
	sessionId: row.session_id,
	commentUrl: row.comment_url,
	error: row.error,
	at: row.at,
	manual: row.manual === 1,
});

/** A pull request as GitHub's REST API lists it. */
type RestPull = {
	number: number;
	title?: string;
	body?: string | null;
	draft?: boolean;
	updated_at?: string;
	user?: { login?: string } | null;
	head?: { sha?: string; ref?: string };
	base?: { ref?: string };
};

export const MAX_DIFF = 120_000;
const MAX_BODY = 4_000;
const MAX_INSTRUCTIONS = 2_000;
/** Reviews started for one project in one look, at most: a burst of pushes waits its turn. */
const PER_TICK = 3;
/** How long a review may take before Grid stops it and says so. */
const REVIEW_MINUTES = 20;
const FOOTER_MARK = "<!-- grid-review -->";

/** The message the review agent is given. */
export function reviewPrompt(input: {
	repo: string;
	pull: RestPull;
	diff: string;
	instructions: string | null;
}): string {
	const { pull } = input;
	const diff =
		input.diff.length > MAX_DIFF
			? `${input.diff.slice(0, MAX_DIFF)}\n… (the diff goes on; it was cut at ${MAX_DIFF} characters: read the rest of the changed files in the folder)`
			: input.diff;
	const body = pull.body?.trim()
		? pull.body.trim().slice(0, MAX_BODY)
		: "(The pull request says nothing about itself.)";
	return [
		`Review pull request ${input.repo}#${pull.number}, "${pull.title ?? ""}"${pull.user?.login ? ` by @${pull.user.login}` : ""}: ${pull.head?.ref ?? "its branch"} into ${pull.base?.ref ?? "its base"}.`,
		`What it says about itself:\n${body}`,
		`Its diff:\n\`\`\`diff\n${diff}\n\`\`\``,
		"You are in the project's folder, which may be on another branch: read files there for context, but change nothing, run nothing that changes anything, and do not push or comment yourself.",
		...(input.instructions?.trim()
			? [`What this project asks reviews to look for:\n${input.instructions.trim()}`]
			: []),
		"Reply with the review itself, in GitHub Markdown, and nothing else: it is posted on the pull request as you write it. Start with a one-line verdict. Then the findings that matter, most serious first: bugs, security problems, breaking changes, missing tests, code that will confuse the next reader. For each, the file and line, what is wrong, and what to do. Leave out praise and style nits a formatter would catch. If you find nothing worth changing, say so in a line.",
	].join("\n\n");
}

/** What a turn's agent said after its last message from Grid: the review. */
export function replyOf(events: readonly { type: string; text?: string }[]): string {
	let reply = "";
	for (const event of events) {
		if (event.type === "turn_start") reply = "";
		else if (event.type === "message") reply += event.text ?? "";
	}
	return reply.trim();
}

export class ReviewError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export class PullReviews {
	private readonly db: Database;
	private timer: ReturnType<typeof setInterval> | null = null;
	private checking = false;
	/** Pull requests being reviewed now, as `repo#number`: one review each at a time. */
	private readonly running = new Set<string>();

	constructor(
		private readonly chat: ChatHub,
		private readonly gh: Gh,
		path: string,
		private readonly deps: {
			/** The GitHub remote of a project's folder; `git remote get-url origin` by default. */
			remoteOf?: (cwd: string) => string | null;
			audit?: (draft: AuditDraft) => void;
		} = {},
	) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS pull_review_settings (
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (workspace_id, project)
			);
			CREATE TABLE IF NOT EXISTS pull_reviews (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				repo TEXT NOT NULL,
				number INTEGER NOT NULL,
				title TEXT NOT NULL,
				head TEXT NOT NULL,
				status TEXT NOT NULL,
				session_id TEXT,
				comment_url TEXT,
				error TEXT,
				at TEXT NOT NULL,
				manual INTEGER NOT NULL DEFAULT 0
			);
			CREATE INDEX IF NOT EXISTS pull_reviews_by_pull ON pull_reviews (repo, number, head);
			CREATE INDEX IF NOT EXISTS pull_reviews_by_project ON pull_reviews (workspace_id, project, at);
		`);
		// Reviews cut off by a runner that stopped are not going on any more.
		this.db
			.query(
				"UPDATE pull_reviews SET status = 'failed', error = 'Grid stopped while it was reviewing' WHERE status = 'running'",
			)
			.run();
	}

	settings(workspace: string, project: string): ReviewSettings | null {
		const row = this.db
			.query<SettingsRow, [string, string]>(
				"SELECT * FROM pull_review_settings WHERE workspace_id = ? AND project = ?",
			)
			.get(workspace, project);
		return row ? (JSON.parse(row.data) as ReviewSettings) : null;
	}

	private allSettings(): ReviewSettings[] {
		return this.db
			.query<SettingsRow, []>("SELECT * FROM pull_review_settings")
			.all()
			.map((row) => JSON.parse(row.data) as ReviewSettings)
			.filter((settings) => settings.enabled);
	}

	/** Turn reviews on or off for a project, or change how they are done (owners and admins). */
	save(who: Who, project: string, input: Record<string, unknown>): ReviewSettings {
		if (!isAdmin(who))
			throw new ReviewError("Only owners and admins set up pull request reviews", 403);
		if (!project) throw new ReviewError("Say which project", 400);
		const before = this.settings(who.workspace, project);
		const enabled =
			input.enabled === undefined ? (before?.enabled ?? false) : input.enabled === true;
		const provider =
			typeof input.provider === "string" && input.provider ? input.provider : before?.provider;
		if (!provider) throw new ReviewError("Say which agent reviews", 400);
		if (!this.chat.knowsProvider(provider))
			throw new ReviewError("That agent is not on this machine", 400);
		const text = (value: unknown, fallback: string | null, max: number) => {
			if (value === undefined) return fallback;
			if (value === null) return null;
			if (typeof value !== "string") throw new ReviewError("Expected text", 400);
			const trimmed = value.trim();
			if (trimmed.length > max) throw new ReviewError(`Keep it under ${max} characters`, 400);
			return trimmed || null;
		};
		const now = new Date().toISOString();
		const settings: ReviewSettings = {
			workspaceId: who.workspace,
			project,
			enabled,
			provider,
			model: text(input.model, before?.model ?? null, 200),
			instructions: text(input.instructions, before?.instructions ?? null, MAX_INSTRUCTIONS),
			ownerId: enabled && !before?.enabled ? who.userId : (before?.ownerId ?? who.userId),
			// Turned on now: what is open already is not reviewed unless someone asks.
			since: enabled && !before?.enabled ? now : (before?.since ?? now),
			updatedAt: now,
		};
		this.db
			.query(
				`INSERT INTO pull_review_settings (workspace_id, project, data) VALUES (?, ?, ?)
				 ON CONFLICT (workspace_id, project) DO UPDATE SET data = excluded.data`,
			)
			.run(who.workspace, project, JSON.stringify(settings));
		return settings;
	}

	/** A project's reviews, newest first. */
	list(workspace: string, project: string, limit = 50): PullReview[] {
		return this.db
			.query<ReviewRow, [string, string, number]>(
				"SELECT * FROM pull_reviews WHERE workspace_id = ? AND project = ? ORDER BY at DESC, rowid DESC LIMIT ?",
			)
			.all(workspace, project, limit)
			.map(reviewOf);
	}

	private reviewed(repo: string, number: number, head: string): boolean {
		return Boolean(
			this.db
				.query("SELECT 1 FROM pull_reviews WHERE repo = ? AND number = ? AND head = ? LIMIT 1")
				.get(repo, number, head),
		);
	}

	/** Look at every project with reviews on now and then. */
	watch(everyMs = 180_000): void {
		this.timer ??= setInterval(() => {
			void this.tick().catch((cause: unknown) => {
				console.warn("[reviews] look failed:", cause instanceof Error ? cause.message : cause);
			});
		}, everyMs);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** One look: each project with reviews on, and each of its pull requests that changed since. */
	async tick(): Promise<void> {
		if (this.checking) return;
		this.checking = true;
		try {
			for (const settings of this.allSettings()) {
				const repo = this.repoOf(settings.workspaceId, settings.project);
				if (!repo) continue;
				const open = await this.openPulls(repo);
				if ("error" in open) {
					console.warn(`[reviews] could not list ${repo}'s pull requests:`, open.error);
					continue;
				}
				let started = 0;
				for (const pull of open) {
					if (started >= PER_TICK) break;
					const head = pull.head?.sha;
					if (!head || pull.draft) continue;
					if ((pull.updated_at ?? "") < settings.since) continue;
					if (this.reviewed(repo, pull.number, head)) continue;
					if (this.running.has(`${repo}#${pull.number}`)) continue;
					started++;
					void this.begin(settings, repo, pull, false);
				}
			}
		} finally {
			this.checking = false;
		}
	}

	/** Review a pull request now, whatever was reviewed before (the project's Pull requests page). */
	async reviewNow(
		who: Who,
		project: string,
		number: number,
		/** Resolve once the review is posted (or failed), not once it starts. */
		wait = true,
	): Promise<PullReview> {
		if (!Number.isSafeInteger(number) || number < 1)
			throw new ReviewError("number is the pull request's number", 400);
		const settings = this.settings(who.workspace, project);
		if (!settings) throw new ReviewError("Set up reviews for this project first", 409);
		const repo = this.repoOf(who.workspace, project);
		if (!repo) throw new ReviewError("This project's folder has no GitHub remote", 409);
		if (this.running.has(`${repo}#${number}`))
			throw new ReviewError("That pull request is being reviewed now", 409);
		const pull = await this.api<RestPull>(`repos/${repo}/pulls/${number}`);
		if ("error" in pull)
			throw new ReviewError(`Could not read ${repo}#${number}: ${pull.error}`, 502);
		// Run as whoever asked: it is their thread, and their spending.
		return this.begin({ ...settings, ownerId: who.userId }, repo, pull, true, wait);
	}

	private repoOf(workspace: string, project: string): string | null {
		const folder = this.chat.projectFolders(workspace)[project];
		if (!folder) return null;
		const remote = (this.deps.remoteOf ?? originOf)(folder);
		return repoOf(remoteToUrl(remote ?? "") ?? remote);
	}

	/**
	 * Start a review: its row at once (so the next look does not start another), then the thread,
	 * the agent's turn, and the comment. Resolves with the row once started, or once done when
	 * `wait` says.
	 */
	private async begin(
		settings: ReviewSettings,
		repo: string,
		pull: RestPull,
		manual: boolean,
		wait = false,
	): Promise<PullReview> {
		const key = `${repo}#${pull.number}`;
		this.running.add(key);
		const review: PullReview = {
			id: crypto.randomUUID(),
			workspaceId: settings.workspaceId,
			project: settings.project,
			repo,
			number: pull.number,
			title: (pull.title ?? "").slice(0, 300),
			head: pull.head?.sha ?? "",
			status: "running",
			sessionId: null,
			commentUrl: null,
			error: null,
			at: new Date().toISOString(),
			manual,
		};
		this.db
			.query(
				`INSERT INTO pull_reviews (id, workspace_id, project, repo, number, title, head, status, at, manual)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
			)
			.run(
				review.id,
				review.workspaceId,
				review.project,
				repo,
				pull.number,
				review.title,
				review.head,
				review.at,
				manual ? 1 : 0,
			);
		const done = this.run(settings, review, pull).finally(() => this.running.delete(key));
		if (wait) await done;
		return this.byId(review.id) ?? review;
	}

	private byId(id: string): PullReview | null {
		const row = this.db
			.query<ReviewRow, [string]>("SELECT * FROM pull_reviews WHERE id = ?")
			.get(id);
		return row ? reviewOf(row) : null;
	}

	private finish(
		id: string,
		patch: Partial<Pick<PullReview, "status" | "commentUrl" | "error" | "sessionId">>,
	): void {
		const now = this.byId(id);
		if (!now) return;
		const next = { ...now, ...patch };
		this.db
			.query(
				"UPDATE pull_reviews SET status = ?, session_id = ?, comment_url = ?, error = ? WHERE id = ?",
			)
			.run(next.status, next.sessionId, next.commentUrl, next.error, id);
	}

	private async run(settings: ReviewSettings, review: PullReview, pull: RestPull): Promise<void> {
		const workspace = settings.workspaceId;
		const failed = (error: string) => {
			this.finish(review.id, { status: "failed", error });
			this.deps.audit?.({
				workspaceId: workspace,
				actor: { kind: "grid", id: null, name: "Pull request reviews" },
				action: "review.failed",
				project: settings.project,
				sessionId: this.byId(review.id)?.sessionId ?? null,
				target: `${review.repo}#${review.number} ${review.title}`,
				detail: error,
			});
		};
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const diff = await this.text(
				`repos/${review.repo}/pulls/${review.number}`,
				"application/vnd.github.diff",
			);
			if (typeof diff !== "string") return failed(`Could not read the diff: ${diff.error}`);
			const modes = this.chat.modesOf(settings.provider);
			const session = await this.chat.createAutomation(
				{ userId: settings.ownerId, workspace },
				{
					project: settings.project,
					provider: settings.provider,
					model: settings.model ?? undefined,
					// Reading only, where the agent has a mode for it.
					mode: modes.includes("plan")
						? "plan"
						: modes.includes("read-only")
							? "read-only"
							: undefined,
					worktree: false,
				},
			);
			this.finish(review.id, { sessionId: session.id });
			this.chat.rename(
				workspace,
				session.id,
				`Review #${review.number}: ${review.title}`.slice(0, 120),
			);
			let stopped = false;
			timer = setTimeout(() => {
				stopped = true;
				this.chat.cancel(workspace, session.id);
			}, REVIEW_MINUTES * 60_000);
			await this.chat.prompt(
				workspace,
				session.id,
				reviewPrompt({ repo: review.repo, pull, diff, instructions: settings.instructions }),
			);
			const outcome = this.chat.turnOutcome(workspace, session.id);
			if (stopped) return failed(`Stopped after ${REVIEW_MINUTES} minutes without a review`);
			if (outcome?.reason !== "done")
				return failed(outcome?.error ?? `The agent's turn ${outcome?.reason ?? "did not end"}`);
			const reply = replyOf(this.chat.events(workspace, session.id));
			if (!reply) return failed("The agent wrote no review");
			const footer = `${FOOTER_MARK}\n\n---\n_Reviewed by ${this.chat.providerName(settings.provider)} through Grid, at ${review.head.slice(0, 7)}._`;
			const posted = await this.api<{ html_url?: string }>(
				`repos/${review.repo}/issues/${review.number}/comments`,
				["-X", "POST", "-f", `body=${reply.slice(0, 60_000)}\n\n${footer}`],
			);
			if ("error" in posted) return failed(`Could not post the review: ${posted.error}`);
			this.finish(review.id, { status: "posted", commentUrl: posted.html_url ?? null });
			this.deps.audit?.({
				workspaceId: workspace,
				actor: { kind: "grid", id: null, name: "Pull request reviews" },
				action: "review.posted",
				project: settings.project,
				sessionId: session.id,
				target: `${review.repo}#${review.number} ${review.title}`,
				detail: posted.html_url ?? null,
			});
		} catch (cause) {
			failed(cause instanceof ChatError || cause instanceof Error ? cause.message : String(cause));
		} finally {
			clearTimeout(timer);
		}
	}

	private async openPulls(repo: string): Promise<RestPull[] | { error: string }> {
		const result = await this.gh.run(
			["api", `repos/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=30`],
			{ timeoutMs: 30_000 },
		);
		if (result.code !== 0) return { error: (result.stderr || result.stdout).trim() };
		try {
			const list = JSON.parse(result.stdout) as unknown;
			return Array.isArray(list)
				? (list as RestPull[])
				: { error: "GitHub answered something else" };
		} catch {
			return { error: "GitHub answered something that is not JSON" };
		}
	}

	private async api<T>(path: string, extra: string[] = []): Promise<T | { error: string }> {
		const result = await this.gh.run(["api", path, ...extra], { timeoutMs: 30_000 });
		if (result.code !== 0)
			return { error: (result.stderr || result.stdout).trim() || `gh exited with ${result.code}` };
		try {
			return JSON.parse(result.stdout) as T;
		} catch {
			return { error: "GitHub answered something that is not JSON" };
		}
	}

	private async text(path: string, accept: string): Promise<string | { error: string }> {
		const result = await this.gh.run(["api", path, "-H", `Accept: ${accept}`], {
			timeoutMs: 60_000,
		});
		if (result.code !== 0)
			return { error: (result.stderr || result.stdout).trim() || `gh exited with ${result.code}` };
		return result.stdout;
	}

	close(): void {
		this.stop();
		this.db.close();
	}
}
