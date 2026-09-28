import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { PullRequests, PullSummary } from "../github/pulls";
import { GitHubError } from "../github/codespaces";

import type { InboxDraft, InboxKind, InboxStore } from "./store";

/** How GitHub reaches the inbox, and who is allowed to ask. */
export type GithubDeps = {
	pulls: PullRequests;
	/** Whether this person is the one who connected GitHub here. Never throws. */
	isOwner: (userId: string) => boolean;
	/** Each project's folder in this workspace, by project slug. */
	foldersOf: (workspaceId: string) => Record<string, string>;
	/** Forward the items found by this refresh to saved jobs; no separate GitHub polling. */
	onEvents?: (
		workspace: string,
		ownerId: string,
		project: string,
		type: "pull_opened" | "review_requested" | "checks_failed",
		itemId: string,
	) => void;
	onError?: (workspace: string, ownerId: string, project: string, message: string) => void;
	needsOpen?: (workspace: string, ownerId: string, project: string) => boolean;
	/** How long a refresh is worth, so opening the inbox twice does not ask `gh` twice. */
	freshForMs?: number;
	/** How soon the page's own Refresh may ask again, so a pressed button cannot hammer `gh`. */
	refreshFloorMs?: number;
	/** Now, injectable for tests. */
	now?: () => number;
};

/** The kinds a GitHub refresh supplies, and so the only ones it may take back. */
const GITHUB_KINDS: readonly InboxKind[] = ["pull_review", "pull_checks"];

/**
 * How many projects one refresh asks about. A workspace with more than this still works; it just
 * does not answer for the projects past here, rather than spawning `gh` for every folder on the
 * machine every time someone opens the page.
 */
const MAX_PROJECTS = 12;

/**
 * Only folders inside the projects directory count, the same containment the pull request routes
 * use. A folder linked before that was narrowed reads as not linked.
 */
