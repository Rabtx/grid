import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointFile } from "../agents/events";

/**
 * Per-turn checkpoints: the working tree as it stood when a turn began and when it ended, each
 * kept as a commit under a hidden ref (`refs/grid/checkpoints/<thread>/<turn>/<start|end>`). They
 * are made through a scratch index, so the person's own index, branch and stash are never
 * touched, and `.gitignore` decides what is kept, as `git add -A` would. Undoing a turn puts the
 * files it (and anything after it) changed back to how the turn found them.
 */

const PREFIX = "refs/grid/checkpoints";
const GIT_MS = 60_000;

export class CheckpointError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "CheckpointError";
	}
}

type Git = { ok: boolean; out: string; err: string };

async function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Git> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const child = Bun.spawn(["git", "-C", cwd, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
		});
		timer = setTimeout(() => child.kill(), GIT_MS);
		const [code, out, err] = await Promise.all([
			child.exited,
			new Response(child.stdout as ReadableStream).text(),
			new Response(child.stderr as ReadableStream).text(),
		]);
		return { ok: code === 0, out, err: err.trim() };
	} catch (cause) {
		return { ok: false, out: "", err: cause instanceof Error ? cause.message : String(cause) };
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** The ref a turn's checkpoint is kept under. */
export function checkpointRef(thread: string, turn: number, at: "start" | "end" | "undo"): string {
	return `${PREFIX}/${thread}/${turn}/${at}`;
}

/** The repository a folder is in, with the folder's path inside it (`""` at its root). */
async function where(cwd: string): Promise<{ root: string; scope: string } | null> {
	const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
	if (!root.ok) return null;
	const prefix = await git(cwd, ["rev-parse", "--show-prefix"]);
	return { root: root.out.trim(), scope: prefix.ok ? prefix.out.trim() : "" };
}

/**
 * Only the thread's folder: a chat in a subfolder of a repository checkpoints that subfolder.
 * Git runs at the repository's root, so the scope is a path from there.
 */
function pathspec(scope: string): string[] {
	return ["--", scope ? `:(literal)${scope}` : "."];
}

/**
 * Keep the folder's files as they are now under `ref`. Returns the commit, or null when the
 * folder is not in a git repository (nothing to checkpoint) or git could not do it.
 */
export async function snapshot(cwd: string, ref: string): Promise<string | null> {
	const place = await where(cwd);
	if (!place) return null;
	const scratch = await mkdtemp(join(tmpdir(), "grid-checkpoint-"));
	const env = { GIT_INDEX_FILE: join(scratch, "index") };
	try {
		const head = await git(place.root, ["rev-parse", "--verify", "-q", "HEAD"]);
		// A repository with no commits yet starts from an empty tree.
		const base = head.ok ? head.out.trim() : null;
		if (base) {
			const read = await git(place.root, ["read-tree", base], env);
			if (!read.ok) return null;
		}
		const add = await git(place.root, ["add", "-A", ...pathspec(place.scope)], env);
		if (!add.ok) return null;
		const tree = await git(place.root, ["write-tree"], env);
		if (!tree.ok || !tree.out.trim()) return null;
		const commit = await git(
			place.root,
			["commit-tree", tree.out.trim(), ...(base ? ["-p", base] : []), "-m", "Grid checkpoint"],
			{
				...env,
				GIT_AUTHOR_NAME: "Grid",
				GIT_AUTHOR_EMAIL: "checkpoints@grid.local",
				GIT_COMMITTER_NAME: "Grid",
				GIT_COMMITTER_EMAIL: "checkpoints@grid.local",
			},
		);
		const oid = commit.out.trim();
		if (!commit.ok || !oid) return null;
		const update = await git(place.root, ["update-ref", ref, oid]);
		return update.ok ? oid : null;
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}

/** What changed in the folder between two checkpoints, with lines added and removed per file. */
export async function changedFiles(
	cwd: string,
	from: string,
	to: string,
): Promise<CheckpointFile[]> {
	const place = await where(cwd);
	if (!place) return [];
	const diff = await git(place.root, [
		"diff",
		"--numstat",
		"-z",
		"--no-renames",
		from,
		to,
		...pathspec(place.scope),
	]);
	if (!diff.ok) return [];
	const files: CheckpointFile[] = [];
	for (const entry of diff.out.split("\0")) {
		const [added, removed, ...path] = entry.split("\t");
		if (!path.length) continue;
		files.push({
			path: path.join("\t"),
			// Binary files count no lines.
			added: Number(added) || 0,
			removed: Number(removed) || 0,
		});
	}
	return files;
}

/**
 * Put the folder's files back to how they were at `ref`: those changed since are restored, and
 * those made since are removed. The tree as it was before the undo is kept under `rescue` first,
 * so nothing is lost for good. Returns the files that were put back.
 */
export async function restore(cwd: string, ref: string, rescue: string): Promise<CheckpointFile[]> {
	const place = await where(cwd);
	if (!place) throw new CheckpointError("This thread's folder is not in a git repository", 409);
	const target = await git(place.root, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
	if (!target.ok) throw new CheckpointError("That checkpoint is no longer kept", 404);
	const now = await snapshot(cwd, rescue);
	if (!now) throw new CheckpointError("Could not save the files as they are before undoing", 500);
	const files = await changedFiles(cwd, ref, now);
	if (!files.length) return [];
	const status = await git(place.root, [
		"diff",
		"--name-status",
		"-z",
		"--no-renames",
		ref,
		now,
		...pathspec(place.scope),
	]);
	if (!status.ok) throw new CheckpointError(status.err || "git could not compare the files", 500);
	const parts = status.out.split("\0").filter(Boolean);
	const back: string[] = [];
	const gone: string[] = [];
	for (let i = 0; i + 1 < parts.length; i += 2) {
		const [kind, path] = [parts[i], parts[i + 1] as string];
		// Added since the checkpoint: it did not exist then.
		if (kind === "A") gone.push(path);
		else back.push(path);
	}
	if (back.length) {
		const put = await git(place.root, [
			"restore",
			`--source=${target.out.trim()}`,
			"--worktree",
			"--",
			...back.map((path) => `:(literal)${path}`),
		]);
		if (!put.ok) throw new CheckpointError(put.err || "git could not restore the files", 500);
	}
	for (const path of gone) await rm(join(place.root, path), { force: true });
	return files;
}

/** Forget every checkpoint of a thread (when it is deleted). */
export async function dropCheckpoints(cwd: string, thread: string): Promise<void> {
	const place = await where(cwd);
	if (!place) return;
	const refs = await git(place.root, [
		"for-each-ref",
		"--format=%(refname)",
		`${PREFIX}/${thread}/`,
	]);
	if (!refs.ok) return;
	const input = refs.out
		.split("\n")
		.filter(Boolean)
		.map((ref) => `delete ${ref}`)
		.join("\n");
	if (!input) return;
	const child = Bun.spawn(["git", "-C", place.root, "update-ref", "--stdin"], {
		stdin: new TextEncoder().encode(`${input}\n`),
		stdout: "ignore",
		stderr: "ignore",
	});
	await child.exited;
}
