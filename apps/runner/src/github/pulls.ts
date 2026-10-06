import { tmpdir } from "node:os";
import { join } from "node:path";

import { diffFromPatch, type FileDiff } from "../agents/diff";
import { remoteToUrl } from "../folders/folders";
import { agentOf } from "../folders/project-git";
import { GitHubError } from "./codespaces";
import type { Gh } from "./gh";

/**
 * A project's pull requests, through `gh` on the machine the project lives on: listed, opened
 * (description, checks, reviews, comments, changed files) and acted on (merge, ready, close,
 * comment). The repository is the project folder's `origin`; GitHub is reached with the
 * machine's own `gh` sign-in, which one person in this Grid has connected.
 */

export type PullFilter = "mine" | "review" | "open";

/** Which pull requests a list holds: still open, merged, or closed without merging. */
export type PullState = "open" | "merged" | "closed";

export type CheckState = "passing" | "failing" | "pending" | "none";

export type Check = {
	name: string;
	/** The workflow it belongs to, for GitHub Actions. */
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
	/** When it was opened. */
	createdAt: string;
	updatedAt: string;
	/** The commit at the tip of its branch: a new push is a new head. */
	head: string;
	url: string;
	/** The agent that made it (a provider id), from its author or the signature in its description. */
	agent: string | null;
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
	/** MERGEABLE, CONFLICTING or UNKNOWN (GitHub is still working it out). */
	mergeable: string;
	checkList: Check[];
	/** Reviews and comments, oldest first. */
	conversation: PullComment[];
	files: { path: string; additions: number; deletions: number }[];
	/** It comes from a fork: its branch is in another repository, not on `origin`. */
	fork: boolean;
};

/** One unresolved review comment on a pull request, with where it hangs. */
export type PullReviewComment = {
	author: string;
	/** The file it is on; empty for a comment that is not on a file. */
	path: string;
	/** The line in the file, or null when the comment is on the file as a whole. */
	line: number | null;
	body: string;
};

export type MergeMethod = "merge" | "squash" | "rebase";

type Rollup = {
	__typename?: string;
	name?: string;
	context?: string;
	workflowName?: string;
	status?: string;
	conclusion?: string;
	state?: string;
	detailsUrl?: string;
	targetUrl?: string;
};

type Person = { login?: string } | null;

type RawPull = {
	body?: string;
	number: number;
	title: string;
	author: Person;
	headRefName: string;
	baseRefName: string;
	isDraft: boolean;
	reviewDecision: string;
	statusCheckRollup: Rollup[] | null;
	labels: { name: string }[];
	additions: number;
	deletions: number;
	createdAt: string;
	updatedAt: string;
	headRefOid: string;
	url: string;
};

/** One review thread as GitHub's GraphQL answers it. */
type RawThread = {
	isResolved?: boolean;
	comments?: {
		nodes?: {
			author?: Person;
			path?: string;
			line?: number | null;
			originalLine?: number | null;
			body?: string;
		}[];
	};
};

type ThreadsAnswer = {
	data?: {
		repository?: {
			pullRequest?: { reviewThreads?: { nodes?: RawThread[] } | null } | null;
		} | null;
	} | null;
};

type RawDetail = RawPull & {
	isCrossRepository?: boolean;
	body: string;
	state: PullDetail["state"];
	mergeable: string;
	files: { path: string; additions: number; deletions: number }[];
	comments: { author: Person; body: string; createdAt: string }[];
	reviews: { author: Person; body: string; state: string; submittedAt: string }[];
};

// Review threads carry whether they are resolved and where each comment hangs; `gh pr view --json`
// does not, so this is asked of GitHub's GraphQL API.
const REVIEW_THREADS_QUERY = `query ReviewThreads($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 50) {
            nodes { author { login } path line originalLine body }
          }
        }
      }
    }
  }
}`;

const OPEN_LIST_FIELDS =
	"number,title,author,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,labels,additions,deletions,createdAt,updatedAt,headRefOid,url,body";
