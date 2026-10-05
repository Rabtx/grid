import { GitHubError } from "../github/codespaces";
import { runOf } from "../github/fix";
import type { Gh } from "../github/gh";
import {
	changeTitle,
	DEPLOYMENTS_QUERY,
	type Deployment,
	type DeploymentNode,
	readDeployment,
	tagsByCommit,
} from "./deployments";

/** One check on a commit: a check run (GitHub Actions and apps) or a commit status (Vercel…). */
export type ShipCheck = {
	name: string;
	state: "success" | "failure" | "pending" | "skipped" | "neutral";
	/** How long it ran, for one that finished. */
	seconds: number | null;
	startedAt: string | null;
	url: string | null;
	/** The Actions run and job behind it, when it is one. */
	run: number | null;
	job: number | null;
};

export type RepoDeployments = {
	defaultBranch: string;
	head: string;
	deployments: Deployment[];
	tags: Map<string, string[]>;
	tagNames: string[];
};

export type Comparison = {
	ahead: number;
	commits: { sha: string; title: string; author: string; email: string; message: string }[];
	files: { path: string; status: string }[];
};

/** An open pull request with what Ship needs: its branch, head and checks. */
export type OpenPull = {
	number: number;
	title: string;
	branch: string;
	head: string;
	author: string;
	body: string;
	updatedAt: string;
	url: string;
	checks: { state: ShipCheck["state"] }[];
};

type RawCheckRun = {
	name: string;
	status: string;
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
	html_url: string | null;
	details_url: string | null;
};

type RawStatus = {
	context: string;
	state: string;
	target_url: string | null;
	created_at: string;
	updated_at: string;
};

function seconds(from: string | null, to: string | null): number | null {
	if (!from || !to) return null;
	const value = Math.round((Date.parse(to) - Date.parse(from)) / 1000);
	return Number.isFinite(value) && value >= 0 ? value : null;
}

function runState(run: RawCheckRun): ShipCheck["state"] {
	if (run.status !== "completed") return "pending";
	switch (run.conclusion) {
		case "success":
			return "success";
		case "skipped":
			return "skipped";
		case "neutral":
			return "neutral";
		default:
			// failure, cancelled, timed_out, action_required, stale
			return "failure";
	}
}

