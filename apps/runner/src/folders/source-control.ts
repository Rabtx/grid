/**
 * Source control for a project, from the Files screen: where the project stands in git (branch,
 * remote, commits not pushed yet), each changed file's diff, starting a repository, committing the
 * files chosen, and pushing. Plain `git` in the project's folder; pushing to GitHub signs in with
 * the GitHub CLI's credential, so no token is ever kept or typed here. Paths are the project's own
 * (relative to its folder) and are read literally, never as patterns.
 */

import { type FileChange, projectGit, repoPrefix } from "./project-git";

/** A git step that failed, with what git said, worded for a person. */
export class SourceError extends Error {
	constructor(
		message: string,
		readonly status = 409,
	) {
		super(message);
	}
}

export type SourceStatus = {
	/** The project is in a git repository. */
	repo: boolean;
	/** The project's folder is the top of its repository (not a folder inside a larger one). */
	top: boolean;
	branch: string | null;
	/** The remote pushed to, when there is one. */
	remote: { name: string; url: string } | null;
	/** The branch this one pushes to, when it has one. */
	upstream: string | null;
	/** Commits not pushed yet, and commits on the remote not here yet. */
	ahead: number;
	behind: number;
	/** The repository has at least one commit. */
	commits: boolean;
	/** Who git signs commits as here; empty when it has not been told. */
	identity: { name: string | null; email: string | null };
	/** The last few commits, newest first. */
	recent: { sha: string; subject: string; author: string; at: string }[];
	changes: FileChange[];
};

/** A diff sent to show, up to this size; past it the file is opened instead. */
const MAX_DIFF_BYTES = 256 * 1024;
/** What an agent is shown of the changes to word a commit message from. */
const MAX_PROMPT_DIFF = 14_000;

type Ran = { ok: boolean; code: number; out: string; err: string };

/** Run git in `cwd` to the end, with what it printed on both streams. */
export async function run(
	cwd: string,
	args: string[],
	options: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<Ran> {
	try {
		const child = Bun.spawn(["git", "-C", cwd, ...args], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_LITERAL_PATHSPECS: "1",
				...options.env,
			},
		});
		const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 30_000);
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		clearTimeout(timer);
		return { ok: code === 0, code, out, err };
	} catch {
		return { ok: false, code: 127, out: "", err: "git is not installed on this machine" };
	}
}

/** git's own words for a failure, its last meaningful line, without the "fatal:" prefix. */
function said(ran: Ran, fallback: string): string {
	const line = `${ran.err}\n${ran.out}`
		.split("\n")
		.map((text) => text.replace(/^(fatal|error|hint|remote):\s*/i, "").trim())
		.filter(Boolean)
		.find((text) => !/^(To |Everything up-to-date)/.test(text));
	return line ? line.slice(0, 300) : fallback;
}

/** Where the project stands: branch, remote, what is not pushed, who commits, what is changed. */
export async function sourceStatus(root: string): Promise<SourceStatus> {
	const prefix = await repoPrefix(root);
	const empty: SourceStatus = {
		repo: false,
		top: false,
		branch: null,
		remote: null,
		upstream: null,
		ahead: 0,
		behind: 0,
		commits: false,
		identity: { name: null, email: null },
		recent: [],
		changes: [],
	};
	if (prefix === null) return empty;
	const [repo, head, upstream, remotes, name, email, log] = await Promise.all([
		projectGit(root, prefix),
		run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]),
		run(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
		run(root, ["remote", "-v"]),
		run(root, ["config", "user.name"]),
		run(root, ["config", "user.email"]),
		run(root, ["log", "-5", "--format=%h%x1f%s%x1f%an%x1f%aI"]),
	]);
	const tracked = upstream.ok ? upstream.out.trim() || null : null;
	const pushes = remotes.out
		.split("\n")
		.map((line) => /^(\S+)\s+(\S+)\s+\(push\)$/.exec(line.trim()))
		.filter((match): match is RegExpExecArray => match !== null);
	const preferred = tracked?.split("/")[0];
	const remote =
		pushes.find((match) => match[1] === preferred) ??
		pushes.find((match) => match[1] === "origin") ??
		pushes[0];
	let ahead = 0;
	let behind = 0;
	if (tracked) {
		const counts = await run(root, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
		const [left, right] = counts.out.trim().split(/\s+/).map(Number);
		behind = Number.isFinite(left) ? left : 0;
		ahead = Number.isFinite(right) ? right : 0;
	} else if (head.ok) {
		// Never pushed: every commit on the branch is waiting to go.
		const counts = await run(root, ["rev-list", "--count", "HEAD"]);
		ahead = Number(counts.out.trim()) || 0;
	}
	return {
		repo: true,
		top: prefix === "",
		branch: repo.branch,
		remote: remote ? { name: remote[1], url: remote[2] } : null,
		upstream: tracked,
		ahead,
		behind,
		commits: head.ok,
		identity: {
			name: name.ok ? name.out.trim() || null : null,
			email: email.ok ? email.out.trim() || null : null,
		},
		recent: log.ok
			? log.out
					.split("\n")
					.filter(Boolean)
					.map((line) => {
						const [sha = "", subject = "", author = "", at = ""] = line.split("\x1f");
						return { sha, subject, author, at };
					})
			: [],
		changes: repo.changes,
	};
}