// When listing merged and closed pull requests, statusCheckRollup is omitted: resolving check runs across
// up to 100 pull requests causes GitHub's GraphQL API to time out or exceed complexity limits.
const CLOSED_LIST_FIELDS =
	"number,title,author,headRefName,baseRefName,isDraft,reviewDecision,labels,additions,deletions,createdAt,updatedAt,headRefOid,url,body";
const LIST_FIELDS = OPEN_LIST_FIELDS;
const DETAIL_FIELDS = `${LIST_FIELDS},state,mergeable,files,comments,reviews,isCrossRepository`;
const REPO = /^[\w.-]+\/[\w.-]+$/;

/** One check, whether GitHub Actions (a check run) or a commit status (a status context). */
export function readCheck(item: Rollup): Check {
	const name = item.name ?? item.context ?? "Check";
	const url = item.detailsUrl ?? item.targetUrl ?? null;
	const workflow = item.workflowName || null;
	if (item.__typename === "StatusContext" || item.state) {
		const state = item.state?.toUpperCase();
		return {
			name,
			workflow,
			url,
			state:
				state === "SUCCESS"
					? "success"
					: state === "FAILURE" || state === "ERROR"
						? "failure"
						: "pending",
		};
	}
	if (item.status !== "COMPLETED") return { name, workflow, url, state: "pending" };
	const conclusion = item.conclusion?.toUpperCase();
	const state =
		conclusion === "SUCCESS"
			? "success"
			: conclusion === "SKIPPED"
				? "skipped"
				: conclusion === "NEUTRAL"
					? "neutral"
					: "failure";
	return { name, workflow, url, state };
}

/** All of a pull request's checks as one state: any failure fails it, then any pending. */
export function checksState(checks: Check[]): CheckState {
	if (!checks.length) return "none";
	if (checks.some((check) => check.state === "failure")) return "failing";
	if (checks.some((check) => check.state === "pending")) return "pending";
	return "passing";
}

function summary(raw: RawPull): PullSummary {
	return {
		number: raw.number,
		title: raw.title,
		author: raw.author?.login ?? "ghost",
		branch: raw.headRefName || "",
		base: raw.baseRefName || "",
		draft: Boolean(raw.isDraft),
		review: raw.reviewDecision || null,
		checks: checksState((raw.statusCheckRollup ?? []).map(readCheck)),
		labels: (raw.labels ?? []).map((label) => label.name),
		additions: raw.additions ?? 0,
		deletions: raw.deletions ?? 0,
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		head: raw.headRefOid || "",
		url: raw.url,
		agent: pullAgent(raw.author?.login ?? "", raw.body ?? ""),
	};
}

/**
 * The agent behind a pull request: its author when an agent opened it under its own name, else
 * the signature lines agents leave in a description ("Generated with Claude Code",
 * "Co-Authored-By: …"). Only those lines are read: a description about Claude is not by it.
 */
export function pullAgent(author: string, body: string): string | null {
	const signatures = body
		.split("\n")
		.filter((line) => /generated with|co-authored-by|created by/i.test(line));
	return agentOf(author, "", signatures);
}

/** Reviews (with something to show) and comments, as one conversation in time order. */
export function conversation(raw: Pick<RawDetail, "comments" | "reviews">): PullComment[] {
	const comments = raw.comments.map((comment) => ({
		author: comment.author?.login ?? "ghost",
		body: comment.body,
		at: comment.createdAt,
	}));
	const reviews = raw.reviews
		.filter((review) => review.body.trim() || review.state !== "COMMENTED")
		.map((review) => ({
			author: review.author?.login ?? "ghost",
			body: review.body,
			at: review.submittedAt,
			review: review.state,
		}));
	return [...comments, ...reviews].sort((a, b) => a.at.localeCompare(b.at));
}

