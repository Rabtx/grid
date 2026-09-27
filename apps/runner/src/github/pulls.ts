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

type RawDetail = RawPull & {
	body: string;
	state: PullDetail["state"];
	mergeable: string;
	createdAt: string;
	files: { path: string; additions: number; deletions: number }[];
	comments: { author: Person; body: string; createdAt: string }[];
	reviews: { author: Person; body: string; state: string; submittedAt: string }[];
};

const LIST_FIELDS =
	"number,title,author,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,labels,additions,deletions,updatedAt,url";
const DETAIL_FIELDS = `${LIST_FIELDS},body,state,mergeable,createdAt,files,comments,reviews`;
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
		};
	}

	async diff(userId: string, folder: string, number: number): Promise<FileDiff[]> {
		this.assertOwner(userId);
		const repo = this.repository(folder);
		return splitDiff(await this.output(["pr", "diff", String(number), "--repo", repo]));
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
