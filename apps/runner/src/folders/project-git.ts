/**
 * What git says about a project's files, for the Files screen: which are changed and how much,
 * who last changed each one and when, and a file as it was at the last commit (to show what
 * changed). Plain `git`, run in the project's folder without blocking the runner (it also serves
 * the terminals); outside a repository every answer is empty. Paths are the project's own
 * (relative to its folder), even when the folder is part of a larger repository, and are always
 * read literally, never as patterns.
 */

/** A file changed since the last commit: edited, new (staged or not), removed or renamed. */
export type FileChange = {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed";
	/** Lines added and removed, when git can count them. */
	added: number | null;
	removed: number | null;
};

/** The last commit that touched a path. */
export type LastChange = { author: string; at: string; subject: string };

export type ProjectGit = {
	branch: string | null;
	changes: FileChange[];
};

/** How far back the history is walked to find each entry's last commit. */
const MAX_COMMITS = 400;
/** At most this many changes go out with a listing: an unignored dependency folder is not news. */
const MAX_CHANGES = 500;
/** The committed version is sent for showing a diff, up to this size. */
const MAX_BASE_BYTES = 512 * 1024;

async function git(cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
	try {
		const child = Bun.spawn(["git", "-C", cwd, ...args], {
			stdout: "pipe",
			stderr: "ignore",
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
				GIT_OPTIONAL_LOCKS: "0",
				// A file called `*.md` or `:(exclude)x` is a name, not a pattern.
				GIT_LITERAL_PATHSPECS: "1",
			},
		});
		const out = await new Response(child.stdout).text();
		return { ok: (await child.exited) === 0, out };
	} catch {
		return { ok: false, out: "" };
	}
}

/** Where the project sits in its repository ("" at the top, "apps/web/" inside), or null. */
export async function repoPrefix(root: string): Promise<string | null> {
	const prefix = await git(root, ["rev-parse", "--show-prefix"]);
	return prefix.ok ? prefix.out.trim() : null;
}

const STATUS: Record<string, FileChange["status"]> = {
	M: "modified",
	T: "modified",
	A: "added",
	"?": "added",
	D: "deleted",
	R: "renamed",
	C: "added",
};

/** The project's branch and what is changed in it since the last commit. */
export async function projectGit(root: string, prefix: string): Promise<ProjectGit> {
	const [head, status, numstat] = await Promise.all([
		git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
		git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", "."]),
		git(root, ["diff", "--numstat", "-z", "HEAD", "--", "."]),
	]);
	const counts = new Map<string, { added: number | null; removed: number | null }>();
	if (numstat.ok) {
		// "<added>\t<removed>\t<path>\0" (renames take two more NUL-separated paths; skipped).
		for (const record of numstat.out.split("\0")) {
			const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(record);
			if (!match) continue;
			counts.set(match[3], {
				added: match[1] === "-" ? null : Number(match[1]),
				removed: match[2] === "-" ? null : Number(match[2]),
			});
		}
	}
	const changes: FileChange[] = [];
	if (status.ok) {
		const records = status.out.split("\0");
		for (let index = 0; index < records.length && changes.length < MAX_CHANGES; index++) {
			const record = records[index];
			if (record.length < 4) continue;
			// "XY path": X is the staged change, Y the unstaged one; "??" is a file git does not track.
			const code = record.startsWith("??") ? "?" : record[0] !== " " ? record[0] : record[1];
			const kind = STATUS[code] ?? "modified";
			const full = record.slice(3);
			// A rename's old path follows as its own record.
			if (record[0] === "R" || record[0] === "C") index++;
			if (!full.startsWith(prefix)) continue;
			const path = full.slice(prefix.length);
			if (!path) continue;
			const counted = counts.get(full);
			changes.push({
				path: path.endsWith("/") ? path.slice(0, -1) : path,
				status: kind,
				added: counted?.added ?? null,
				removed: counted?.removed ?? null,
			});
		}
	}
	changes.sort((a, b) => a.path.localeCompare(b.path));
	return { branch: head.ok ? head.out.trim() || null : null, changes };
}

/**
 * The last commit to touch the folder `folder` ("" is the project) and each of `entries` in it,
 * from one walk back through its history: the first commit naming a file at or under an entry is
 * that entry's last change. Entries untouched in the last few hundred commits are left out.
 */
export async function lastChanges(
	root: string,
	prefix: string,
	folder: string,
	entries: readonly string[],
): Promise<Record<string, LastChange>> {
	const log = await git(root, [
		"log",
		`-n${MAX_COMMITS}`,
		"--name-only",
		"--format=%x1e%an%x1f%aI%x1f%s",
		"--",
		folder || ".",
	]);
	const found: Record<string, LastChange> = {};
	if (!log.ok) return found;
	const wanted = new Set(entries);
	for (const block of log.out.split("\x1e")) {
		if (!block.trim()) continue;
		const [header, ...files] = block.split("\n");
		const [author, at, subject] = header.split("\x1f");
		if (!author || !at) continue;
		const change = { author, at, subject: subject ?? "" };
		if (!(folder in found)) found[folder] = change;
		for (const file of files) {
			if (!file || !file.startsWith(prefix)) continue;
			const path = file.slice(prefix.length);
			// The entry this file is, or is inside: `src/jobs/eta.ts` is `src` from the project's root.
			const rest = folder ? path.slice(folder.length + 1) : path;
			if (folder && !path.startsWith(`${folder}/`)) continue;
			const entry = folder ? `${folder}/${rest.split("/")[0]}` : rest.split("/")[0];
			if (wanted.has(entry) && !(entry in found)) found[entry] = change;
		}
		if (Object.keys(found).length > wanted.size) break;
	}
	return found;
}

/** A file as it is at the last commit, for showing what changed; null when it is new or large. */
export async function committedText(root: string, path: string): Promise<string | null> {
	const size = await git(root, ["cat-file", "-s", `HEAD:./${path}`]);
	if (!size.ok || Number(size.out.trim()) > MAX_BASE_BYTES) return null;
	const shown = await git(root, ["show", `HEAD:./${path}`]);
	if (!shown.ok || shown.out.slice(0, 8000).includes("\0")) return null;
	return shown.out;
}
