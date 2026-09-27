import { existsSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

/**
 * A git worktree for each chat: its own checkout and branch of the project's repository, so
 * agents working in parallel never trip over each other or over the person's own checkout. Grid
 * keeps them together under `<projects>/.grid-worktrees/<repository>/`, one per chat, on a branch
 * the person names (or `grid/chat-<id>`). Everything here is plain `git`.
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

/** What kind of worktree a chat wants: a new branch, or an existing one to work on. */
export type WorktreeRequest = {
	/** The new branch's name; `grid/chat-<id>` when not given. */
	branch?: string;
	/**
	 * Work on `branch` as it is — one that already exists here or on the remote — instead of
	 * making a new branch from what is checked out. Giving `pull` implies this too.
	 */
	existing?: boolean;
	/**
	 * A GitHub pull request number: when its branch is not in this repository (a fork's pull
	 * request), its `refs/pull/<n>/head` is fetched instead of the branch.
	 */
	pull?: number;
};

/** The folder a branch's worktree takes (Grid's own prefix left off), flattened so it is a path. */
function worktreeFolder(branch: string, chatId: string): string {
	return (
		branch
			.replace(/^grid\//, "")
			.replace(/[^\w.-]+/g, "-")
			.replace(/^-+|-+$/g, "") || `chat-${chatId.slice(0, 8)}`
	);
}

function firstLine(text: string): string {
	return text.split("\n")[0]?.trim() ?? "";
}

/** `git worktree add`, with git's own refusals turned into something worth showing a person. */
function addWorktree(repo: string, args: string[], branch: string): void {
	const added = git(repo, ["worktree", "add", ...args]);
	if (added.ok) return;
	const said = firstLine(added.err);
	// Git will not put one branch in two places: the branch is checked out in the project's own
	// folder, or in another chat's worktree. Its refusal is not the first line, and its wording
	// has changed ("already checked out" / "already used by worktree").
	if (/already (?:checked out|used by worktree)/i.test(added.err)) {
		throw new WorktreeError(
			`${branch} is already checked out elsewhere; a branch can only be in one worktree`,
			409,
		);
	}
	throw new WorktreeError(`Could not make a worktree for this chat: ${said || "git failed"}`, 500);
}

/** A new branch from what is checked out now; a name already in use is refused. */
function newBranch(repo: string, path: string, branch: string): string | null {
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok) {
		throw new WorktreeError(`A branch called ${branch} already exists`, 409);
	}
	const head = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const base = head.ok && head.out !== "HEAD" ? head.out : null;
	addWorktree(repo, ["-b", branch, path, "HEAD"], branch);
	return base;
}

/**
 * An existing branch, fetched when only the remote has it. A branch `origin` has is taken by name,
 * so the worktree tracks it and pushing goes back to it; a fork's pull request is not on `origin`
 * at all, so its `refs/pull/<n>/head` is fetched instead and the local branch made from that.
 */
function existingBranch(repo: string, path: string, branch: string, pull?: number): string | null {
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok) {
		addWorktree(repo, [path, branch], branch);
		return null;
	}
	// A same-repository pull request's branch is on `origin` like any other branch. A fetch that
	// fails keeps a ref fetched before, so a branch can still be taken while offline.
	git(repo, ["fetch", "origin", branch]);
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).ok) {
		addWorktree(repo, ["-b", branch, path, `origin/${branch}`], branch);
		return null;
	}
	if (pull === undefined) {
		throw new WorktreeError(`There is no branch ${branch} here or on origin`, 404);
	}
	const fetched = git(repo, ["fetch", "origin", `pull/${pull}/head`]);
	if (!fetched.ok) {
		throw new WorktreeError(
			`Could not fetch pull request #${pull} from origin: ${firstLine(fetched.err) || "git failed"}`,
			404,
		);
	}
	// A pull request's ref has nothing to track, so it starts from FETCH_HEAD.
	addWorktree(repo, ["-b", branch, path, "FETCH_HEAD"], branch);
	return null;
}

/**
 * A worktree for a chat: a new branch from what the project has checked out now, or, with
 * `existing` (or a `pull` number), the branch as it is. Returns null when the folder is not in a
 * git repository (the chat then works in the folder itself). The chat works in the same place
 * inside it as the folder is inside its repository.
 */
export function createWorktree(
	folder: string,
	chatId: string,
	projectsDir: string,
	request: WorktreeRequest = {},
): { cwd: string; worktree: Worktree } | null {
	const repo = repoRoot(folder);
	if (!repo) return null;
	const branch = request.branch?.trim() || `grid/chat-${chatId.slice(0, 8)}`;
	if (!git(repo, ["check-ref-format", "--branch", branch]).ok) {
		throw new WorktreeError(`"${branch}" is not a branch name git accepts`, 400);
	}
	const path = join(worktreesDir(projectsDir, repo), worktreeFolder(branch, chatId));
	if (existsSync(path)) throw new WorktreeError(`${path} already exists`, 409);
	const base =
		request.existing === true || request.pull !== undefined
			? existingBranch(repo, path, branch, request.pull)
			: newBranch(repo, path, branch);
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

/** A Grid worktree on disk that no chat uses any more (its chat was deleted while it held work). */
export function leftoverWorktrees(
	repo: string,
	projectsDir: string,
	used: Set<string>,
): Worktree[] {
	const listed = git(repo, ["worktree", "list", "--porcelain"]);
	if (!listed.ok) return [];
	const home = worktreesDir(projectsDir, repo);
	const found: Worktree[] = [];
	for (const entry of listed.out.split("\n\n")) {
		const path = entry.match(/^worktree (.+)$/m)?.[1];
		const branch = entry.match(/^branch refs\/heads\/(.+)$/m)?.[1];
		if (!path || !branch || !path.startsWith(`${home}/`) || used.has(path)) continue;
		found.push({ repo, path, branch, base: null, origin: repo });
	}
	return found;
}
