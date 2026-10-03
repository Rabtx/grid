import { existsSync, statSync } from "node:fs";
import { mkdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";

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
	/**
	 * The branch was already there (a pull request's, someone's own) rather than made for the chat:
	 * it is never deleted with the worktree.
	 */
	adopted?: boolean;
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
	/** The branch was not made for the chat, so removing the worktree keeps it. */
	adopted: boolean;
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
	/** A GitHub pull request number, with `fork`: the pull request whose ref `fetchBranch` fetched. */
	pull?: number;
	/**
	 * The pull request comes from a fork: its branch is not on `origin`, and its name may clash with
	 * a branch of this repository, so it gets a branch of its own, `branch` (`grid/pr-<n>`).
	 */
	fork?: boolean;
};

/** Network fetches give up after this: a slow remote must not hold a chat back for long. */
const FETCH_MS = 30_000;

/**
 * Fetch what an existing-branch worktree needs, before it is made: the branch from `origin` (and a
 * local copy fast-forwarded to it when that is safe), or a fork's pull request ref onto its own
 * local branch. Asynchronous with a timeout, so a slow or unreachable remote never blocks the
 * runner; a failed fetch is not an error here (what was fetched before still serves), and
 * `createWorktree` says what is missing.
 */
export async function fetchBranch(folder: string, request: WorktreeRequest): Promise<void> {
	const repo = repoRoot(folder);
	const branch = request.branch?.trim();
	if (!repo || !branch || !git(repo, ["check-ref-format", "--branch", branch]).ok) return;
	if (request.fork && request.pull !== undefined) {
		// Fast-forward only: a local copy with commits of its own (an earlier fix) is kept as it is.
		await gitAsync(repo, ["fetch", "origin", `pull/${request.pull}/head:refs/heads/${branch}`]);
		return;
	}
	await gitAsync(repo, ["fetch", "origin", branch]);
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok) {
		// Refused (and harmless) when the local branch is checked out, or has diverged.
		await gitAsync(repo, ["fetch", "origin", `${branch}:refs/heads/${branch}`]);
	}
}

async function gitAsync(cwd: string, args: string[]): Promise<boolean> {
	try {
		const child = Bun.spawn(["git", "-C", cwd, ...args], {
			stdout: "ignore",
			stderr: "pipe",
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				// No passphrase or host-key prompts either: nobody is at this terminal.
				GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
			},
		});
		const timer = setTimeout(() => child.kill(), FETCH_MS);
		const [code, err] = await Promise.all([
			child.exited,
			new Response(child.stderr as ReadableStream).text(),
		]);
		clearTimeout(timer);
		if (code !== 0)
			console.warn(`[runner] git ${args.slice(0, 2).join(" ")} failed:`, firstLine(err));
		return code === 0;
	} catch (cause) {
		console.warn("[runner] git could not run:", cause instanceof Error ? cause.message : cause);
		return false;
	}
}

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
 * An existing branch, as `fetchBranch` left it: the local branch when there is one, else a new
 * local branch tracking `origin`'s. Nothing is fetched here, so this never waits on the network.
 */
function existingBranch(repo: string, path: string, branch: string, pull?: number): void {
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok) {
		addWorktree(repo, [path, branch], branch);
		return;
	}
	if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).ok) {
		addWorktree(repo, ["-b", branch, path, `origin/${branch}`], branch);
		return;
	}
	throw new WorktreeError(
		pull === undefined
			? `There is no branch ${branch} here or on origin`
			: `Could not fetch pull request #${pull} from origin`,
		404,
	);
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
	const adopted = request.existing === true || request.pull !== undefined;
	let base: string | null = null;
	if (adopted) existingBranch(repo, path, branch, request.pull);
	else base = newBranch(repo, path, branch);
	const inside = relative(repo, folder);
	return {
		cwd: inside ? join(path, inside) : path,
		worktree: { repo, path, branch, base, origin: folder, ...(adopted ? { adopted: true } : {}) },
	};
}

