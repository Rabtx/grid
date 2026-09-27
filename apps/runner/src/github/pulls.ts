import { diffFromPatch, type FileDiff } from "../agents/diff";
import { remoteToUrl } from "../folders/folders";
import { GitHubError } from "./codespaces";
import type { Gh } from "./gh";

/**
 * A project's pull requests, through `gh` on the machine the project lives on: listed, opened
 * (description, checks, reviews, comments, changed files) and acted on (merge, ready, close,
 * comment). The repository is the project folder's `origin`; GitHub is reached with the
 * machine's own `gh` sign-in, which one person in this Grid has connected.
 */

export type PullFilter = "mine" | "review" | "open";

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
	/** MERGEABLE, CONFLICTING or UNKNOWN (GitHub is still working it out). */
	mergeable: string;
	checkList: Check[];
	/** Reviews and comments, oldest first. */
	conversation: PullComment[];
	files: { path: string; additions: number; deletions: number }[];
	createdAt: string;
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
	updatedAt: string;
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
	createdAt: string;
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

const LIST_FIELDS =
	"number,title,author,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,labels,additions,deletions,updatedAt,url";
const DETAIL_FIELDS = `${LIST_FIELDS},body,state,mergeable,createdAt,files,comments,reviews,isCrossRepository`;
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
		branch: raw.headRefName,
		base: raw.baseRefName,
		draft: raw.isDraft,
		review: raw.reviewDecision || null,
		checks: checksState((raw.statusCheckRollup ?? []).map(readCheck)),
		labels: raw.labels.map((label) => label.name),
		additions: raw.additions,
		deletions: raw.deletions,
		updatedAt: raw.updatedAt,
		url: raw.url,
	};
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

	private repository(folder: string): string {
		// Asked of git, so a worktree (whose `.git` is a file) resolves like its main checkout.
		const origin = Bun.spawnSync(["git", "-C", folder, "remote", "get-url", "origin"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const url = origin.exitCode === 0 ? remoteToUrl(origin.stdout.toString()) : null;
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

	async list(userId: string, folder: string, filter: PullFilter): Promise<PullSummary[]> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
		const args = ["pr", "list", "--repo", repo, "--state", "open", "--limit", "100"];
		if (filter === "mine") args.push("--author", "@me");
		if (filter === "review") args.push("--search", "review-requested:@me");
		const rows = await this.json<RawPull[]>([...args, "--json", LIST_FIELDS]);
		return rows.map(summary);
	}

	async view(userId: string, folder: string, number: number): Promise<PullDetail> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
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
			createdAt: raw.createdAt,
			fork: raw.isCrossRepository === true,
		};
	}

	async diff(userId: string, folder: string, number: number): Promise<FileDiff[]> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
		return splitDiff(await this.output(["pr", "diff", String(number), "--repo", repo]));
	}

	/** A pull request's unresolved review comments, with the file and line they hang on. */
	async reviewComments(
		userId: string,
		folder: string,
		number: number,
	): Promise<PullReviewComment[]> {
		this.assertOwner(userId);
		const [owner, name] = this.repository(folder).split("/");
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
		const repo = this.repository(folder);
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
		const repo = this.repository(folder);
		await this.output(["pr", "merge", String(number), "--repo", repo, `--${method}`]);
	}

	/** Ready for review, or back to draft. */
	async ready(userId: string, folder: string, number: number, ready: boolean): Promise<void> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
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
		const repo = this.repository(folder);
		await this.output(["pr", "close", String(number), "--repo", repo]);
	}

	async comment(userId: string, folder: string, number: number, body: string): Promise<void> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
		await this.output(["pr", "comment", String(number), "--repo", repo, "--body", body]);
	}
}
