import { createHash } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { FolderError } from "./folders";

export type ProjectFile = { name: string; path: string; kind: "file" | "folder" };
export type ProjectFileListing = { path: string; entries: ProjectFile[] };
/**
 * One file's contents for reading in the console. `text` is null for a binary file or one over
 * the size limit, which the console names rather than shows. `hash` is the text as it was read,
 * and is what a save sends back as the version it is based on.
 */
export type ProjectFileContent = {
	path: string;
	name: string;
	size: number;
	text: string | null;
	binary: boolean;
	tooLarge: boolean;
	/** Of `text`, or null when there is no text to base a save on. */
	hash: string | null;
};

/** Files larger than this are named, not sent: the console is for reading, not a download. */
export const MAX_READ_BYTES = 512 * 1024;

/**
 * What the console sends back when it saves: the text it had when the file was opened, so a
 * file changed underneath it (by an agent, or another tab) is refused rather than overwritten.
 */
export type ProjectFileWrite = { path: string; text: string; base: string };

/** Short enough to read in a log, long enough that a stale save is not a coin flip. */
export function textHash(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", "target", "coverage"]);

function within(root: string, target: string): boolean {
	const path = relative(root, target);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
}

type Resolved = { base: string; target: string; relative: string };

/** A project-relative path resolved on disk, refused if it (or a symlink in it) leaves the root. */
function inside(root: string, path: string, missing: string): Resolved {
	if (path.startsWith("/") || path.split(/[\\/]/).includes("..") || path.includes("\\"))
		throw new FolderError("That path is outside the project", 400);
	let base: string;
	let target: string;
	try {
		base = realpathSync(root);
		target = realpathSync(resolve(base, path || "."));
	} catch {
		throw new FolderError(missing, 404);
	}
	if (!within(base, target)) throw new FolderError("That path is outside the project", 403);
	return { base, target, relative: relative(base, target).split(sep).join("/") };
}

function directory(root: string, path: string): Resolved {
	const current = inside(root, path, "That folder is not available");
	if (!statSync(current.target).isDirectory())
		throw new FolderError("That path is not a folder", 400);
	return current;
}

/** Reads one text file inside the project; binary and oversized files come back without text. */
export function readProjectFile(root: string, path: string): ProjectFileContent {
	const file = inside(root, path, "That file is not available");
	const stats = statSync(file.target);
	if (!stats.isFile()) throw new FolderError("That path is not a file", 400);
	const name = basename(file.target);
	const empty = { path: file.relative, name, size: stats.size, text: null, hash: null };
	if (stats.size > MAX_READ_BYTES) return { ...empty, binary: false, tooLarge: true };
	let bytes: Buffer;
	try {
		bytes = readFileSync(file.target);
	} catch {
		throw new FolderError("Grid cannot read this file", 403);
	}
	// A NUL byte near the start is the usual sign of a binary file.
	if (bytes.subarray(0, 8000).includes(0)) return { ...empty, binary: true, tooLarge: false };
	const text = bytes.toString("utf8");
	return { ...empty, text, binary: false, tooLarge: false, hash: textHash(text) };
}

/**
 * Writes a file's text, but only onto the version the caller last read: if the file changed on
 * disk since, this refuses with 409 and the console asks what to do. The write goes to a
 * temporary name in the same folder and is renamed over the file, so a reader never sees half
 * a file and a failed write leaves the old one alone.
 */
export function writeProjectFile(root: string, write: ProjectFileWrite): ProjectFileContent {
	const { text, base } = write;
	if (typeof text !== "string" || typeof base !== "string")
		throw new FolderError("Say what to write and which version you read", 400);
	if (text.includes("\0")) throw new FolderError("Grid cannot write a binary file", 400);
	if (Buffer.byteLength(text, "utf8") > MAX_READ_BYTES)
		throw new FolderError("This file would be too large to save", 413);
	const file = inside(root, write.path, "That file is not available");
	const current = readProjectFile(root, file.relative);
	if (current.binary) throw new FolderError("This file is not a text file", 400);
	if (current.tooLarge) throw new FolderError("This file is too large to save", 413);
	if (current.hash !== base)
		throw new FolderError("This file changed on disk since you opened it", 409);
	// Beside the file it replaces, so the rename is the same filesystem and therefore atomic.
	const temporary = join(dirname(file.target), `.grid-${textHash(text)}-${process.pid}.tmp`);
	try {
		writeFileSync(temporary, text, "utf8");
		renameSync(temporary, file.target);
	} catch {
		try {
			unlinkSync(temporary);
		} catch {
			// The write never landed, so there is nothing to clean up.
		}
		throw new FolderError("Grid cannot write to this file", 403);
	}
	return { ...readProjectFile(root, file.relative), text, hash: textHash(text) };
}

export function listProjectFiles(root: string, path = ""): ProjectFileListing {
	const current = directory(root, path);
	let entries: ProjectFile[];
	try {
		entries = readdirSync(current.target, { withFileTypes: true })
			.filter((entry) => !SKIP.has(entry.name) && (entry.isDirectory() || entry.isFile()))
			.map((entry) => ({
				name: entry.name,
				path: [current.relative, entry.name].filter(Boolean).join("/"),
				kind: entry.isDirectory() ? ("folder" as const) : ("file" as const),
			}))
			.sort((a, b) =>
				a.kind === b.kind
					? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
					: a.kind === "folder"
						? -1
						: 1,
			);
	} catch {
		throw new FolderError("Grid cannot read this folder", 403);
	}
	return { path: current.relative, entries };
}

export function createProjectFile(
	root: string,
	path: string,
	name: string,
	kind: "file" | "folder",
): ProjectFile {
	if (
		!name ||
		SKIP.has(name) ||
		name === "." ||
		name === ".." ||
		/[\\/]/.test(name) ||
		[...name].some((letter) => letter.charCodeAt(0) < 32) ||
		name.trim() !== name
	)
		throw new FolderError("Use a visible file name without slashes or control characters", 400);
	const current = directory(root, path);
	const target = join(current.target, name);
	try {
		if (kind === "folder") mkdirSync(target);
		else closeSync(openSync(target, "wx"));
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "EEXIST")
			throw new FolderError(`${basename(target)} already exists`, 409);
		throw new FolderError("Grid cannot create an item in this folder", 403);
	}
	return { name, path: [current.relative, name].filter(Boolean).join("/"), kind };
}

