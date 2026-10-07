import { type Database, schema } from "@grid/db";
import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppEnv } from "../../http/context";
import { ok } from "../../http/respond";
import { workspaceAccess, type WorkspaceScope } from "../workspaces/access";

const { projects, tasks, notes } = schema;
const LIMIT = 8;

/** A search's words: lowercase, three letters or more, at most eight. */
export function searchWords(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^\p{L}\p{N}_.-]+/u)
				.filter((word) => word.length >= 2),
		),
	].slice(0, 8);
}

/** `%word%` for ILIKE, with its wildcards taken literally. */
const like = (word: string) => `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** A note's first line, without Markdown's marks, as its title. */
function noteTitle(body: string): string {
	const line = body.split("\n").find((item) => item.trim()) ?? "";
	return (
		line
			.replace(/^[#>*\-\s]+/, "")
			.trim()
			.slice(0, 120) || "Untitled note"
	);
}

/** The passage around the first word found, for a result's second line. */
export function passage(text: string, words: readonly string[]): string {
	const lower = text.toLowerCase();
	const hits = words.map((word) => lower.indexOf(word)).filter((index) => index >= 0);
	// A result matched on its title alone, so none of the words are in this body: open on the
	// first line of it rather than slicing from Infinity, which leaves the passage empty.
	const at = hits.length ? Math.min(...hits) : 0;
	return text
		.slice(Math.max(0, at - 80), at + 220)
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Tasks and notes in a workspace that mention the words (Search, Ask Grid): any word matches,
 * those matching more first; optionally inside one project.
 */
export async function search(
	db: Database,
	scope: WorkspaceScope,
	input: { query: string; project?: string | null },
) {
	const { workspace } = await workspaceAccess(db, scope);
	const words = searchWords(input.query);
	if (!words.length) return { tasks: [], notes: [] };
	const inWorkspace = await db
		.select({ id: projects.id, slug: projects.slug, name: projects.name })
		.from(projects)
		.where(
			and(
				eq(projects.workspaceId, workspace.id),
				...(input.project ? [eq(projects.slug, input.project)] : []),
			),
		);
	if (!inWorkspace.length) return { tasks: [], notes: [] };
	const byId = new Map(inWorkspace.map((project) => [project.id, project]));
	const ids = [...byId.keys()];
	const anyWord = (...columns: Parameters<typeof ilike>[0][]): SQL =>
		or(...words.flatMap((word) => columns.map((column) => ilike(column, like(word))))) as SQL;
	const hits = (text: string) => words.filter((word) => text.toLowerCase().includes(word)).length;

	const taskRows = await db
		.select()
		.from(tasks)
		.where(and(inArray(tasks.projectId, ids), anyWord(tasks.title, tasks.description)))
		.orderBy(desc(tasks.updatedAt))
		.limit(50);
	const noteRows = await db
		.select()
		.from(notes)
		.where(and(inArray(notes.projectId, ids), anyWord(notes.body)))
		.orderBy(desc(notes.updatedAt))
		.limit(50);

	return {
		tasks: taskRows
			.map((task) => ({
				project: byId.get(task.projectId)?.slug ?? "",
				projectName: byId.get(task.projectId)?.name ?? "",
				number: task.number,
				title: task.title,
				status: task.status,
				passage: task.description ? passage(task.description, words) : null,
				updatedAt: task.updatedAt.toISOString(),
				hits: hits(`${task.title} ${task.description ?? ""}`),
			}))
			.sort((a, b) => b.hits - a.hits)
			.slice(0, LIMIT),
		notes: noteRows
			.map((note) => ({
				project: byId.get(note.projectId)?.slug ?? "",
				projectName: byId.get(note.projectId)?.name ?? "",
				id: note.id,
				title: noteTitle(note.body),
				passage: passage(note.body, words),
				updatedAt: note.updatedAt.toISOString(),
				hits: hits(note.body),
			}))
			.sort((a, b) => b.hits - a.hits)
			.slice(0, LIMIT),
	};
}

/** `GET /workspaces/:ws/search?q=…&project=…`. */
export function searchRoutes(deps: { db: Database; sessions: SessionLookup }): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));
	app.get("/", async (c) =>
		ok(
			c,
			await search(
				deps.db,
				{ userId: c.get("user").sub, workspace: c.req.param("ws") ?? null },
				{ query: (c.req.query("q") ?? "").slice(0, 200), project: c.req.query("project") ?? null },
			),
		),
	);
	return app;
}