export async function linkedFolders(
	folders: Record<string, string>,
	projectsDir: string,
): Promise<Record<string, string>> {
	const inside: Record<string, string> = {};
	const root = await realpath(projectsDir);
	for (const [project, folder] of Object.entries(folders)) {
		try {
			const target = await realpath(folder);
			const path = relative(root, target);
			if (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
				inside[project] = target;
		} catch {
			continue;
		}
	}
	return inside;
}

/**
 * One project's waiting pull requests, as the rows to keep: the reviews asked of the person, and
 * the failing checks on their own pull requests. The rows are the person's alone (it is their
 * GitHub that answered), and the workspace is in the id so two workspaces with a project of the
 * same name never share one.
 */
function draftsFor(
	owner: { userId: string; workspaceId: string },
	project: string,
	reviews: PullSummary[],
	mine: PullSummary[],
): InboxDraft[] {
	const now = new Date().toISOString();
	const url = (number: number) => `/pulls/${encodeURIComponent(project)}?pr=${number}`;
	const base = { workspaceId: owner.workspaceId, ownerId: owner.userId, project };
	const key = (kind: InboxKind, number: number) =>
		`${kind}:${owner.workspaceId}:${project}:${number}`;
	const drafts: InboxDraft[] = reviews.map((pull) => ({
		...base,
		id: key("pull_review", pull.number),
		kind: "pull_review",
		title: pull.title,
		body: `@${pull.author} asked for your review`,
		url: url(pull.number),
		createdAt: pull.updatedAt || now,
	}));
	for (const pull of mine) {
		if (pull.checks !== "failing") continue;
		drafts.push({
			...base,
			id: key("pull_checks", pull.number),
			kind: "pull_checks",
			title: pull.title,
			body: "Checks are failing",
			url: url(pull.number),
			createdAt: pull.updatedAt || now,
		});
	}
	return drafts;
}

/**
 * Keeps what GitHub still wants from the person, and forgets what it no longer does: a review
 * given, a check fixed, a pull request merged. GitHub has no webhook to receive here, so the inbox
 * asks `gh` itself — throttled, per project, and never letting one project's failure take the
 * others' items with it.
 */
export class GithubInbox {
	private syncedAt = new Map<string, number>();
	/** A refresh under way per workspace, so two tabs opening the page share one set of `gh` calls. */
	private inFlight = new Map<string, Promise<boolean>>();
	private readonly freshForMs: number;
	private readonly refreshFloorMs: number;
	private readonly now: () => number;

	constructor(
		private readonly store: InboxStore,
		private readonly deps: GithubDeps,
	) {
		this.freshForMs = deps.freshForMs ?? 60_000;
		this.refreshFloorMs = deps.refreshFloorMs ?? 10_000;
		this.now = deps.now ?? Date.now;
	}

	/** Whether GitHub is this person's to ask. Somebody else's sign-in is not ours to read. */
	available(userId: string): boolean {
		return this.deps.isOwner(userId);
	}

	/**
	 * Whether the last refresh is old enough that asking GitHub again is worth it. `forced` is the
	 * page's own Refresh, which only has to clear the shorter floor.
	 */
	stale(workspaceId: string, forced = false): boolean {
		const last = this.syncedAt.get(workspaceId);
		const wait = forced ? this.refreshFloorMs : this.freshForMs;
		return last === undefined || this.now() - last >= wait;
	}

	/**
	 * Asks GitHub about every linked project, keeping what it finds. Returns whether the inbox could
	 * look: false when GitHub is not this person's to ask, which the page shows as a hint rather
	 * than an error.
	 */
	sync(userId: string, workspaceId: string, projectsDir: string): Promise<boolean> {
		if (!this.available(userId)) return Promise.resolve(false);
		const running = this.inFlight.get(workspaceId);
		if (running) return running;
		const run = this.syncAll(userId, workspaceId, projectsDir).finally(() => {
			this.inFlight.delete(workspaceId);
		});
		this.inFlight.set(workspaceId, run);
		return run;
	}

	private async syncAll(
		userId: string,
		workspaceId: string,
		projectsDir: string,
	): Promise<boolean> {
		const linked = this.deps.foldersOf(workspaceId);
		const valid = await linkedFolders(linked, projectsDir);
		for (const project of Object.keys(linked)) {
			if (!valid[project])
				this.deps.onError?.(
					workspaceId,
					userId,
					project,
					"The linked project folder is unavailable or outside the projects directory",
				);
		}
		const folders = Object.entries(valid).slice(0, MAX_PROJECTS);
		await Promise.all(
			folders.map(async ([project, folder]) => {
				try {
					await this.syncProject(userId, workspaceId, project, folder);
				} catch (cause) {
					// A folder without a GitHub origin, a repository that will not answer: the
					// project's items stay as they were, and the other projects carry on.
					console.warn(
						`[inbox] ${project}: ${cause instanceof GitHubError ? cause.message : cause}`,
					);
					this.deps.onError?.(
						workspaceId,
						userId,
						project,
						cause instanceof Error ? cause.message : String(cause),
					);
				}
			}),
		);
		this.syncedAt.set(workspaceId, this.now());
		return true;
	}

	private async syncProject(
		userId: string,
		workspaceId: string,
		project: string,
		folder: string,
	): Promise<void> {
		const { pulls } = this.deps;
		// One after the other: the projects already run side by side, and that is enough `gh`.
		const reviews = await pulls.list(userId, folder, "review");
		const mine = await pulls.list(userId, folder, "mine");
		if (this.deps.onEvents) {
			if (this.deps.needsOpen?.(workspaceId, userId, project)) {
				try {
					const open = await pulls.list(userId, folder, "open");
					for (const pull of open)
						this.deps.onEvents(workspaceId, userId, project, "pull_opened", String(pull.number));
				} catch (cause) {
					console.warn(`[inbox] ${project}: could not check opened pull requests`, cause);
				}
			}
			for (const pull of reviews)
				this.deps.onEvents(workspaceId, userId, project, "review_requested", String(pull.number));
			for (const pull of mine)
				if (pull.checks === "failing")
					this.deps.onEvents(workspaceId, userId, project, "checks_failed", String(pull.number));
		}
		const drafts = draftsFor({ userId, workspaceId }, project, reviews, mine);
		for (const draft of drafts) this.store.keep(draft);
		this.store.forgetMissing(
			workspaceId,
			project,
			GITHUB_KINDS,
			drafts.map((draft) => draft.id),
		);
	}
}
