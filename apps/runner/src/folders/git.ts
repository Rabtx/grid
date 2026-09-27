/**
 * A folder's git state for the composer's git control: which branch it is on, its local branches
 * (most recently worked on first), whether it has uncommitted changes, and switching or creating
 * a branch. Plain `git`, run in the folder.
 */

export type GitInfo = {
	/** The folder is inside a git repository. */
	repo: boolean;
	/** The branch checked out, or null when detached or not a repository. */
	branch: string | null;
	/** Local branches, most recently committed to first. */
	branches: string[];
	/** Files changed and not committed. */
	changed: number;
	/** The folder is a linked worktree, not the repository's main checkout. */
	worktree: boolean;
};

export class GitError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "GitError";
	}
}

const MAX_BRANCHES = 100;

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

function lines(text: string): string[] {
	return text.split("\n").filter(Boolean);
}

export function gitInfo(folder: string): GitInfo {
	const inside = git(folder, ["rev-parse", "--is-inside-work-tree"]);
	if (!inside.ok || inside.out !== "true") {
		return { repo: false, branch: null, branches: [], changed: 0, worktree: false };
	}
	const head = git(folder, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
	const branches = git(folder, [
		"for-each-ref",
		"--sort=-committerdate",
		`--count=${MAX_BRANCHES}`,
		"--format=%(refname:short)",
		"refs/heads",
	]);
	const status = git(folder, ["status", "--porcelain"]);
	// A linked worktree keeps its own git dir apart from the shared one.
	const own = git(folder, ["rev-parse", "--git-dir"]);
	const shared = git(folder, ["rev-parse", "--git-common-dir"]);
	return {
		repo: true,
		branch: head.ok ? head.out : null,
		branches: branches.ok ? lines(branches.out) : [],
		changed: status.ok ? lines(status.out).length : 0,
		worktree: own.ok && shared.ok && own.out !== shared.out,
	};
}

/** A name git accepts for a new branch, or an error saying why not. */
export function checkBranchName(folder: string, name: string): string {
	const trimmed = name.trim();
	const checked = git(folder, ["check-ref-format", "--branch", trimmed]);
	if (!trimmed || !checked.ok)
		throw new GitError(`"${trimmed}" is not a branch name git accepts`, 400);
	return checked.out || trimmed;
}

/**
 * Check out a branch in the folder, or create it from what is checked out now. git itself refuses
 * to switch when uncommitted changes would be overwritten; its reason is passed on.
 */
export function checkout(folder: string, branch: string, create: boolean): GitInfo {
	if (!gitInfo(folder).repo) throw new GitError("This folder is not in a git repository", 409);
	const name = checkBranchName(folder, branch);
	const switched = git(folder, create ? ["checkout", "-b", name] : ["checkout", name]);
	if (!switched.ok) {
		const reason = lines(switched.err).find((line) => !line.startsWith("hint:")) ?? "git refused";
		throw new GitError(reason.replace(/^(error|fatal): /, ""), 409);
	}
	return gitInfo(folder);
}