/**
 * One changed file's diff against the last commit, as git prints it; a new file is shown whole.
 * Null text when it is binary or too large to show.
 */
export async function fileDiff(
	root: string,
	path: string,
): Promise<{ path: string; diff: string | null; tooLarge: boolean; binary: boolean }> {
	const tracked = await run(root, ["ls-files", "--error-unmatch", "--", path]);
	const head = await run(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	const args = ["--no-pager", "diff", "--no-color", "--no-ext-diff"];
	const ran = tracked.ok
		? await run(root, [...args, ...(head.ok ? ["HEAD"] : ["--cached"]), "--", path])
		: // Not in git yet: the whole file is new. `--no-index` exits 1 when files differ, as they do.
			await run(root, [...args, "--no-index", "--", "/dev/null", path]);
	if (!ran.ok && ran.code !== 1) throw new SourceError(said(ran, "git could not show this change"));
	const binary = /^Binary files /m.test(ran.out);
	const tooLarge = ran.out.length > MAX_DIFF_BYTES;
	return { path, diff: binary || tooLarge ? null : ran.out, tooLarge, binary };
}

/** Start a repository in the project's folder, on `branch`. */
export async function initRepo(root: string, branch = "main"): Promise<void> {
	if ((await repoPrefix(root)) !== null) throw new SourceError("This project is already in git");
	const ran = await run(root, ["init", `--initial-branch=${branch}`]);
	if (!ran.ok) throw new SourceError(said(ran, "git could not start a repository here"), 500);
}

/** The paths a commit takes: each one chosen, with a rename's old path so its removal goes too. */
function pathsOf(changes: readonly FileChange[], chosen: readonly string[]): string[] {
	const wanted = new Set(chosen);
	const picked = changes.filter((change) => wanted.has(change.path));
	if (picked.length !== wanted.size)
		throw new SourceError("Some of those files are no longer changed: refresh and try again");
	return [
		...new Set(
			picked.flatMap((change) => (change.from ? [change.path, change.from] : [change.path])),
		),
	];
}

/**
 * Commit the chosen files, and only those, with `message`. When git has not been told who is
 * committing here, `author` (the person signed in to Grid) signs it.
 */
export async function commitFiles(
	root: string,
	input: { paths: readonly string[]; message: string; author?: { name: string; email: string } },
): Promise<{ sha: string; subject: string }> {
	const message = input.message.trim();
	if (!message) throw new SourceError("Write a commit message first", 400);
	if (input.paths.length === 0) throw new SourceError("Choose the files to commit", 400);
	const status = await sourceStatus(root);
	if (!status.repo) throw new SourceError("This project is not in git yet");
	const paths = pathsOf(status.changes, input.paths);
	// Removed files (and a rename's old path) are taken out of the index; the rest are added.
	const gone = new Set(
		status.changes
			.filter((change) => input.paths.includes(change.path))
			.flatMap((change) =>
				change.status === "deleted" ? [change.path] : change.from ? [change.from] : [],
			),
	);
	const kept = paths.filter((path) => !gone.has(path));
	if (gone.size > 0) {
		const removed = await run(root, [
			"rm",
			"--cached",
			"--quiet",
			"--ignore-unmatch",
			"--",
			...gone,
		]);
		if (!removed.ok) throw new SourceError(said(removed, "git could not take those files"));
	}
	if (kept.length > 0) {
		const add = await run(root, ["add", "--all", "--", ...kept]);
		if (!add.ok) throw new SourceError(said(add, "git could not take those files"));
	}
	const who = signedAs(status, input.author);
	// With paths, git commits just these, whatever else was staged before.
	const done = await commitWithMessage(root, who, paths, message);
	if (!done.ok) {
		const text = said(done, "git could not make the commit");
		throw new SourceError(
			/user\.(email|name)|Author identity unknown/i.test(text)
				? "git does not know who is committing: set your name and email in Settings → Profile"
				: text,
		);
	}
	const head = await run(root, ["log", "-1", "--format=%h%x1f%s"]);
	const [sha = "", subject = message.split("\n")[0]] = head.out.trim().split("\x1f");
	return { sha, subject };
}

/** Who git signs as: its own setting, or else the person signed in to Grid. */
function signedAs(status: SourceStatus, author?: { name: string; email: string }): string[] {
	return !status.identity.email && author
		? ["-c", `user.name=${author.name}`, "-c", `user.email=${author.email}`]
		: [];
}

/** `git commit` with the message on its standard input, so any text is passed as written. */
async function commitWithMessage(
	root: string,
	who: string[],
	paths: string[],
	message: string,
): Promise<Ran> {
	const child = Bun.spawn(
		["git", "-C", root, ...who, "commit", "--quiet", "--file=-", "--", ...paths],
		{
			stdin: new TextEncoder().encode(`${message}\n`),
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LITERAL_PATHSPECS: "1" },
		},
	);
	const timer = setTimeout(() => child.kill(), 60_000);
	const [out, err, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
	return { ok: code === 0, code, out, err };
}

/** Git signs in to GitHub with the GitHub CLI's credential, and nothing else it may have kept. */
const CREDENTIAL = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"];

/**
 * Ask the remote what it has (so "to pull" is current). Best effort: offline, signed out or no
 * remote leaves the counts as they were.
 */
export async function fetchRemote(root: string): Promise<void> {
	await run(root, [...CREDENTIAL, "fetch", "--quiet", "--prune"], { timeoutMs: 30_000 });
}

/**
 * Bring in the remote's commits: fast-forward when this copy has nothing of its own, otherwise
 * replay its commits on top. Uncommitted work is set aside and put back. Anything that would need
 * a person to settle a conflict is undone, and said.
 */
export async function pullBranch(
	root: string,
	author?: { name: string; email: string },
): Promise<void> {
	const status = await sourceStatus(root);
	if (!status.repo) throw new SourceError("This project is not in git yet");
	if (!status.upstream)
		throw new SourceError("This branch is not on the remote yet: push it first");
	// Replaying commits (and setting work aside) makes commits: signed by the person when git has no one.
	const who = signedAs(status, author);
	const pull = (mode: string[]) =>
		run(root, [...who, ...CREDENTIAL, "pull", "--quiet", "--autostash", ...mode], {
			timeoutMs: 120_000,
		});
	const fast = await pull(["--ff-only"]);
	if (fast.ok) return;
	const text = said(fast, "git could not pull");
	if (/authentication|could not read Username|403/i.test(text))
		throw new SourceError(
			"GitHub refused: sign in to GitHub in Settings → Connectors, with access to this repository",
		);
	if (!/fast-forward|diverg/i.test(text)) throw new SourceError(text);
	// Both sides moved: put this copy's commits on top of the remote's.
	const rebased = await pull(["--rebase"]);
	if (rebased.ok) return;
	await run(root, ["rebase", "--abort"]);
	throw new SourceError(
		"Your commits and the remote's change the same lines, so nothing was changed: ask an agent to merge them",
	);
}

/** A GitHub repository name, or `owner/name` for an organisation's. */
const REPO_NAME = /^(?:[A-Za-z0-9-]{1,39}\/)?[A-Za-z0-9._-]{1,100}$/;

/** The GitHub CLI run in the project's folder, to the end. */
async function gh(root: string, args: string[], binary: string): Promise<Ran> {
	try {
		const child = Bun.spawn([binary, ...args], {
			cwd: root,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
		});
		const timer = setTimeout(() => child.kill(), 60_000);
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		clearTimeout(timer);
		return { ok: code === 0, code, out, err };
	} catch {
		return { ok: false, code: 127, out: "", err: "" };
	}
}

/**
 * Make a GitHub repository for the project with the GitHub CLI, add it as `origin`, and push the
 * branch when there is something to push. Returns the repository's web address.
 */
export async function createGithubRepo(
	root: string,
	input: { name: string; private: boolean; description?: string },
	binary = "gh",
): Promise<{ url: string; pushed: boolean }> {
	const name = input.name.trim();
	if (!REPO_NAME.test(name) || name.endsWith(".git"))
		throw new SourceError("Name it with letters, numbers, dots, dashes or underscores", 400);
	const status = await sourceStatus(root);
	if (!status.repo) throw new SourceError("Start git for this project first");
	if (!status.top)
		throw new SourceError(
			"This project is a folder inside a larger repository: make the repository for that one",
		);
	if (status.remote) throw new SourceError(`This project already pushes to ${status.remote.url}`);
	const signedIn = await gh(root, ["auth", "status", "--hostname", "github.com"], binary);
	if (signedIn.code === 127)
		throw new SourceError("Install the GitHub CLI in Settings → Connectors → GitHub first");
	if (!signedIn.ok) throw new SourceError("Sign in to GitHub in Settings → Connectors first");
	const description = input.description?.trim().slice(0, 300);
	const made = await gh(
		root,
		[
			"repo",
			"create",
			name,
			input.private ? "--private" : "--public",
			"--source=.",
			"--remote=origin",
			...(description ? ["--description", description] : []),
		],
		binary,
	);
	if (!made.ok) {
		const text = said(made, "GitHub could not make the repository");
		throw new SourceError(
			/already exists/i.test(text)
				? `There is already a repository called ${name} on GitHub`
				: text,
		);
	}
	const url =
		/https:\/\/github\.com\/\S+/.exec(made.out)?.[0] ??
		(await run(root, ["remote", "get-url", "origin"])).out.trim();
	if (!status.commits || !status.branch) return { url, pushed: false };
	await pushBranch(root);
	return { url, pushed: true };
}

/**
 * Push the branch to its remote, setting where it pushes the first time. GitHub remotes sign in
 * with the GitHub CLI's credential (Settings → Connectors → GitHub), never a typed password.
 */
export async function pushBranch(root: string): Promise<void> {
	const status = await sourceStatus(root);
	if (!status.repo) throw new SourceError("This project is not in git yet");
	if (!status.remote)
		throw new SourceError("This project has no remote to push to: add one on GitHub first");
	if (!status.branch) throw new SourceError("Switch to a branch before pushing");
	if (!status.commits) throw new SourceError("Commit something before pushing");
	const args = status.upstream ? ["push"] : ["push", "--set-upstream", status.remote.name, "HEAD"];
	const ran = await run(root, [...CREDENTIAL, ...args], { timeoutMs: 120_000 });
	if (ran.ok) return;
	const text = said(ran, "git could not push");
	if (/authentication|could not read Username|403|permission/i.test(text))
		throw new SourceError(
			"GitHub refused the push: sign in to GitHub in Settings → Connectors, with access to this repository",
		);
	if (/non-fast-forward|fetch first|rejected/i.test(text))
		throw new SourceError("The remote has commits this copy does not: pull them in first");
	throw new SourceError(text);
}

/**
 * What an agent is asked to word a commit message from: the files and how much changed, the diff
 * (cut short when long), and the last few subjects so it follows the project's own style.
 */
export async function messagePrompt(root: string, chosen: readonly string[]): Promise<string> {
	const status = await sourceStatus(root);
	if (!status.repo) throw new SourceError("This project is not in git yet");
	pathsOf(status.changes, chosen);
	const picked = status.changes.filter((change) => chosen.includes(change.path));
	let diff = "";
	for (const change of picked) {
		if (diff.length > MAX_PROMPT_DIFF) break;
		const shown = await fileDiff(root, change.path).catch(() => null);
		diff += shown?.diff ? `${shown.diff}\n` : `(${change.status}: ${change.path})\n`;
	}
	const files = picked
		.map(
			(change) =>
				`- ${change.status} ${change.from ? `${change.from} → ` : ""}${change.path}${
					change.added !== null ? ` (+${change.added} -${change.removed ?? 0})` : ""
				}`,
		)
		.join("\n");
	const recent = status.recent.map((commit) => `- ${commit.subject}`).join("\n");
	return [
		"Write the git commit message for the changes below. Do not run any tools or commands: answer from what is here.",
		"Reply with the message only, no quotes or code fences: a subject line of at most 72 characters in the imperative mood, then, only if it helps, a blank line and up to three short lines saying why.",
		recent
			? `Follow the style of this project's recent commits (for example Conventional Commits, if they use it):\n${recent}`
			: "Use the Conventional Commits style (feat:, fix:, docs:, refactor:, chore: …), all lowercase.",
		`Files:\n${files}`,
		`Diff:\n${diff.slice(0, MAX_PROMPT_DIFF)}${diff.length > MAX_PROMPT_DIFF ? "\n… (cut short)" : ""}`,
	].join("\n\n");
}

/** An agent's answer as a commit message: fences, quotes and preamble taken off. */
export function cleanMessage(text: string): string {
	const lines = text
		.replace(/```[a-z]*\n?/gi, "")
		.trim()
		.split("\n")
		.map((line) => line.trimEnd());
	// "Here is the commit message:" and the like come before the message itself.
	while (lines.length > 1 && /^(here('| i)s|commit message|sure\b)/i.test(lines[0] ?? ""))
		lines.shift();
	const message = lines
		.join("\n")
		.trim()
		.replace(/^["'`]+|["'`]+$/g, "");
	return message.replace(/\n{3,}/g, "\n\n");
}