/** `gh pr diff` output (every file, git style) as one diff per file. */
export function splitDiff(text: string): FileDiff[] {
	const files: FileDiff[] = [];
	for (const part of text.split(/^(?=diff --git )/m)) {
		if (!part.startsWith("diff --git ")) continue;
		const path =
			part.match(/^\+\+\+ b\/(.+)$/m)?.[1] ??
			part.match(/^--- a\/(.+)$/m)?.[1] ??
			part.match(/^diff --git a\/(.+?) b\//)?.[1] ??
			"file";
		files.push(diffFromPatch(path, part));
	}
	return files;
}

/** The unresolved review comments in GitHub's answer, oldest thread first, nothing resolved. */
export function reviewComments(answer: ThreadsAnswer): PullReviewComment[] {
	const threads = answer.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
	const found: PullReviewComment[] = [];
	for (const thread of threads) {
		if (thread.isResolved) continue;
		for (const comment of thread.comments?.nodes ?? []) {
			const body = comment.body?.trim() ?? "";
			if (!body) continue;
			found.push({
				author: comment.author?.login ?? "ghost",
				path: comment.path ?? "",
				line: comment.line ?? comment.originalLine ?? null,
				body,
			});
		}
	}
	return found;
}

/** `owner/name` of a GitHub repository URL, or null for anything else. */
export function repoOf(url: string | null): string | null {
	const match = url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)\/?$/);
	return match && REPO.test(match[1]) ? match[1] : null;
}

export class PullRequests {
	constructor(
		private readonly gh: Gh,
		/** Throws unless this person is the one who connected GitHub here. */
		private readonly assertOwner: (userId: string) => void,
	) {}

	private async repository(folder: string): Promise<string> {
		// Asked of git, so a worktree (whose `.git` is a file) resolves like its main checkout. Not
		// spawned synchronously: the Inbox asks this for every linked project at once, and the
		// runner's event loop also carries every terminal and chat socket.
		const origin = Bun.spawn(["git", "-C", folder, "remote", "get-url", "origin"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const [out, code] = await Promise.all([new Response(origin.stdout).text(), origin.exited]);
		const url = code === 0 ? remoteToUrl(out) : null;
		const repo = repoOf(url);
		if (!repo) {
			throw new GitHubError("This project's folder has no GitHub repository as its origin", 409);
		}
		return repo;
	}

	private async output(args: string[]): Promise<string> {
		const result = await this.gh.run(args, { timeoutMs: 60_000 });
		if (result.code !== 0) {
			const said = result.stderr.trim().split("\n")[0];
			throw new GitHubError(said || "GitHub said no", 502);
		}
		return result.stdout;
	}

	private async json<T>(args: string[]): Promise<T> {
		const out = await this.output(args);
		try {
			return JSON.parse(out) as T;
		} catch {
			throw new GitHubError("GitHub's answer could not be read", 502);
		}
	}

	async list(
		userId: string,
		folder: string,
		filter: PullFilter,
		state: PullState = "open",
		limit = 100,
	): Promise<PullSummary[]> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		const args = ["pr", "list", "--repo", repo, "--state", state, "--limit", String(limit)];
		if (filter === "mine") args.push("--author", "@me");
		if (filter === "review") args.push("--search", "review-requested:@me");
		const fields = state === "open" ? OPEN_LIST_FIELDS : CLOSED_LIST_FIELDS;
		const rows = await this.json<RawPull[]>([...args, "--json", fields]);
		return rows.map(summary);
	}

	async view(userId: string, folder: string, number: number): Promise<PullDetail> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		const raw = await this.json<RawDetail>([
			"pr",
			"view",
			String(number),
			"--repo",
			repo,
			"--json",
			DETAIL_FIELDS,
		]);
		const checkList = (raw.statusCheckRollup ?? []).map(readCheck);
		return {
			...summary(raw),
			body: raw.body,
			state: raw.state,
			mergeable: raw.mergeable,
			checkList,
			conversation: conversation(raw),
			files: raw.files ?? [],
			fork: raw.isCrossRepository === true,
		};
	}

