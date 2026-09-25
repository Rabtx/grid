import { closeSync, mkdirSync, openSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

import { FolderError } from "./folders";

export type ProjectFile = { name: string; path: string; kind: "file" | "folder" };
export type ProjectFileListing = { path: string; entries: ProjectFile[] };

const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", "target", "coverage"]);

function within(root: string, target: string): boolean {
	const path = relative(root, target);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
}

function directory(root: string, path: string): { base: string; target: string; relative: string } {
	if (path.startsWith("/") || path.split(/[\\/]/).includes("..") || path.includes("\\"))
		throw new FolderError("That path is outside the project", 400);
	let base: string;
	let target: string;
	try {
		base = realpathSync(root);
		target = realpathSync(resolve(base, path || "."));
	} catch {
		throw new FolderError("That folder is not available", 404);
	}
	if (!within(base, target)) throw new FolderError("That path is outside the project", 403);
	if (!statSync(target).isDirectory()) throw new FolderError("That path is not a folder", 400);
	return { base, target, relative: relative(base, target).split(sep).join("/") };
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
