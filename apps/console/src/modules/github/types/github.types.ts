/** Pull requests as the runner reports them (apps/runner/src/github/pulls.ts). */

export type PullFilter = "mine" | "review" | "open";

/** Which pull requests a list holds. */
export type PullState = "open" | "merged" | "closed";

/** The Grid thread that made a pull request, from the branch it worked on. */
export type PullThread = { id: string; title: string; provider: string; role: string | null };

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
	createdAt?: string;
	updatedAt: string;
	url: string;
	/** The agent that made it (a provider id), from its author or description signature. */
	agent?: string | null;
	/** The Grid thread working on its branch, when one is. */
	thread?: PullThread | null;
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
	/** It comes from a fork: its branch is not on this repository. */
	fork?: boolean;
};

export type MergeMethod = "merge" | "squash" | "rebase";

/** A commit on a pull request's history. */
export type PullCommit = {
	sha: string;
	subject: string;
	at: string;
	author: string;
	agent: string | null;
	tags: string[];
};

/** How a pull request's branch sits on its base. */
export type PullHistory = {
	base: string;
	ahead: number;
	behind: number;
	/** The base's newest commit, when it has moved on since the branch left it. */
	baseTip: PullCommit | null;
	/** The branch's commits, newest first. */
	commits: PullCommit[];
	mergeBase: PullCommit | null;
};

export type ThreadComment = { author: string; agent: string | null; body: string; at: string };

/** A review thread on a line of a file. */
export type ReviewThread = {
	id: string;
	resolved: boolean;
	outdated: boolean;
	path: string;
	line: number | null;
	side: "LEFT" | "RIGHT";
	comments: ThreadComment[];
};

/** What a review reads: who looks, the threads, viewed files and each reviewer's verdict. */
export type PullReview = {
	viewer: string;
	pullId: string;
	viewed: string[];
	threads: ReviewThread[];
	reviews: { author: string; agent: string | null; state: string }[];
};

export type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

/** A comment written on a line of the changes, kept until the review is submitted. */
export type DraftComment = {
	id: string;
	path: string;
	line: number;
	side: "LEFT" | "RIGHT";
	body: string;
};

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