	async diff(userId: string, folder: string, number: number): Promise<FileDiff[]> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		return splitDiff(await this.output(["pr", "diff", String(number), "--repo", repo]));
	}

	/** A pull request's unresolved review comments, with the file and line they hang on. */
	async reviewComments(
		userId: string,
		folder: string,
		number: number,
	): Promise<PullReviewComment[]> {
		this.assertOwner(userId);
		const [owner, name] = (await this.repository(folder)).split("/");
		return reviewComments(
			await this.json<ThreadsAnswer>([
				"api",
				"graphql",
				"-f",
				`query=${REVIEW_THREADS_QUERY}`,
				"-f",
				`owner=${owner}`,
				"-f",
				`name=${name}`,
				"-F",
				`number=${number}`,
			]),
		);
	}

	/**
	 * The failed steps' log of an Actions job (or of a whole run when the job is not known), through
	 * `gh run view --log-failed`. Empty when there is nothing failed to show or the log cannot be
	 * read: a missing log is not a failure, but it is said in the runner's log.
	 */
	async failedLog(
		userId: string,
		folder: string,
		target: { run: number; job: number | null },
	): Promise<string> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		const which = target.job === null ? [String(target.run)] : ["--job", String(target.job)];
		const result = await this.gh.run(["run", "view", ...which, "--repo", repo, "--log-failed"], {
			timeoutMs: 60_000,
		});
		if (result.code !== 0) {
			console.warn(
				`[runner] no failed log for run ${target.run}:`,
				result.stderr.trim().split("\n")[0] || `gh exited ${result.code}`,
			);
			return "";
		}
		return result.stdout;
	}

	async merge(userId: string, folder: string, number: number, method: MergeMethod): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output(["pr", "merge", String(number), "--repo", repo, `--${method}`]);
	}

	/** Ready for review, or back to draft. */
	async ready(userId: string, folder: string, number: number, ready: boolean): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output([
			"pr",
			"ready",
			String(number),
			"--repo",
			repo,
			...(ready ? [] : ["--undo"]),
		]);
	}

	async close(userId: string, folder: string, number: number): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output(["pr", "close", String(number), "--repo", repo]);
	}

	async comment(userId: string, folder: string, number: number, body: string): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output(["pr", "comment", String(number), "--repo", repo, "--body", body]);
	}

	/**
	 * How a pull request's branch sits on its base: its own commits (from the pull request, so a
	 * merged one still shows what it brought), and while it is open, how far ahead and behind the
	 * base it is, the base's newest commit, and where the branch left it.
	 */
	async history(userId: string, folder: string, number: number): Promise<PullHistory> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		const pull = await this.json<{
			baseRefName: string;
			headRefOid: string;
			state: string;
			commits: RawPullCommit[];
		}>([
			"pr",
			"view",
			String(number),
			"--repo",
			repo,
			"--json",
			"baseRefName,headRefOid,state,commits",
		]);
		const base = pull.baseRefName;
		const tags = await this.json<{ name: string; commit: { sha: string } }[]>([
			"api",
			`repos/${repo}/tags?per_page=100`,
		]).catch(() => []);
		const tagsOf = (sha: string) =>
			tags.filter((tag) => tag.commit.sha === sha).map((tag) => tag.name);
		const commits = (pull.commits ?? []).map((raw) => pullCommitOf(raw, tagsOf(raw.oid))).reverse();
		if (pull.state !== "OPEN")
			return { base, ahead: commits.length, behind: 0, baseTip: null, commits, mergeBase: null };
		const compare = await this.json<RawCompare>([
			"api",
			`repos/${repo}/compare/${encodeURIComponent(base)}...${pull.headRefOid}`,
		]);
		const tip =
			compare.behind_by > 0
				? await this.json<RawCommit>(["api", `repos/${repo}/commits/${encodeURIComponent(base)}`])
				: null;
		return {
			base,
			ahead: compare.ahead_by,
			behind: compare.behind_by,
			baseTip: tip ? commitOf(tip, tagsOf(tip.sha)) : null,
			commits,
			mergeBase: compare.merge_base_commit
				? commitOf(compare.merge_base_commit, tagsOf(compare.merge_base_commit.sha))
				: null,
		};
	}

	/** Bring the branch up to date with its base by rebasing it on GitHub. */
	async rebase(userId: string, folder: string, number: number): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output(["pr", "update-branch", String(number), "--repo", repo, "--rebase"]);
	}

	/** Merge it, deleting its branch after when asked (the merge bar's "then delete <branch>"). */
	async mergeAndDelete(
		userId: string,
		folder: string,
		number: number,
		method: MergeMethod,
		deleteBranch: boolean,
	): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		await this.output([
			"pr",
			"merge",
			String(number),
			"--repo",
			repo,
			`--${method}`,
			...(deleteBranch ? ["--delete-branch"] : []),
		]);
	}

	/**
	 * What a review needs: who is looking, every review thread with its file, line and comments,
	 * which files the viewer marked viewed, and each reviewer's latest verdict.
	 */
	async review(userId: string, folder: string, number: number): Promise<PullReview> {
		this.assertOwner(userId);
		const [owner, name] = (await this.repository(folder)).split("/");
		return readReview(
			await this.json<ReviewAnswer>([
				"api",
				"graphql",
				"-f",
				`query=${REVIEW_QUERY}`,
				"-f",
				`owner=${owner}`,
				"-f",
				`name=${name}`,
				"-F",
				`number=${number}`,
			]),
		);
	}

	/** Mark a file viewed (or not) for the viewer, as GitHub's own checkbox does. */
	async setViewed(
		userId: string,
		folder: string,
		number: number,
		path: string,
		viewed: boolean,
	): Promise<void> {
		const { pullId } = await this.review(userId, folder, number);
		const mutation = viewed ? "markFileAsViewed" : "unmarkFileAsViewed";
		await this.output([
			"api",
			"graphql",
			"-f",
			`query=mutation($id: ID!, $path: String!) { ${mutation}(input: { pullRequestId: $id, path: $path }) { clientMutationId } }`,
			"-f",
			`id=${pullId}`,
			"-f",
			`path=${path}`,
		]);
	}

	/** Submit a review: a verdict, a summary, and comments on lines of the changes. */
	async submitReview(
		userId: string,
		folder: string,
		number: number,
		review: ReviewSubmission,
	): Promise<void> {
		this.assertOwner(userId);
		const repo = await this.repository(folder);
		// The comments ride in a JSON body, which `gh api` reads from a file.
		const file = join(tmpdir(), `grid-review-${crypto.randomUUID()}.json`);
		await Bun.write(
			file,
			JSON.stringify({
				event: review.event,
				...(review.body.trim() ? { body: review.body.trim() } : {}),
				comments: review.comments.map((comment) => ({
					path: comment.path,
					line: comment.line,
					side: comment.side,
					body: comment.body,
				})),
			}),
		);
		try {
			await this.output([
				"api",
				"-X",
				"POST",
				`repos/${repo}/pulls/${number}/reviews`,
				"--input",
				file,
			]);
		} finally {
			await Bun.file(file)
				.delete()
				.catch(() => undefined);
		}
	}
}

