import { insideProjectsDir } from "../folders/folders";
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
	/** How long a refresh is worth, so opening the inbox twice does not ask `gh` twice. */
	freshForMs?: number;
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
export function linkedFolders(
	folders: Record<string, string>,
	projectsDir: string,
): Record<string, string> {
	const inside: Record<string, string> = {};
	for (const [project, folder] of Object.entries(folders)) {
		try {
			inside[project] = insideProjectsDir(folder, projectsDir);
		} catch {
			continue;
		}
	}
	return inside;
}

/** One project's waiting pull requests, as the rows to keep. */
function draftsFor(project: string, reviews: PullSummary[], open: PullSummary[]): InboxDraft[] {
	const now = new Date().toISOString();
	const url = (number: number) => `/pulls/${encodeURIComponent(project)}?pr=${number}`;
	const drafts: InboxDraft[] = reviews.map((pull) => ({
		id: `pull_review:${project}:${pull.number}`,
		workspaceId: "",
		kind: "pull_review",
		project,
		title: pull.title,
		body: `@${pull.author} asked for your review`,
		url: url(pull.number),
		createdAt: pull.updatedAt || now,
	}));
	for (const pull of open) {
		if (pull.checks !== "failing") continue;
		drafts.push({
			id: `pull_checks:${project}:${pull.number}`,
			workspaceId: "",
			kind: "pull_checks",
			project,
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
	private readonly freshForMs: number;
	private readonly now: () => number;

	constructor(
		private readonly store: InboxStore,
		private readonly deps: GithubDeps,
	) {
		this.freshForMs = deps.freshForMs ?? 60_000;
		this.now = deps.now ?? Date.now;
	}

	/** Whether GitHub is this person's to ask. Somebody else's sign-in is not ours to read. */
	available(userId: string): boolean {
		return this.deps.isOwner(userId);
	}

	/** Whether the last refresh is old enough that asking GitHub again is worth it. */
	stale(workspaceId: string): boolean {
		const last = this.syncedAt.get(workspaceId);
		return last === undefined || this.now() - last >= this.freshForMs;
	}

	/**
	 * Asks GitHub about every linked project, keeping what it finds. Returns whether the inbox could
	 * look: false when GitHub is not this person's to ask, which the page shows as a hint rather
	 * than an error.
	 */
	async sync(userId: string, workspaceId: string, projectsDir: string): Promise<boolean> {
		if (!this.available(userId)) return false;
		const folders = Object.entries(
			linkedFolders(this.deps.foldersOf(workspaceId), projectsDir),
		).slice(0, MAX_PROJECTS);
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
		const reviews = await pulls.list(userId, folder, "review");
		const open = await pulls.list(userId, folder, "open");
		const drafts = draftsFor(project, reviews, open).map((draft) => ({
			...draft,
			workspaceId,
		}));
		for (const draft of drafts) this.store.keep(draft);
		this.store.forgetMissing(
			workspaceId,
			project,
			GITHUB_KINDS,
			drafts.map((draft) => draft.id),
		);
	}
}
