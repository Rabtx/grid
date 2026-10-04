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
import { requireRole, workspaceAccess, type WorkspaceScope } from "../workspaces/access";
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
const noteView = (r: q.NoteWithPeople) => ({
	id: r.id,
	body: r.body,
	source: r.source,
	threadId: r.threadId,
	pinned: r.pinned,
	shared: r.shared,
	icon: r.icon,
	agents: r.agents ?? null,
	author: r.authorName ? { name: r.authorName } : null,
	editor: r.editorName ? { name: r.editorName } : null,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});

/** The project, for reading; `write` refuses a viewer, who follows the work and changes nothing. */
async function requireProject(db: Database, scope: WorkspaceScope, slug: string, write = false) {
	const access = await workspaceAccess(db, scope);
	if (write) requireRole(access, "member");
	const { workspace } = access;
	const project = await q.findProject(db, workspace.id, slug);
	if (!project) throw notFound(`Project "${slug}" not found`);
	return project;
}
async function requireTask(db: Database, scope: WorkspaceScope, slug: string, number: number) {
	const project = await requireProject(db, scope, slug, true);
	const task = await q.findTask(db, project.id, number);
	if (!task) throw notFound(`Task ${taskKey(number)} not found`);
	return task;
}
export async function listProjects(db: Database, scope: WorkspaceScope) {
	const { workspace } = await workspaceAccess(db, scope);
	return (await q.listProjects(db, workspace.id)).map(projectView);
}
export async function createProject(
	db: Database,
	scope: WorkspaceScope,
	input: CreateProjectInput,
) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "member");
	const { workspace } = access;
	if (await q.findProject(db, workspace.id, input.slug))
		throw conflict(`Project "${input.slug}" already exists`);
	return projectView(
		await q.createProject(db, {
			workspaceId: workspace.id,
			createdBy: scope.userId,
			slug: input.slug,
			name: input.name,
			summary: input.summary ?? null,
			repoUrl: input.repoUrl ?? null,
			icon: input.icon ?? null,
			color: input.color ?? null,
		}),
	);
}
export async function getProject(db: Database, scope: WorkspaceScope, slug: string) {
	return projectView(await requireProject(db, scope, slug));
}
export async function updateProject(
	db: Database,
	scope: WorkspaceScope,
	slug: string,
	input: UpdateProjectInput,
) {
	const project = await requireProject(db, scope, slug, true);
	const updated = await q.updateProject(db, project.id, input);
	if (!updated) throw notFound(`Project "${slug}" not found`);
	return projectView(updated);
}
export async function listTasks(db: Database, scope: WorkspaceScope, slug: string) {
	const project = await requireProject(db, scope, slug);
	return (await q.listTasks(db, project.id)).map(taskView);
}
export async function createTask(
	db: Database,
	scope: WorkspaceScope,
	slug: string,
	input: CreateTaskInput,
) {
	const project = await requireProject(db, scope, slug, true);
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
	scope: WorkspaceScope,
	slug: string,
	number: number,
	input: UpdateTaskInput,
) {
	const task = await requireTask(db, scope, slug, number);
	const updated = await q.updateTask(db, task.id, input);
	if (!updated) throw notFound(`Task ${taskKey(number)} not found`);
	return taskView(updated);
}
export async function deleteTask(
	db: Database,
	scope: WorkspaceScope,
	slug: string,
	number: number,
) {
	const task = await requireTask(db, scope, slug, number);
	if (!(await q.deleteTask(db, task.id))) throw notFound(`Task ${taskKey(number)} not found`);
}
export async function listNotes(db: Database, scope: WorkspaceScope, slug: string) {
	const project = await requireProject(db, scope, slug);
	return (await q.listNotes(db, project.id)).map(noteView);
}
/** A note as just written or changed, read back with the people's names. */
async function readNote(db: Database, projectId: string, id: string) {
	const note = await q.findNote(db, projectId, id);
	if (!note) throw notFound("Note not found");
	return noteView(note);
}
export async function createNote(
	db: Database,
	scope: WorkspaceScope,
	slug: string,
	input: CreateNoteInput,
) {
	const project = await requireProject(db, scope, slug, true);
	const note = await q.createNote(db, {
		projectId: project.id,
		body: input.body,
		source: input.source ?? null,
		threadId: input.threadId ?? null,
		pinned: input.pinned ?? false,
		shared: input.shared ?? false,
		icon: input.icon ?? null,
		agents: uniqueAgents(input.agents),
		createdBy: scope.userId,
		updatedBy: scope.userId,
	});
	return readNote(db, project.id, note.id);
}
export async function updateNote(
	db: Database,
	scope: WorkspaceScope,
	slug: string,
	id: string,
	input: UpdateNoteInput,
) {
	const project = await requireProject(db, scope, slug, true);
	// Pinning, sharing or a new glyph is not an edit: only a new text moves "edited" and its author.
	const changes: q.NoteChanges = {
		...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
		...(input.shared !== undefined ? { shared: input.shared } : {}),
		...(input.icon !== undefined ? { icon: input.icon } : {}),
		...(input.agents !== undefined ? { agents: uniqueAgents(input.agents) } : {}),
		...(input.body !== undefined
			? { body: input.body, updatedBy: scope.userId, updatedAt: new Date() }
			: {}),
	};
	const note = await q.updateNote(db, project.id, id, changes);
	if (!note) throw notFound("Note not found");
	return readNote(db, project.id, id);
}
/** Each agent once; an empty list is no choice, so the note goes to every agent. */
function uniqueAgents(agents: readonly string[] | null | undefined): string[] | null {
	const unique = [...new Set(agents ?? [])];
	return unique.length ? unique : null;
}

/** The note an image is being added to, so the upload is refused for anyone who cannot edit it. */
export async function requireNote(db: Database, scope: WorkspaceScope, slug: string, id: string) {
	const project = await requireProject(db, scope, slug, true);
	return readNote(db, project.id, id);
}

export async function deleteNote(db: Database, scope: WorkspaceScope, slug: string, id: string) {
	const project = await requireProject(db, scope, slug, true);
	if (!(await q.deleteNote(db, project.id, id))) throw notFound("Note not found");
}
