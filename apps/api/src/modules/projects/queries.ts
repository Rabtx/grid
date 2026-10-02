import { type Database, schema } from "@grid/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const { projects, tasks, notes } = schema;
export type ProjectRecord = schema.ProjectRecord;
export type TaskRecord = schema.TaskRecord;
export type NoteRecord = schema.NoteRecord;

export const listProjects = (db: Database, workspaceId: string) =>
	db
		.select()
		.from(projects)
		.where(eq(projects.workspaceId, workspaceId))
		.orderBy(asc(projects.name));
export async function findProject(db: Database, workspaceId: string, slug: string) {
	const [project] = await db
		.select()
		.from(projects)
		.where(and(eq(projects.workspaceId, workspaceId), eq(projects.slug, slug)))
		.limit(1);
	return project ?? null;
}
export async function createProject(db: Database, input: schema.NewProjectRecord) {
	const [project] = await db.insert(projects).values(input).returning();
	if (!project) throw new Error("Project insert did not return a record");
	return project;
}
export async function updateProject(
	db: Database,
	id: string,
	input: Partial<schema.NewProjectRecord>,
) {
	const [project] = await db
		.update(projects)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(projects.id, id))
		.returning();
	return project ?? null;
}
export const listTasks = (db: Database, projectId: string) =>
	db
		.select()
		.from(tasks)
		.where(eq(tasks.projectId, projectId))
		.orderBy(asc(tasks.position), asc(tasks.number));
export async function findTask(db: Database, projectId: string, number: number) {
	const [task] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.projectId, projectId), eq(tasks.number, number)))
		.limit(1);
	return task ?? null;
}
/** The project row lock serialises max(number)+1 per board under READ COMMITTED. Without it concurrent creates race on the unique index. */
export function createTask(db: Database, input: Omit<schema.NewTaskRecord, "number" | "position">) {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select 1 from ${projects} where ${projects.id} = ${input.projectId} for update`,
		);
		const [current] = await tx
			.select({
				number: sql<number>`coalesce(max(${tasks.number}), 0)`,
				position: sql<number>`coalesce(max(${tasks.position}), 0)`,
			})
			.from(tasks)
			.where(eq(tasks.projectId, input.projectId));
		const [task] = await tx
			.insert(tasks)
			.values({
				...input,
				number: Number(current?.number ?? 0) + 1,
				position: Number(current?.position ?? 0) + 1,
			})
			.returning();
		if (!task) throw new Error("Task insert did not return a record");
		return task;
	});
}
export async function updateTask(db: Database, id: string, input: Partial<schema.NewTaskRecord>) {
	const [task] = await db
		.update(tasks)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(tasks.id, id))
		.returning();
	return task ?? null;
}
export async function deleteTask(db: Database, id: string) {
	return (await db.delete(tasks).where(eq(tasks.id, id)).returning()).length > 0;
}
const authorUser = alias(schema.users, "note_author");
const authorProfile = alias(schema.userProfiles, "note_author_profile");
const editorUser = alias(schema.users, "note_editor");
const editorProfile = alias(schema.userProfiles, "note_editor_profile");

/** A note with the names of who wrote it and who last changed it (their display name, else username). */
export type NoteWithPeople = NoteRecord & { authorName: string | null; editorName: string | null };

const notesWithPeople = (db: Database) =>
	db
		.select({
			note: notes,
			authorName: sql<
				string | null
			>`coalesce(${authorProfile.displayName}, ${authorUser.username})`,
			editorName: sql<
				string | null
			>`coalesce(${editorProfile.displayName}, ${editorUser.username})`,
		})
		.from(notes)
		.leftJoin(authorUser, eq(authorUser.id, notes.createdBy))
		.leftJoin(authorProfile, eq(authorProfile.userId, notes.createdBy))
		.leftJoin(editorUser, eq(editorUser.id, notes.updatedBy))
		.leftJoin(editorProfile, eq(editorProfile.userId, notes.updatedBy));

const flatten = (row: {
	note: NoteRecord;
	authorName: string | null;
	editorName: string | null;
}) => ({
	...row.note,
	authorName: row.authorName,
	editorName: row.editorName,
});

export async function listNotes(db: Database, projectId: string): Promise<NoteWithPeople[]> {
	const rows = await notesWithPeople(db)
		.where(eq(notes.projectId, projectId))
		.orderBy(desc(notes.createdAt));
	return rows.map(flatten);
}
export async function findNote(
	db: Database,
	projectId: string,
	id: string,
): Promise<NoteWithPeople | null> {
	const [row] = await notesWithPeople(db).where(
		and(eq(notes.projectId, projectId), eq(notes.id, id)),
	);
	return row ? flatten(row) : null;
}
export async function createNote(db: Database, input: schema.NewNoteRecord) {
	const [note] = await db.insert(notes).values(input).returning();
	if (!note) throw new Error("Note insert did not return a record");
	return note;
}
export type NoteChanges = Partial<
	Pick<NoteRecord, "body" | "pinned" | "shared" | "icon" | "agents" | "updatedBy" | "updatedAt">
>;
export async function updateNote(
	db: Database,
	projectId: string,
	id: string,
	changes: NoteChanges,
) {
	const [note] = await db
		.update(notes)
		.set(changes)
		.where(and(eq(notes.projectId, projectId), eq(notes.id, id)))
		.returning();
	return note ?? null;
}
export async function deleteNote(db: Database, projectId: string, id: string) {
	return (
		(
			await db
				.delete(notes)
				.where(and(eq(notes.projectId, projectId), eq(notes.id, id)))
				.returning()
		).length > 0
	);
}
