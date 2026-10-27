import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "../private-database";

/**
 * A project's memory: short things worth knowing the next time someone works on it, kept as the
 * work happens. Decisions and why they were made, the project's conventions, the reasons behind
 * past fixes, facts that took finding out. Agents save them with `memory_save` and look with
 * `memory_search`; people add, change and remove them in the project's Memory page. A new thread
 * starts with the ones its first message is about (see `relevant`).
 */

export type MemoryKind = "decision" | "convention" | "fix" | "fact";
export const MEMORY_KINDS: readonly MemoryKind[] = ["decision", "convention", "fix", "fact"];

export type MemoryEntry = {
	id: string;
	workspaceId: string;
	project: string;
	kind: MemoryKind;
	text: string;
	/** Who kept it: a person, or a thread's agent. */
	by: { kind: "person" | "agent"; id: string; name: string };
	/** The thread it came from, when one did. */
	sessionId: string | null;
	createdAt: string;
	updatedAt: string;
	/** How many threads have started with it, and when one last did. */
	used: number;
	usedAt: string | null;
};

export class MemoryError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

type Row = {
	id: string;
	workspace_id: string;
	project: string;
	kind: MemoryKind;
	text: string;
	by_kind: "person" | "agent";
	by_id: string;
	by_name: string;
	session_id: string | null;
	created_at: string;
	updated_at: string;
	used: number;
	used_at: string | null;
};

const entryOf = (row: Row): MemoryEntry => ({
	id: row.id,
	workspaceId: row.workspace_id,
	project: row.project,
	kind: row.kind,
	text: row.text,
	by: { kind: row.by_kind, id: row.by_id, name: row.by_name },
	sessionId: row.session_id,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	used: row.used,
	usedAt: row.used_at,
});

export const MEMORY_MAX_TEXT = 1_000;
/** A project keeps this many at most: memory is the few things that matter, not a log. */
export const MEMORY_MAX_ENTRIES = 500;
/** What a new thread starts with, at most. */
const BRIEF_ENTRIES = 8;
const BRIEF_CHARS = 4_000;

const STOP = new Set(
	"the and for with that this from into have has was were are not but you your our its they them then than when what which who how why can could should would will just also only about after before over under more most some any all each other such very there here been being does did doing done make made use used using get got let lets need needs want please thanks".split(
		" ",
	),
);