function matchesQuery(filePath: string, query: string): boolean {
	if (!query) return true;
	const target = filePath.toLowerCase();
	const search = query.toLowerCase();
	if (target.includes(search)) return true;
	let searchIdx = 0;
	for (let i = 0; i < target.length && searchIdx < search.length; i++) {
		if (target[i] === search[searchIdx]) searchIdx++;
	}
	return searchIdx === search.length;
}

function scoreMatch(filePath: string, query: string): number {
	if (!query) return 0;
	const lowerPath = filePath.toLowerCase();
	const lowerQ = query.toLowerCase();
	const fileName = (filePath.split("/").pop() ?? filePath).toLowerCase();

	if (fileName === lowerQ) return 0;
	if (fileName.startsWith(lowerQ)) return 1;
	if (lowerPath.includes(lowerQ)) return 2;
	return 3;
}

export function searchProjectFiles(root: string, query = "", limit = 50): string[] {
	const current = directory(root, "");
	const q = query.trim();
	const results: string[] = [];

	const queue: { dir: string; depth: number }[] = [{ dir: current.target, depth: 0 }];
	let scanned = 0;
	const MAX_SCANNED = 5000;
	const MAX_DEPTH = 10;

	while (queue.length > 0 && scanned < MAX_SCANNED) {
		const next = queue.shift();
		if (!next || next.depth > MAX_DEPTH) continue;

		let entries;
		try {
			entries = readdirSync(next.dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			scanned++;
			if (SKIP.has(entry.name)) continue;

			if (entry.isDirectory()) {
				queue.push({ dir: join(next.dir, entry.name), depth: next.depth + 1 });
			} else if (entry.isFile()) {
				const full = join(next.dir, entry.name);
				const rel = relative(current.base, full).split(sep).join("/");
				if (matchesQuery(rel, q)) {
					results.push(rel);
				}
			}
		}
	}

	results.sort((a, b) => {
		const scoreA = scoreMatch(a, q);
		const scoreB = scoreMatch(b, q);
		if (scoreA !== scoreB) return scoreA - scoreB;
		if (a.length !== b.length) return a.length - b.length;
		return a.localeCompare(b, undefined, { sensitivity: "base" });
	});

	return results.slice(0, limit);
}
