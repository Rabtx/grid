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

/**
 * The last commit that touched a path. `agent` is the agent that made it (a provider id such as
 * `claude`), read from the commit's author or its `Co-authored-by` trailers; `mine` is whether it
 * was committed as the person this machine's git signs commits for.
 */
export type LastChange = {
	author: string;
	email: string;
	at: string;
	subject: string;
	agent: string | null;
	mine: boolean;
};

/** Who wrote a run of lines, for Blame. `sha` is null for lines not committed yet. */
export type BlameCommit = {
	sha: string | null;
	author: string;
	email: string;
	at: string | null;
	subject: string;
	agent: string | null;
	mine: boolean;
};

/** Each line's commit (an index into `commits`), in order: line 1 is `lines[0]`. */
export type Blame = { commits: BlameCommit[]; lines: number[] };

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

/**
 * The agents a commit can name, by the provider id the runner knows them by. Agents sign their
 * work as a `Co-authored-by` trailer ("Claude Opus <noreply@anthropic.com>") or commit under
 * their own name ("Codex"); either way the name or address says which one it was.
 */
const AGENT_SIGNS: { id: string; sign: RegExp }[] = [
	{ id: "claude", sign: /\bclaude\b|@anthropic\.com\b/i },
	{ id: "codex", sign: /\bcodex\b|@openai\.com\b/i },
	{ id: "opencode", sign: /\bopencode\b/i },
	{ id: "antigravity", sign: /\bantigravity\b|\bgemini\b/i },
];

/** The agent behind a commit, from its author and co-authors, or null for a person's own. */
export function agentOf(
	author: string,
	email: string,
	coauthors: readonly string[],
): string | null {
	for (const who of [`${author} ${email}`, ...coauthors]) {
		const found = AGENT_SIGNS.find((agent) => agent.sign.test(who));
		if (found) return found.id;
	}
	return null;
}

/** The co-author trailers, NUL-free and one per entry, as `%(trailers…)` printed them. */
const TRAILERS = "%(trailers:key=Co-authored-by,valueonly,separator=%x1d)";

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

/** The address this machine's git signs commits with in this folder, or null when it has none. */
export async function gitUser(root: string): Promise<string | null> {
	const email = await git(root, ["config", "user.email"]);
	return email.ok ? email.out.trim().toLowerCase() || null : null;
}

/** When the checked-out commit was made, or null before the first commit. */
export async function headTime(root: string): Promise<string | null> {
	const head = await git(root, ["log", "-1", "--format=%cI"]);
	return head.ok ? head.out.trim() || null : null;
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
	me: string | null = null,
): Promise<Record<string, LastChange>> {
	const log = await git(root, [
		"log",
		`-n${MAX_COMMITS}`,
		"--name-only",
		`--format=%x1e%an%x1f%ae%x1f%aI%x1f%s%x1f${TRAILERS}`,
		"--",
		folder || ".",
	]);
	const found: Record<string, LastChange> = {};
	if (!log.ok) return found;
	const wanted = new Set(entries);
	for (const block of log.out.split("\x1e")) {
		if (!block.trim()) continue;
		const [header, ...files] = block.split("\n");
		const [author, email = "", at, subject = "", trailers = ""] = header.split("\x1f");
		if (!author || !at) continue;
		const change: LastChange = {
			author,
			email,
			at,
			subject,
			agent: agentOf(author, email, trailers.split("\x1d").filter(Boolean)),
			mine: me !== null && email.toLowerCase() === me,
		};
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

/** Lines blamed at most: past this a file is read, not annotated. */
const MAX_BLAME_LINES = 20_000;
/** A commit sha of all zeros is git's name for lines not committed yet. */
const UNCOMMITTED = /^0{40}$/;

/**
 * Who wrote each line of a file and in which commit, from `git blame`: lines grouped by commit,
 * each commit with its author, time, subject and the agent that made it. Lines not committed yet
 * carry a commit with no sha. Null when the file is not in git or too long to annotate.
 */
export async function blame(root: string, path: string, me: string | null): Promise<Blame | null> {
	const out = await git(root, ["blame", "--porcelain", "--", path]);
	if (!out.ok) return null;
	const order: string[] = [];
	const info = new Map<string, { author: string; email: string; time: number; subject: string }>();
	const lines: string[] = [];
	let current = "";
	for (const row of out.out.split("\n")) {
		if (row.startsWith("\t")) {
			lines.push(current);
			if (lines.length > MAX_BLAME_LINES) return null;
			continue;
		}
		const header = /^([0-9a-f]{40}) \d+ \d+/.exec(row);
		if (header) {
			current = header[1];
			if (!info.has(current)) {
				info.set(current, { author: "", email: "", time: 0, subject: "" });
				order.push(current);
			}
			continue;
		}
		const entry = info.get(current);
		if (!entry) continue;
		const space = row.indexOf(" ");
		const key = space < 0 ? row : row.slice(0, space);
		const value = space < 0 ? "" : row.slice(space + 1);
		if (key === "author") entry.author = value;
		else if (key === "author-mail") entry.email = value.replace(/^<|>$/g, "");
		else if (key === "author-time") entry.time = Number(value);
		else if (key === "summary") entry.subject = value;
	}
	// Blame prints the subject, never the trailers: read those for every commit at once.
	const committed = order.filter((sha) => !UNCOMMITTED.test(sha));
	const trailers = new Map<string, string[]>();
	if (committed.length > 0) {
		const shown = await git(root, ["show", "-s", `--format=%H%x1f${TRAILERS}%x1e`, ...committed]);
		if (shown.ok) {
			for (const record of shown.out.split("\x1e")) {
				const [sha, values = ""] = record.trim().split("\x1f");
				if (sha) trailers.set(sha, values.split("\x1d").filter(Boolean));
			}
		}
	}
	const index = new Map(order.map((sha, at) => [sha, at]));
	const commits: BlameCommit[] = order.map((sha) => {
		const entry = info.get(sha) ?? { author: "", email: "", time: 0, subject: "" };
		if (UNCOMMITTED.test(sha)) {
			return {
				sha: null,
				author: "",
				email: "",
				at: null,
				subject: "Not committed yet",
				agent: null,
				mine: false,
			};
		}
		return {
			sha,
			author: entry.author,
			email: entry.email,
			at: entry.time ? new Date(entry.time * 1000).toISOString() : null,
			subject: entry.subject,
			agent: agentOf(entry.author, entry.email, trailers.get(sha) ?? []),
			mine: me !== null && entry.email.toLowerCase() === me,
		};
	});
	return { commits, lines: lines.map((sha) => index.get(sha) ?? 0) };
}