/** A commit on a pull request's history. */
export type PullCommit = {
	sha: string;
	subject: string;
	at: string;
	author: string;
	/** The agent that made it, from its author or co-author trailers. */
	agent: string | null;
	/** Tags pointing at it ("v0.8.2"). */
	tags: string[];
};

export type PullHistory = {
	base: string;
	/** Commits on the branch not on its base, and on the base not on the branch. */
	ahead: number;
	behind: number;
	/** The base's newest commit, when the base has moved on since the branch left it. */
	baseTip: PullCommit | null;
	/** The branch's commits, newest first. */
	commits: PullCommit[];
	/** Where the branch left its base. */
	mergeBase: PullCommit | null;
};

type RawCommit = {
	sha: string;
	author?: Person;
	commit: { message: string; author?: { name?: string; email?: string; date?: string } };
};

/** A commit as `gh pr view --json commits` gives it. */
type RawPullCommit = {
	oid: string;
	messageHeadline?: string;
	messageBody?: string;
	authoredDate?: string;
	authors?: { login?: string; name?: string; email?: string }[];
};

export function pullCommitOf(raw: RawPullCommit, tags: string[] = []): PullCommit {
	const [first] = raw.authors ?? [];
	const author = first?.login || first?.name || "ghost";
	const coauthors = [
		...(raw.authors ?? []).slice(1).map((who) => `${who.name ?? ""} ${who.email ?? ""}`),
		...[...(raw.messageBody ?? "").matchAll(/^co-authored-by:\s*(.+)$/gim)].map(
			(match) => match[1],
		),
	];
	return {
		sha: raw.oid,
		subject: raw.messageHeadline ?? "",
		at: raw.authoredDate ?? "",
		author,
		agent: agentOf(author, first?.email ?? "", coauthors),
		tags,
	};
}

