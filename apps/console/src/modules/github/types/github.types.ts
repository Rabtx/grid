/** Pull requests as the runner reports them (apps/runner/src/github/pulls.ts). */

export type PullFilter = "mine" | "review" | "open";

export type CheckState = "passing" | "failing" | "pending" | "none";

export type Check = {
	name: string;
	workflow: string | null;
	state: "success" | "failure" | "pending" | "skipped" | "neutral";
	url: string | null;
};

export type PullSummary = {
	number: number;
	title: string;
	author: string;
	branch: string;
	base: string;
	draft: boolean;
	/** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or null when no review is needed. */
	review: string | null;
	checks: CheckState;
	labels: string[];
	additions: number;
	deletions: number;
	updatedAt: string;
	url: string;
};

export type PullComment = {
	author: string;
	body: string;
	at: string;
	/** For reviews: APPROVED, CHANGES_REQUESTED, COMMENTED. */
	review?: string;
};

export type PullDetail = PullSummary & {
	body: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	/** MERGEABLE, CONFLICTING or UNKNOWN. */
	mergeable: string;
	checkList: Check[];
	conversation: PullComment[];
	files: { path: string; additions: number; deletions: number }[];
	createdAt: string;
};

export type MergeMethod = "merge" | "squash" | "rebase";

export type PullAction = "ready" | "draft" | "close";

/** What a fix thread starts with; the sheet picks these. */
export type FixInclude = {
	/** The failing checks, with the last lines of their logs. */
	checks: boolean;
	/** The unresolved review comments. */
	comments: boolean;
	/** The pull request's description. */
	description: boolean;
};

/** What the runner would start a fix thread with: the pull request's branch and first message. */
export type FixPlan = {
	/** The worktree's branch: the pull request's own, or `grid/pr-<n>` for a fork's. */
	branch: string;
	/** The pull request comes from a fork. */
	fork: boolean;
	/** The first message for the thread. */
	message: string;
};