/** A commit's checks, the newest run of each name only (a re-run leaves the old one behind). */
export function readChecks(
	runs: readonly RawCheckRun[],
	statuses: readonly RawStatus[],
): ShipCheck[] {
	const found = new Map<string, ShipCheck>();
	const newestFirst = [...runs].sort((a, b) =>
		(b.started_at ?? "").localeCompare(a.started_at ?? ""),
	);
	for (const run of newestFirst) {
		if (found.has(run.name)) continue;
		const url = run.html_url ?? run.details_url;
		const target = runOf(url);
		found.set(run.name, {
			name: run.name,
			state: runState(run),
			seconds: seconds(run.started_at, run.completed_at),
			startedAt: run.started_at,
			url,
			run: target?.run ?? null,
			job: target?.job ?? null,
		});
	}
	for (const status of [...statuses].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
		if (found.has(status.context)) continue;
		found.set(status.context, {
			name: status.context,
			state:
				status.state === "success" ? "success" : status.state === "pending" ? "pending" : "failure",
			seconds: status.state === "pending" ? null : seconds(status.created_at, status.updated_at),
			startedAt: status.created_at,
			url: status.target_url,
			run: null,
			job: null,
		});
	}
	return [...found.values()].sort(
		(a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.name.localeCompare(b.name),
	);
}

/** What a commit's checks add up to. */
export function checksSummary(checks: readonly { state: ShipCheck["state"] }[]) {
	const count = (state: ShipCheck["state"]) =>
		checks.filter((check) => check.state === state).length;
	return {
		total: checks.length,
		passed: count("success") + count("neutral") + count("skipped"),
		failed: count("failure"),
		pending: count("pending"),
	};
}

// Lines that say what broke: a failing test, an assertion, a compiler or runtime error.
const FAILURE =
	/^(\S+ \S+: )?\s*(FAIL|FAILED)\b|\(fail\)|✗|✘|AssertionError|^\s*error(\[\w+\])?:|^\s*Error:|\berror TS\d+|panicked at|Traceback \(most recent/;
// GitHub's own lines and the steps that only set up or clean up.
const NOISE = /^##\[(?!error)|^\[command\]|^Post job cleanup|^Cleaning up orphan/;
// A failure annotation a test runner or compiler printed: `::error file=a.ts,line=3::message`.
const ANNOTATION = /::error(?: (.*?))?::(.*)$/;

/** An annotation's escapes undone (`%0A` is a new line, `%3A` a colon). */
function unescape(text: string): string {
	return text
		.replace(/%0D/g, "")
		.replace(/%0A/g, "\n")
		.replace(/%3A/g, ":")
		.replace(/%2C/g, ",")
		.replace(/%25/g, "%");
}

/** The failures a log annotated, where each is and what it says, skipping dependencies' own. */
function annotations(lines: readonly string[]): string[] {
	const found: string[] = [];
	for (const line of lines) {
		const match = ANNOTATION.exec(line);
		if (!match) continue;
		const props = new Map(
			(match[1] ?? "").split(",").map((pair) => {
				const [key = "", ...value] = pair.split("=");
				return [key.trim(), unescape(value.join("="))] as const;
			}),
		);
		const file = props.get("file");
		// A dependency's or the runtime's own frame says less than the test that failed.
		if (file?.includes("node_modules/") || file?.startsWith("internal:")) continue;
		const where = file ? `${file}${props.get("line") ? `:${props.get("line")}` : ""}` : null;
		const text = [props.get("title"), ...unescape(match[2] ?? "").split("\n")]
			.filter((part): part is string => Boolean(part?.trim()))
			.map((part) => (where ? `  ${part.trimEnd()}` : part.trimEnd()));
		const entry = [where, ...text].filter(Boolean).join("\n");
		if (!found.includes(entry)) found.push(entry);
	}
	return found;
}

/**
 * The lines of a failed log that say why. The failures it annotated (`::error file=…`) when there
 * are any; else from just before the first line that names a failure; else the last lines up to
 * GitHub's error. Job and step columns, timestamps, colours and GitHub's bookkeeping are dropped,
 * and what follows the last `##[error]` (the clean-up) is cut. At most `max` lines.
 */
export function logExcerpt(log: string, max = 16): string {
	let lines = log
		// oxlint-disable-next-line no-control-regex -- escape sequences are made of control characters
		.replace(/(\x1b|\^\[)\[[0-9;]*[A-Za-z]/g, "")
		.split("\n")
		.map((line) =>
			line
				.replace(/^[^\t]*\t[^\t]*\t/, "")
				.replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, "")
				.trimEnd(),
		);
	const cap = (list: readonly string[]) =>
		list
			.slice(0, max)
			.map((line) => (line.length > 240 ? `${line.slice(0, 240)} …` : line))
			.join("\n");
	const annotated = annotations(lines);
	if (annotated.length) return cap(annotated.join("\n").split("\n"));
	const lastError = lines.findLastIndex((line) => line.startsWith("##[error]"));
	if (lastError !== -1) lines = lines.slice(0, lastError + 1);
	lines = lines
		.filter((line) => line.trim() && !NOISE.test(line))
		.map((line) => line.replace(/^##\[error\]/, "Error: "));
	const first = lines.findIndex((line) => FAILURE.test(line));
	const start =
		first === -1 || first >= lines.length - 1
			? Math.max(0, lines.length - max)
			: Math.max(0, first - 1);
	return cap(lines.slice(start));
}

/** Ship's reads and writes on GitHub, through the machine's `gh`. */
export class ShipGitHub {
	constructor(private readonly gh: Gh) {}

	private async output(args: string[], timeoutMs = 30_000): Promise<string> {
		const result = await this.gh.run(args, { timeoutMs });
		if (result.code !== 0) {
			const said = result.stderr.trim().split("\n")[0];
			if (/auth login|not logged/i.test(said)) throw new GitHubError("Connect GitHub first", 409);
			throw new GitHubError(said || "GitHub said no", 502);
		}
		return result.stdout;
	}

	private async json<T>(args: string[], timeoutMs?: number): Promise<T> {
		const out = await this.output(args, timeoutMs);
		try {
			return JSON.parse(out) as T;
		} catch {
			throw new GitHubError("GitHub's answer could not be read", 502);
		}
	}

	async deployments(repo: string): Promise<RepoDeployments> {
		const [owner, name] = repo.split("/");
		const answer = await this.json<{
			data?: {
				repository?: {
					defaultBranchRef: { name: string; target: { oid: string } } | null;
					deployments: { nodes: DeploymentNode[] };
					refs: { nodes: { name: string; target: { oid: string; target?: { oid: string } } }[] };
				};
			};
		}>([
			"api",
			"graphql",
			"-f",
			`query=${DEPLOYMENTS_QUERY}`,
			"-f",
			`owner=${owner}`,
			"-f",
			`name=${name}`,
		]);
		const repository = answer.data?.repository;
		if (!repository) throw new GitHubError("GitHub did not find this repository", 404);
		return {
			defaultBranch: repository.defaultBranchRef?.name ?? "main",
			head: repository.defaultBranchRef?.target.oid ?? "",
			deployments: repository.deployments.nodes.map(readDeployment),
			tags: tagsByCommit(repository.refs.nodes),
			tagNames: repository.refs.nodes.map((node) => node.name),
		};
	}

	/** What `head` has that `base` does not: commits (newest last) and the files they touch. */
	async compare(repo: string, base: string, head: string): Promise<Comparison> {
		const raw = await this.json<{
			ahead_by: number;
			commits: {
				sha: string;
				commit: { message: string; author: { name: string; email: string } | null };
				author: { login: string } | null;
			}[];
			files?: { filename: string; status: string }[];
		}>(["api", `repos/${repo}/compare/${base}...${head}`]);
		return {
			ahead: raw.ahead_by,
			commits: raw.commits.map((commit) => {
				const [headline = "", ...rest] = commit.commit.message.split("\n");
				const body = rest.join("\n");
				const merge = /^Merge (pull request|branch) /.test(headline);
				return {
					sha: commit.sha,
					title: merge
						? (body
								.split("\n")
								.find((line) => line.trim())
								?.trim() ?? headline)
						: headline,
					author: commit.author?.login ?? commit.commit.author?.name ?? "someone",
					email: commit.commit.author?.email ?? "",
					message: commit.commit.message,
				};
			}),
			files: (raw.files ?? []).map((file) => ({ path: file.filename, status: file.status })),
		};
	}

	async checks(repo: string, sha: string): Promise<ShipCheck[]> {
		const [runs, status] = await Promise.all([
			this.json<{ check_runs: RawCheckRun[] }>([
				"api",
				`repos/${repo}/commits/${sha}/check-runs?per_page=100`,
			]),
			this.json<{ statuses: RawStatus[] }>(["api", `repos/${repo}/commits/${sha}/status`]).catch(
				() => ({ statuses: [] }),
			),
		]);
		return readChecks(runs.check_runs, status.statuses);
	}

	/** A commit's subject and who pushed it. */
	async commit(
		repo: string,
		sha: string,
	): Promise<{ title: string; author: string; email: string; at: string; message: string }> {
		const raw = await this.json<{
			commit: { message: string; author: { name: string; email: string; date: string } | null };
			author: { login: string } | null;
		}>(["api", `repos/${repo}/commits/${sha}`]);
		const [headline = "", ...rest] = raw.commit.message.split("\n");
		return {
			title: changeTitle(headline, rest.join("\n")),
			author: raw.author?.login ?? raw.commit.author?.name ?? "someone",
			email: raw.commit.author?.email ?? "",
			at: raw.commit.author?.date ?? "",
			message: raw.commit.message,
		};
	}

	async openPulls(repo: string): Promise<OpenPull[]> {
		const rows = await this.json<
			{
				number: number;
				title: string;
				headRefName: string;
				headRefOid: string;
				author: { login: string } | null;
				body: string;
				updatedAt: string;
				url: string;
				statusCheckRollup:
					| { __typename: string; status?: string; conclusion?: string; state?: string }[]
					| null;
			}[]
		>([
			"pr",
			"list",
			"--repo",
			repo,
			"--state",
			"open",
			"--limit",
			"50",
			"--json",
			"number,title,headRefName,headRefOid,author,body,updatedAt,url,statusCheckRollup",
		]);
		return rows.map((row) => ({
			number: row.number,
			title: row.title,
			branch: row.headRefName,
			head: row.headRefOid,
			author: row.author?.login ?? "ghost",
			body: row.body ?? "",
			updatedAt: row.updatedAt,
			url: row.url,
			checks: (row.statusCheckRollup ?? []).map((check) => {
				if (check.__typename === "StatusContext")
					return {
						state:
							check.state === "SUCCESS"
								? ("success" as const)
								: check.state === "PENDING" || check.state === "EXPECTED"
									? ("pending" as const)
									: ("failure" as const),
					};
				if (check.status !== "COMPLETED") return { state: "pending" as const };
				const conclusion = (check.conclusion ?? "").toLowerCase();
				return {
					state:
						conclusion === "success"
							? ("success" as const)
							: conclusion === "skipped"
								? ("skipped" as const)
								: conclusion === "neutral"
									? ("neutral" as const)
									: ("failure" as const),
				};
			}),
		}));
	}

	/** The failed steps' log of an Actions job, or of its run; empty when there is none to read. */
	async failedLog(repo: string, run: number, job: number | null): Promise<string> {
		const which = job === null ? [String(run)] : ["--job", String(job)];
		const result = await this.gh.run(["run", "view", ...which, "--repo", repo, "--log-failed"], {
			timeoutMs: 60_000,
		});
		return result.code === 0 ? result.stdout : "";
	}

	/** Run an Actions run again: only what failed, one job, or all of it. */
	async rerun(
		repo: string,
		run: number,
		which: { failed?: boolean; job?: number | null },
	): Promise<void> {
		const args = ["run", "rerun"];
		if (which.job) args.push("--job", String(which.job));
		else {
			args.push(String(run));
			if (which.failed) args.push("--failed");
		}
		await this.output([...args, "--repo", repo]);
	}

	/** Move a branch forward to a commit; GitHub refuses unless it is a fast-forward. */
	async moveBranch(repo: string, branch: string, sha: string): Promise<void> {
		await this.output([
			"api",
			"-X",
			"PATCH",
			`repos/${repo}/git/refs/heads/${branch}`,
			"-f",
			`sha=${sha}`,
			"-F",
			"force=false",
		]);
	}

	/** Run a workflow by hand on a ref. */
	async dispatch(repo: string, workflow: string, ref: string): Promise<void> {
		await this.output(["workflow", "run", workflow, "--repo", repo, "--ref", ref]);
	}
}