type RawCompare = {
	ahead_by: number;
	behind_by: number;
	commits: RawCommit[];
	merge_base_commit?: RawCommit;
};

export function commitOf(raw: RawCommit, tags: string[] = []): PullCommit {
	const message = raw.commit.message ?? "";
	const [subject = ""] = message.split("\n");
	const author = raw.author?.login ?? raw.commit.author?.name ?? "ghost";
	const coauthors = [...message.matchAll(/^co-authored-by:\s*(.+)$/gim)].map((match) => match[1]);
	return {
		sha: raw.sha,
		subject,
		at: raw.commit.author?.date ?? "",
		author,
		agent: agentOf(author, raw.commit.author?.email ?? "", coauthors),
		tags,
	};
}

/** One comment in a review thread. */
export type ThreadComment = { author: string; agent: string | null; body: string; at: string };

/** A review thread hanging on a line of a file. */
export type ReviewThread = {
	id: string;
	resolved: boolean;
	/** The code it was left on has changed since. */
	outdated: boolean;
	path: string;
	line: number | null;
	side: "LEFT" | "RIGHT";
	comments: ThreadComment[];
};

export type PullReview = {
	/** Who is looking, by their GitHub login. */
	viewer: string;
	pullId: string;
	/** Files the viewer marked viewed. */
	viewed: string[];
	threads: ReviewThread[];
	/** Each reviewer's latest verdict: APPROVED, CHANGES_REQUESTED, COMMENTED. */
	reviews: { author: string; agent: string | null; state: string }[];
};

/** A review as the person submits it. */
export type ReviewSubmission = {
	event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
	body: string;
	comments: { path: string; line: number; side: "LEFT" | "RIGHT"; body: string }[];
};

type ReviewAnswer = {
	data?: {
		viewer?: { login?: string } | null;
		repository?: {
			pullRequest?: {
				id?: string;
				files?: { nodes?: { path?: string; viewerViewedState?: string }[] } | null;
				reviewThreads?: {
					nodes?: {
						id?: string;
						isResolved?: boolean;
						isOutdated?: boolean;
						path?: string;
						line?: number | null;
						originalLine?: number | null;
						diffSide?: string;
						comments?: {
							nodes?: { author?: Person; body?: string; createdAt?: string }[];
						};
					}[];
				} | null;
				latestReviews?: { nodes?: { author?: Person; state?: string }[] } | null;
			} | null;
		} | null;
	} | null;
};

const REVIEW_QUERY = `query Review($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      files(first: 100) { nodes { path viewerViewedState } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line originalLine diffSide
          comments(first: 50) { nodes { author { login } body createdAt } }
        }
      }
      latestReviews(first: 20) { nodes { author { login } state } }
    }
  }
}`;

export function readReview(answer: ReviewAnswer): PullReview {
	const pull = answer.data?.repository?.pullRequest;
	if (!pull?.id) throw new GitHubError("GitHub did not say what this pull request holds", 502);
	return {
		viewer: answer.data?.viewer?.login ?? "",
		pullId: pull.id,
		viewed: (pull.files?.nodes ?? [])
			.filter((file) => file.viewerViewedState === "VIEWED" && file.path)
			.map((file) => file.path as string),
		threads: (pull.reviewThreads?.nodes ?? []).map((thread) => ({
			id: thread.id ?? "",
			resolved: thread.isResolved === true,
			outdated: thread.isOutdated === true,
			path: thread.path ?? "",
			line: thread.line ?? thread.originalLine ?? null,
			side: thread.diffSide === "LEFT" ? "LEFT" : "RIGHT",
			comments: (thread.comments?.nodes ?? []).map((comment) => {
				const author = comment.author?.login ?? "ghost";
				return {
					author,
					agent: agentOf(author, "", []),
					body: comment.body ?? "",
					at: comment.createdAt ?? "",
				};
			}),
		})),
		reviews: (pull.latestReviews?.nodes ?? []).map((review) => {
			const author = review.author?.login ?? "ghost";
			return { author, agent: agentOf(author, "", []), state: review.state ?? "" };
		}),
	};
}
