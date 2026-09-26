import type { Database } from "@grid/db";

import { conflict, notFound } from "../../http/errors";
import type {
	CreateNoteInput,
	CreateProjectInput,
	CreateTaskInput,
	UpdateNoteInput,
	UpdateProjectInput,
	UpdateTaskInput,
} from "./schema";
import * as q from "./queries";

const taskKey = (number: number) => `TASK-${number}`;
const projectView = (r: q.ProjectRecord) => ({
	slug: r.slug,
	name: r.name,
	summary: r.summary,
	repoUrl: r.repoUrl,
	icon: r.icon,
	color: r.color,
	status: r.status,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});
const taskView = (r: q.TaskRecord) => ({
	key: taskKey(r.number),
	number: r.number,
	title: r.title,
	description: r.description,
	status: r.status,
	owner: r.ownerKind ? { kind: r.ownerKind, name: r.ownerName } : null,
	branch: r.branch,
	position: r.position,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});
const noteView = (r: q.NoteRecord) => ({
	id: r.id,
	body: r.body,
	source: r.source,
	threadId: r.threadId,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});

async function requireProject(db: Database, ownerId: string, slug: string) {
	const project = await q.findProject(db, ownerId, slug);
	if (!project) throw notFound(`Project "${slug}" not found`);
	return project;
}
async function requireTask(db: Database, ownerId: string, slug: string, number: number) {
	const project = await requireProject(db, ownerId, slug);
	const task = await q.findTask(db, project.id, number);
	if (!task) throw notFound(`Task ${taskKey(number)} not found`);
	return task;
}
export async function listProjects(db: Database, ownerId: string) {
	return (await q.listProjects(db, ownerId)).map(projectView);
}
export async function createProject(db: Database, ownerId: string, input: CreateProjectInput) {
	if (await q.findProject(db, ownerId, input.slug))
		throw conflict(`Project "${input.slug}" already exists`);
	return projectView(
		await q.createProject(db, {
			ownerId,
			slug: input.slug,
			name: input.name,
			summary: input.summary ?? null,
			repoUrl: input.repoUrl ?? null,
			icon: input.icon ?? null,
			color: input.color ?? null,
		}),
	);
}
export async function getProject(db: Database, ownerId: string, slug: string) {
	return projectView(await requireProject(db, ownerId, slug));
}
export async function updateProject(
	db: Database,
	ownerId: string,
	slug: string,
	input: UpdateProjectInput,
) {
	const project = await requireProject(db, ownerId, slug);
	const updated = await q.updateProject(db, project.id, input);
	if (!updated) throw notFound(`Project "${slug}" not found`);
	return projectView(updated);
}
export async function listTasks(db: Database, ownerId: string, slug: string) {
	const project = await requireProject(db, ownerId, slug);
	return (await q.listTasks(db, project.id)).map(taskView);
}
export async function createTask(
	db: Database,
	ownerId: string,
	slug: string,
	input: CreateTaskInput,
) {
	const project = await requireProject(db, ownerId, slug);
	return taskView(
		await q.createTask(db, {
			projectId: project.id,
			title: input.title,
			description: input.description ?? null,
			status: input.status ?? "backlog",
			ownerKind: input.ownerKind ?? null,
			ownerName: input.ownerName ?? null,
			branch: input.branch ?? null,
		}),
	);
}
export async function updateTask(
	db: Database,
	ownerId: string,
	slug: string,
	number: number,
	input: UpdateTaskInput,
) {
	const task = await requireTask(db, ownerId, slug, number);
	const updated = await q.updateTask(db, task.id, input);
	if (!updated) throw notFound(`Task ${taskKey(number)} not found`);
	return taskView(updated);
}
export async function deleteTask(db: Database, ownerId: string, slug: string, number: number) {
	const task = await requireTask(db, ownerId, slug, number);
	if (!(await q.deleteTask(db, task.id))) throw notFound(`Task ${taskKey(number)} not found`);
}
export async function listNotes(db: Database, ownerId: string, slug: string) {
	const project = await requireProject(db, ownerId, slug);
	return (await q.listNotes(db, project.id)).map(noteView);
}
export async function createNote(
	db: Database,
	ownerId: string,
	slug: string,
	input: CreateNoteInput,
) {
	const project = await requireProject(db, ownerId, slug);
	return noteView(
		await q.createNote(db, {
			projectId: project.id,
			body: input.body,
			source: input.source ?? null,
			threadId: input.threadId ?? null,
		}),
	);
}
export async function updateNote(
	db: Database,
	ownerId: string,
	slug: string,
	id: string,
	input: UpdateNoteInput,
) {
	const project = await requireProject(db, ownerId, slug);
	const note = await q.updateNote(db, project.id, id, input.body);
	if (!note) throw notFound("Note not found");
	return noteView(note);
}
export async function deleteNote(db: Database, ownerId: string, slug: string, id: string) {
	const project = await requireProject(db, ownerId, slug);
	if (!(await q.deleteNote(db, project.id, id))) throw notFound("Note not found");
}