/** The words of a text that say what it is about: lowercased, three letters or more, no filler. */
export function wordsOf(text: string): Set<string> {
	const words = new Set<string>();
	for (const raw of text.toLowerCase().match(/[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu) ?? []) {
		const word = raw.replace(/[.-]+$/, "");
		if (word.length < 3 || STOP.has(word)) continue;
		words.add(word);
		// `auth.ts` is about `auth` too, and `rate-limit` about `rate` and `limit`.
		for (const part of word.split(/[._-]/))
			if (part.length >= 3 && !STOP.has(part)) words.add(part);
	}
	return words;
}

/** How much an entry is about these words: the words it shares, with conventions a little ahead. */
export function relevance(entry: Pick<MemoryEntry, "kind" | "text">, words: Set<string>): number {
	let shared = 0;
	for (const word of wordsOf(entry.text)) if (words.has(word)) shared++;
	return shared ? shared + (entry.kind === "convention" ? 0.5 : 0) : 0;
}

export class ProjectMemory {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS project_memory (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				project TEXT NOT NULL,
				kind TEXT NOT NULL,
				text TEXT NOT NULL,
				by_kind TEXT NOT NULL,
				by_id TEXT NOT NULL,
				by_name TEXT NOT NULL,
				session_id TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				used INTEGER NOT NULL DEFAULT 0,
				used_at TEXT
			);
			CREATE INDEX IF NOT EXISTS memory_by_project ON project_memory (workspace_id, project);
		`);
	}

	/** A project's entries, newest first. */
	list(workspace: string, project: string): MemoryEntry[] {
		return this.db
			.query<Row, [string, string]>(
				"SELECT * FROM project_memory WHERE workspace_id = ? AND project = ? ORDER BY created_at DESC, rowid DESC",
			)
			.all(workspace, project)
			.map(entryOf);
	}

	get(workspace: string, id: string): MemoryEntry | null {
		const row = this.db
			.query<Row, [string, string]>(
				"SELECT * FROM project_memory WHERE id = ? AND workspace_id = ?",
			)
			.get(id, workspace);
		return row ? entryOf(row) : null;
	}

	/**
	 * Keep something. The same thing said again (the same words, whatever the case and spacing)
	 * is not kept twice: the one already there is given back.
	 */
	save(input: {
		workspaceId: string;
		project: string;
		kind: unknown;
		text: unknown;
		by: MemoryEntry["by"];
		sessionId?: string | null;
	}): { entry: MemoryEntry; created: boolean } {
		const kind = input.kind as MemoryKind;
		if (!MEMORY_KINDS.includes(kind))
			throw new MemoryError(`kind is one of ${MEMORY_KINDS.join(", ")}`, 400);
		const text = typeof input.text === "string" ? input.text.trim() : "";
		if (!text) throw new MemoryError("Say what to remember", 400);
		if (text.length > MEMORY_MAX_TEXT)
			throw new MemoryError(`Keep it under ${MEMORY_MAX_TEXT} characters: one thing, briefly`, 400);
		if (!input.project) throw new MemoryError("Memory belongs to a project", 400);
		const same = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
		const existing = this.list(input.workspaceId, input.project);
		const twin = existing.find((entry) => same(entry.text) === same(text));
		if (twin) return { entry: twin, created: false };
		if (existing.length >= MEMORY_MAX_ENTRIES)
			throw new MemoryError(
				`A project keeps ${MEMORY_MAX_ENTRIES} memories at most; remove some that no longer hold`,
				409,
			);
		const now = new Date().toISOString();
		const entry: MemoryEntry = {
			id: crypto.randomUUID(),
			workspaceId: input.workspaceId,
			project: input.project,
			kind,
			text,
			by: { ...input.by, name: input.by.name.slice(0, 120) },
			sessionId: input.sessionId ?? null,
			createdAt: now,
			updatedAt: now,
			used: 0,
			usedAt: null,
		};
		this.db
			.query(
				`INSERT INTO project_memory (id, workspace_id, project, kind, text, by_kind, by_id, by_name, session_id, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				entry.id,
				entry.workspaceId,
				entry.project,
				entry.kind,
				entry.text,
				entry.by.kind,
				entry.by.id,
				entry.by.name,
				entry.sessionId,
				entry.createdAt,
				entry.updatedAt,
			);
		return { entry, created: true };
	}

	/** Change what an entry says, or its kind. */
	edit(workspace: string, id: string, patch: { kind?: unknown; text?: unknown }): MemoryEntry {
		const entry = this.get(workspace, id);
		if (!entry) throw new MemoryError("No such memory", 404);
		const kind = (patch.kind ?? entry.kind) as MemoryKind;
		if (!MEMORY_KINDS.includes(kind))
			throw new MemoryError(`kind is one of ${MEMORY_KINDS.join(", ")}`, 400);
		const text = typeof patch.text === "string" ? patch.text.trim() : entry.text;
		if (!text) throw new MemoryError("Say what to remember", 400);
		if (text.length > MEMORY_MAX_TEXT)
			throw new MemoryError(`Keep it under ${MEMORY_MAX_TEXT} characters`, 400);
		const updatedAt = new Date().toISOString();
		this.db
			.query("UPDATE project_memory SET kind = ?, text = ?, updated_at = ? WHERE id = ?")
			.run(kind, text, updatedAt, id);
		return { ...entry, kind, text, updatedAt };
	}

	remove(workspace: string, id: string): MemoryEntry {
		const entry = this.get(workspace, id);
		if (!entry) throw new MemoryError("No such memory", 404);
		this.db.query("DELETE FROM project_memory WHERE id = ?").run(id);
		return entry;
	}

	/** Entries about the words given, best first; all of the project's newest when none are. */
	search(workspace: string, project: string, query: string, limit = 10): MemoryEntry[] {
		const words = wordsOf(query);
		const all = this.list(workspace, project);
		if (!words.size) return all.slice(0, limit);
		return all
			.map((entry) => ({ entry, score: relevance(entry, words) }))
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((item) => item.entry);
	}

	/**
	 * What a new thread starts with: the entries its first message is about, best first, within
	 * a few thousand characters. Each one given is counted as used.
	 */
	relevant(workspace: string, project: string, message: string): MemoryEntry[] {
		const chosen: MemoryEntry[] = [];
		// A message about nothing in particular ("hi") starts with nothing.
		if (!wordsOf(message).size) return chosen;
		let size = 0;
		for (const entry of this.search(workspace, project, message, BRIEF_ENTRIES)) {
			if (size + entry.text.length > BRIEF_CHARS) break;
			chosen.push(entry);
			size += entry.text.length;
		}
		if (chosen.length) {
			const at = new Date().toISOString();
			const mark = this.db.query(
				"UPDATE project_memory SET used = used + 1, used_at = ? WHERE id = ?",
			);
			for (const entry of chosen) mark.run(at, entry.id);
		}
		return chosen;
	}

	/** Forget a project's memory (the project was removed). */
	forgetProject(workspace: string, project: string): void {
		this.db
			.query("DELETE FROM project_memory WHERE workspace_id = ? AND project = ?")
			.run(workspace, project);
	}

	close(): void {
		this.db.close();
	}
}

/** The entries a new thread starts with, as the note that goes before its first message. */
export function memoryBrief(entries: readonly MemoryEntry[]): string | null {
	if (!entries.length) return null;
	const lines = entries.map((entry) => `- (${entry.kind}) ${entry.text.replace(/\s*\n\s*/g, " ")}`);
	return [
		"From this project's memory (what earlier work found worth keeping; it may be out of date, so check before relying on it):",
		...lines,
		"Save anything this work settles that the next person should know with memory_save; look for more with memory_search.",
	].join("\n");
}
