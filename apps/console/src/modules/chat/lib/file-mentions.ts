/**
 * Pure functions for detecting and inserting file mentions (@path) in chat text.
 */

/**
 * Checks if the cursor is currently positioned inside an active @ mention.
 * Returns the index of the '@' and the search query after it, or null if no active mention.
 */
export function findMentionQuery(
	text: string,
	cursorPosition: number,
): { atIndex: number; query: string } | null {
	if (cursorPosition <= 0 || cursorPosition > text.length) return null;
	const before = text.slice(0, cursorPosition);
	const atIndex = before.lastIndexOf("@");
	if (atIndex === -1) return null;

	// The @ must be at the start of text or preceded by whitespace
	if (atIndex > 0 && !/\s/.test(before[atIndex - 1])) {
		return null;
	}

	const query = before.slice(atIndex + 1);
	// Query cannot contain whitespace or newlines
	if (/\s/.test(query)) {
		return null;
	}

	return { atIndex, query };
}

/**
 * Checks whether `query` matches `target` as a subsequence (case-insensitive).
 */
export function matchSubsequence(target: string, query: string): boolean {
	if (!query) return true;
	const t = target.toLowerCase();
	const q = query.toLowerCase();
	if (t.includes(q)) return true;
	let qIdx = 0;
	for (let i = 0; i < t.length && qIdx < q.length; i++) {
		if (t[i] === q[qIdx]) qIdx++;
	}
	return qIdx === q.length;
}

/**
 * Match priority score: lower number is higher priority.
 * 0: exact filename match
 * 1: filename starts with query
 * 2: path contains query as substring
 * 3: subsequence match
 */
export function scoreFileMatch(path: string, query: string): number {
	if (!query) return 0;
	const lower = path.toLowerCase();
	const q = query.toLowerCase();
	const name = (path.split("/").pop() ?? path).toLowerCase();

	if (name === q) return 0;
	if (name.startsWith(q)) return 1;
	if (lower.includes(q)) return 2;
	return 3;
}

/**
 * Filters a list of file paths by query and sorts them by match quality.
 */
export function filterAndSortFiles(files: string[], query: string, limit = 50): string[] {
	const q = query.trim();
	if (!q) return files.slice(0, limit);

	return files
		.filter((f) => matchSubsequence(f, q))
		.sort((a, b) => {
			const scoreA = scoreFileMatch(a, q);
			const scoreB = scoreFileMatch(b, q);
			if (scoreA !== scoreB) return scoreA - scoreB;
			if (a.length !== b.length) return a.length - b.length;
			return a.localeCompare(b, undefined, { sensitivity: "base" });
		})
		.slice(0, limit);
}

/**
 * Inserts the selected file path into text, replacing the @query with `@filePath `.
 */
export function insertMention(
	text: string,
	atIndex: number,
	cursorPosition: number,
	filePath: string,
): { text: string; newCursorPosition: number } {
	const before = text.slice(0, atIndex);
	const after = text.slice(cursorPosition);
	const mention = `@${filePath} `;
	const nextText = `${before}${mention}${after}`;
	const newCursorPosition = before.length + mention.length;
	return { text: nextText, newCursorPosition };
}
