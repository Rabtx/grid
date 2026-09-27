import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** A folder in the browser: enough to navigate and to spot projects. */
export type FolderEntry = { name: string; path: string; git: boolean };

export type FolderListing = {
	path: string;
	/** Null at the filesystem root. */
	parent: string | null;
	home: string;
	folders: FolderEntry[];
};

export class FolderError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "FolderError";
	}
}

/** `~` and `~/…` as the home folder; everything else made absolute. */
export function expandPath(path: string | null | undefined): string {
	const raw = path?.trim() || "~";
	if (raw === "~") return homedir();
	if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
	return resolve(raw);
}

/** Resolve a path and refuse symlinks or traversal that leave the configured projects root. */
export function insideProjectsDir(path: string, projectsDir: string): string {
	let root: string;
	let target: string;
	try {
		root = realpathSync(projectsDir);
		target = realpathSync(path);
	} catch {
		throw new FolderError("That folder is not available", 404);
	}
	const relation = relative(root, target);
	if (
		relation === "" ||
		(relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
	)
		return target;
	throw new FolderError("That folder is outside the projects directory", 403);
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * The folders inside `path`, for picking a project folder from any device. Hidden folders and
 * the usual build/dependency folders are left out; git repositories are marked.
 */
export function listFolders(
	path: string | null | undefined,
	options: { hidden?: boolean } = {},
): FolderListing {
	const target = expandPath(path);
	if (!isDirectory(target)) throw new FolderError(`${target} is not a folder on this machine`, 404);
	let names: string[];
	try {
		names = readdirSync(target);
	} catch {
		throw new FolderError(`Grid cannot read ${target}`, 403);
	}
	const skipped = new Set(["node_modules", "dist", "build", "target", "__pycache__"]);
	const folders = names
		.filter((name) => (options.hidden || !name.startsWith(".")) && !skipped.has(name))
		.map((name) => join(target, name))
		.filter(isDirectory)
		.map((full) => ({ name: basename(full), path: full, git: existsSync(join(full, ".git")) }))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
	const parent = dirname(target);
	return { path: target, parent: parent === target ? null : parent, home: homedir(), folders };
}

/**
 * A git remote as a web URL the API accepts: `git@github.com:me/app.git` and
 * `https://github.com/me/app.git` both become `https://github.com/me/app`.
 */
export function remoteToUrl(remote: string): string | null {
	const trimmed = remote.trim().replace(/\.git$/, "");
	const scp = trimmed.match(/^[\w.-]+@([\w.-]+):(.+)$/);
	if (scp) return `https://${scp[1]}/${scp[2]}`;
	const ssh = trimmed.match(/^ssh:\/\/(?:[\w.-]+@)?([\w.-]+)(?::\d+)?\/(.+)$/);
	if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
	if (/^https?:\/\//.test(trimmed)) return trimmed.replace(/\/\/[^@/]+@/, "//");
	return null;
}

/** What a new project can take from its folder: a name, and the repository it pushes to. */
export function inspectFolder(path: string): {
	path: string;
	name: string;
	repoUrl: string | null;
} {
	const target = expandPath(path);
	if (!isDirectory(target)) throw new FolderError(`${target} is not a folder on this machine`, 404);
	let repoUrl: string | null = null;
	try {
		const config = readFileSync(join(target, ".git", "config"), "utf8");
		const origin = config.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
		repoUrl = origin ? remoteToUrl(origin[1]) : null;
	} catch {
		// Not a git repository, or no origin: the project simply has no repository link.
	}
	return { path: target, name: basename(target), repoUrl };
}