/** The new-branch path used by unattended jobs, without synchronous git on the runner loop. */
export async function createWorktreeAsync(
	folder: string,
	chatId: string,
	projectsDir: string,
	/** The branch to start from (here or on `origin`); what is checked out when not given. */
	from?: string,
): Promise<{ cwd: string; worktree: Worktree } | null> {
	const top = await gitResult(folder, ["rev-parse", "--show-toplevel"]);
	if (!top.ok || !top.out) return null;
	const repo = top.out;
	const branch = `grid/chat-${chatId.slice(0, 8)}`;
	const baseDir = worktreesDir(projectsDir, repo);
	await mkdir(baseDir, { recursive: true });
	const actualBase = await realpath(baseDir);
	const insideBase = relative(projectsDir, actualBase);
	if (insideBase === ".." || insideBase.startsWith(`..${sep}`) || isAbsolute(insideBase))
		throw new WorktreeError("Worktrees directory is outside the projects directory", 403);
	const path = join(actualBase, worktreeFolder(branch, chatId));
	if (
		await stat(path).then(
			() => true,
			() => false,
		)
	)
		throw new WorktreeError(`${path} already exists`, 409);
	const existing = await gitResult(repo, [
		"rev-parse",
		"--verify",
		"--quiet",
		`refs/heads/${branch}`,
	]);
	if (existing.ok) throw new WorktreeError(`A branch called ${branch} already exists`, 409);
	const head = await gitResult(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
	let base = head.ok && head.out !== "HEAD" ? head.out : null;
	let start = "HEAD";
	if (from) {
		// The branch as it is here, else as the remote has it.
		const local = await gitResult(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${from}`]);
		const remote = local.ok
			? local
			: await gitResult(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${from}`]);
		if (!remote.ok) throw new WorktreeError(`There is no branch called ${from} here`, 409);
		start = local.ok ? from : `origin/${from}`;
		base = from;
	}
	const added = await gitResult(repo, ["worktree", "add", "-b", branch, path, start]);
	if (!added.ok) {
		if (/already (?:checked out|used by worktree)/i.test(added.err))
			throw new WorktreeError(`${branch} is already checked out elsewhere`, 409);
		throw new WorktreeError(
			`Could not make a worktree for this chat: ${firstLine(added.err) || "git failed"}`,
			500,
		);
	}
	const inside = relative(repo, folder);
	return {
		cwd: inside ? join(path, inside) : path,
		worktree: { repo, path, branch, base, origin: folder },
	};
}

async function gitResult(
	cwd: string,
	args: string[],
): Promise<{ ok: boolean; out: string; err: string }> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const child = Bun.spawn(["git", "-C", cwd, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
		timer = setTimeout(() => child.kill(), FETCH_MS);
		const [code, out, err] = await Promise.all([
			child.exited,
			new Response(child.stdout as ReadableStream).text(),
			new Response(child.stderr as ReadableStream).text(),
		]);
		return { ok: code === 0, out: out.trim(), err: err.trim() };
	} catch (cause) {
		return { ok: false, out: "", err: cause instanceof Error ? cause.message : String(cause) };
	} finally {
		if (timer) clearTimeout(timer);
	}
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
		adopted: worktree.adopted === true,
	};
}

/**
 * Remove a chat's worktree, and its branch when asked and the chat made it. Uncommitted changes,
 * or (when the branch goes too) commits that are nowhere else, are only thrown away with `force`:
 * otherwise this refuses and says what would be lost.
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
	if (!options.force && options.deleteBranch && !worktree.adopted && status.unpushed > 0) {
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
	// A branch the chat did not make (a pull request's, someone's own) stays, whatever was asked.
	if (options.deleteBranch && !worktree.adopted) {
		git(worktree.repo, ["branch", "-D", worktree.branch]);
	}
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
		// Its chat is gone, and with it the record of whether the branch was made for it: only
		// Grid's own `grid/` branches are treated as the chat's.
		found.push({
			repo,
			path,
			branch,
			base: null,
			origin: repo,
			adopted: !branch.startsWith("grid/"),
		});
	}
	return found;
}
