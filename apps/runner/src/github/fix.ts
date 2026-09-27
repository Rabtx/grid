import type { Check, PullDetail, PullRequests, PullReviewComment } from "./pulls";

/**
 * "Fix with an agent": the first message for a thread that works on a pull request's own branch.
 * It lists what the person asked to include — the failing checks with the last lines of their
 * logs, the unresolved review comments, the description — and what to do about them. The runner
 * builds it, since reaching the logs needs `gh` on the machine the project lives on.
 */

/** What a fix thread includes; the sheet in the console picks these. */
export type FixInclude = {
	/** The failing checks, with the last lines of their logs. */
	checks: boolean;
	/** The unresolved review comments. */
	comments: boolean;
	/** The pull request's description. */
	description: boolean;
};

/** After a fix: where it happened, and what to say. */
export type FixPlan = {
	/** The pull request's branch, the worktree's branch. */
	branch: string;
	/** The first message for the thread. */
	message: string;
};

// A log tail long enough to hold a failure and what led to it, short enough to read.
const LOG_LINES = 40;

/** The Actions run a check's URL points at, or null when it is not an Actions run. */
export function runIdOf(url: string | null): number | null {
	const match = url?.match(/\/actions\/runs\/(\d+)/);
	return match ? Number(match[1]) : null;
}

/** The last lines of a log, colour codes stripped, so a huge log cannot drown the message. */
export function logTail(text: string, lines = LOG_LINES): string {
	// oxlint-disable-next-line no-control-regex -- escape sequences are made of control characters
	const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
	return plain
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim())
		.slice(-lines)
		.join("\n");
}

function checkLine(check: Check): string {
	return `- ${[check.name, check.workflow, check.url].filter(Boolean).join(" — ")}`;
}

function commentLine(comment: PullReviewComment): string {
	const where = comment.path
		? `${comment.path}${comment.line === null ? "" : `:${comment.line}`}`
		: null;
	const head = `- @${comment.author}${where ? ` — ${where}` : ""}`;
	return [head, ...comment.body.split("\n").map((line) => `  ${line}`)].join("\n");
}

/** The first message for a pull request's fix thread. */
export function fixPrompt(input: {
	pull: Pick<PullDetail, "number" | "title" | "branch" | "base" | "body">;
	checks: Check[];
	/** Check name → the last lines of its failing log. */
	logs: Map<string, string>;
	comments: PullReviewComment[];
	include: FixInclude;
}): string {
	const { pull, include } = input;
	const sections = [
		`Fix pull request #${pull.number} "${pull.title}" in this worktree, on the branch \`${pull.branch}\` (into \`${pull.base}\`).`,
	];
	if (include.checks) {
		sections.push(
			input.checks.length === 0
				? "Failing checks: none."
				: ["Failing checks:", ...input.checks.map(checkLine)].join("\n"),
		);
		const withLogs = input.checks.filter((check) => input.logs.get(check.name));
		if (withLogs.length > 0) {
			sections.push(
				[
					"Last lines of the failing logs:",
					...withLogs.flatMap((check) => [
						`${check.name}:`,
						"```",
						input.logs.get(check.name) ?? "",
						"```",
					]),
				].join("\n"),
			);
		}
	}
	if (include.comments) {
		sections.push(
			input.comments.length === 0
				? "Unresolved review comments: none."
				: ["Unresolved review comments:", ...input.comments.map(commentLine)].join("\n"),
		);
	}
	if (include.description) {
		const body = pull.body.trim();
		if (body) sections.push(`Pull request description:\n${body}`);
	}
	sections.push(
		"Fix these on this branch; run the checks you can and commit. Push to this branch when asked.",
	);
	return sections.join("\n\n");
}

/**
 * Read a pull request and assemble the message (and branch) its fix thread starts with. The
 * failing checks are read from the pull request's own checks; their logs come from Actions, and a
 * log that cannot be read is left out rather than failing the whole plan.
 */
export async function fixPlan(
	service: PullRequests,
	userId: string,
	folder: string,
	number: number,
	include: FixInclude,
): Promise<FixPlan> {
	const pull = await service.view(userId, folder, number);
	const checks = include.checks ? pull.checkList.filter((check) => check.state === "failure") : [];
	const logs = new Map<string, string>();
	await Promise.all(
		checks.map(async (check) => {
			const run = runIdOf(check.url);
			if (run === null) return;
			const log = await service.failedLog(userId, folder, run).catch((cause: unknown) => {
				console.warn(
					`[runner] could not read the log of run ${run}:`,
					cause instanceof Error ? cause.message : cause,
				);
				return "";
			});
			const tail = logTail(log);
			if (tail) logs.set(check.name, tail);
		}),
	);
	const comments = include.comments ? await service.reviewComments(userId, folder, number) : [];
	return {
		branch: pull.branch,
		message: fixPrompt({ pull, checks, logs, comments, include }),
	};
}
