import { existsSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

/**
 * A git worktree for each chat: its own checkout and branch of the project's repository, so
 * agents working in parallel never trip over each other or over the person's own checkout. Grid
 * keeps them together under `<projects>/.grid-worktrees/<repository>/`, one per chat, on branches
 * named `grid/chat-<id>`. Everything here is plain `git`.
 */

export type Worktree = {
	/** The repository it belongs to (its main checkout). */
	repo: string;
	/** The worktree's own folder. */
	path: string;
	branch: string;
	/** The branch it started from, when there was one (not a detached checkout). */
	base: string | null;
	/** The folder the chat would have worked in without it (the project's own). */
	origin: string;
};

export type WorktreeStatus = {
	branch: string;
	base: string | null;
	path: string;
	/** Still on disk (someone may have removed it by hand). */
	exists: boolean;
	/** Files changed and not committed. */
	changed: number;
	/** Commits on the branch that are on no remote and not in its base: lost if it is deleted. */
	unpushed: number;
};

export class WorktreeError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "WorktreeError";
	}
}

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
	try {
		const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
		return {
			ok: result.exitCode === 0,
			out: result.stdout.toString().trim(),
			err: result.stderr.toString().trim(),
		};
	} catch {
		return { ok: false, out: "", err: "git is not installed" };
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** The top of the git repository a folder is in, or null when it is not in one. */
export function repoRoot(folder: string): string | null {
	const top = git(folder, ["rev-parse", "--show-toplevel"]);
	return top.ok && top.out ? top.out : null;
}

/** Where Grid keeps a repository's chat worktrees. */
export function worktreesDir(projectsDir: string, repo: string): string {
	return join(projectsDir, ".grid-worktrees", basename(repo));
}

/**
 * A new worktree for a chat, on a new branch from what the project has checked out now. Returns
 * null when the folder is not in a git repository (the chat then works in the folder itself).
 * The chat works in the same place inside it as the folder is inside its repository.
 */
export function createWorktree(
	folder: string,
	chatId: string,
	projectsDir: string,
): { cwd: string; worktree: Worktree } | null {
	const repo = repoRoot(folder);
	if (!repo) return null;
	const head = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const base = head.ok && head.out !== "HEAD" ? head.out : null;
	const name = `chat-${chatId.slice(0, 8)}`;
	const branch = `grid/${name}`;
	const path = join(worktreesDir(projectsDir, repo), name);
	if (existsSync(path)) throw new WorktreeError(`${path} already exists`, 409);
	const added = git(repo, ["worktree", "add", "-b", branch, path, "HEAD"]);
	if (!added.ok) {
		throw new WorktreeError(
			`Could not make a worktree for this chat: ${added.err.split("\n")[0] || "git failed"}`,
			500,
		);
	}
	const inside = relative(repo, folder);
	return {
		cwd: inside ? join(path, inside) : path,
		worktree: { repo, path, branch, base, origin: folder },
	};
}

/** How a chat's worktree stands: what would be lost if it went. */
export function worktreeStatus(worktree: Worktree): WorktreeStatus {
	const exists = isDirectory(worktree.path);
	const changes = exists ? git(worktree.path, ["status", "--porcelain"]) : null;
	const changed = changes?.ok ? changes.out.split("\n").filter(Boolean).length : 0;
	const count = git(worktree.repo, [
		"rev-list",
		"--count",
		worktree.branch,
		"--not",
		...(worktree.base ? [worktree.base] : []),
		"--remotes",
	]);
	const unpushed = count.ok ? Number(count.out) || 0 : 0;
	return {
		branch: worktree.branch,
		base: worktree.base,
		path: worktree.path,
		exists,
		changed,
		unpushed,
	};
}

/**
 * Remove a chat's worktree, and its branch when asked. Uncommitted changes, or (when the branch
 * goes too) commits that are nowhere else, are only thrown away with `force`: otherwise this
 * refuses and says what would be lost.
 */
export function removeWorktree(
	worktree: Worktree,
	options: { deleteBranch: boolean; force?: boolean },
): void {
	const status = worktreeStatus(worktree);
	if (!options.force && status.changed > 0) {
		throw new WorktreeError(
			`The worktree has ${status.changed} changed file${status.changed === 1 ? "" : "s"} not committed`,
			409,
		);
	}
	if (!options.force && options.deleteBranch && status.unpushed > 0) {
		throw new WorktreeError(
			`${worktree.branch} has ${status.unpushed} commit${status.unpushed === 1 ? "" : "s"} that are not pushed or merged`,
			409,
		);
	}
	if (status.exists) {
		const removed = git(worktree.repo, [
			"worktree",
			"remove",
			...(options.force ? ["--force"] : []),
			worktree.path,
		]);
		if (!removed.ok) {
			throw new WorktreeError(removed.err.split("\n")[0] || "git could not remove it", 500);
		}
	} else {
		git(worktree.repo, ["worktree", "prune"]);
	}
	if (options.deleteBranch) git(worktree.repo, ["branch", "-D", worktree.branch]);
}
