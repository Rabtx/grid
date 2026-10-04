import { existsSync } from "node:fs";

// A project's file list is asked of git again after this.
const LIST_MS = 30_000;
const listed = new Map<string, { at: number; files: string[] }>();

/** A folder's files as git knows them (tracked and new, not ignored), kept briefly. */
export async function projectFiles(folder: string): Promise<string[]> {
	const cached = listed.get(folder);
	if (cached && Date.now() - cached.at < LIST_MS) return cached.files;
	if (!existsSync(folder)) return [];
	try {
		const proc = Bun.spawn(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
			cwd: folder,
			stdout: "pipe",
			stderr: "ignore",
		});
		const text = await new Response(proc.stdout).text();
		await proc.exited;
		const files = text.split("\n").filter(Boolean).slice(0, 50_000);
		listed.set(folder, { at: Date.now(), files });
		return files;
	} catch {
		return [];
	}
}

/**
 * Files whose path holds every word, best first: a name that starts with the first word, then a
 * name holding it, then a path; shorter paths before longer.
 */
export function matchFiles(
	files: readonly string[],
	words: readonly string[],
	limit = 8,
): string[] {
	if (!words.length) return [];
	const scored: { path: string; score: number }[] = [];
	for (const path of files) {
		const lower = path.toLowerCase();
		if (!words.every((word) => lower.includes(word))) continue;
		const name = lower.slice(lower.lastIndexOf("/") + 1);
		const first = words[0] ?? "";
		const score = (name.startsWith(first) ? 0 : name.includes(first) ? 1 : 2) * 1000 + path.length;
		scored.push({ path, score });
	}
	return scored
		.sort((a, b) => a.score - b.score)
		.slice(0, limit)
		.map((item) => item.path);
}
