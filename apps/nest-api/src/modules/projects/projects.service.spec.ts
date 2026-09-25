import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

import type { NoteRecord, ProjectRecord, TaskRecord } from '@/database/schema';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

const OWNER_ID = 'a01a0cab-a947-44f0-bfcd-4b8e8c907534';
const OTHER_OWNER_ID = 'b12b1dbc-b058-55a1-cade-5c9f9da18645';

function projectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
	return {
		id: 'c23c2ecd-c169-66b2-dbef-6dafaeb29756',
		ownerId: OWNER_ID,
		slug: 'grid',
		name: 'Grid',
		summary: null,
		repoUrl: null,
		status: 'active',
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	};
}

function taskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
	return {
		id: 'd34d3fde-d27a-77c3-ecf0-7ebabfc30867',
		projectId: projectRecord().id,
		number: 1,
		title: 'Implement the board',
		description: null,
		status: 'backlog',
		ownerKind: null,
		ownerName: null,
		branch: null,
		position: 1,
		createdAt: new Date('2026-09-01T00:00:00.000Z'),
		updatedAt: new Date('2026-09-01T00:00:00.000Z'),
		...overrides,
	};
}

function noteRecord(overrides: Partial<NoteRecord> = {}): NoteRecord {
	return {
		id: 'e45e4aef-e38b-88d4-fda1-8fcbcad41978',
		projectId: projectRecord().id,
		body: 'Use Hono for the API',
		source: 'Claude in Plan the API',
		threadId: 'thread-1',
		createdAt: new Date('2026-09-02T00:00:00.000Z'),
		updatedAt: new Date('2026-09-02T00:00:00.000Z'),
		...overrides,
	};
}

describe('ProjectsService', () => {
	let repository: Mocked<ProjectsRepository>;
	let service: ProjectsService;
	let projects: ProjectRecord[];
	let tasks: TaskRecord[];

	beforeEach(() => {
		projects = [projectRecord()];
		tasks = [taskRecord()];
		repository = {
			listProjects: vi.fn(async (ownerId: string) =>
				projects.filter((project) => project.ownerId === ownerId),
			),
			findProjectBySlug: vi.fn(
				async (ownerId: string, slug: string) =>
					projects.find((project) => project.ownerId === ownerId && project.slug === slug) ?? null,
			),
			createProject: vi.fn(async (input) => projectRecord(input as Partial<ProjectRecord>)),
			updateProject: vi.fn(async (_id, input) => projectRecord(input as Partial<ProjectRecord>)),
			listTasks: vi.fn(async (projectId: string) =>
				tasks.filter((task) => task.projectId === projectId),
			),
			findTaskByNumber: vi.fn(
				async (projectId: string, number: number) =>
					tasks.find((task) => task.projectId === projectId && task.number === number) ?? null,
			),
			createTask: vi.fn(async (input) =>
				taskRecord({ ...(input as Partial<TaskRecord>), number: 2 }),
			),
			updateTask: vi.fn(async (_id, input) => taskRecord(input as Partial<TaskRecord>)),
			deleteTask: vi.fn(async () => true),
			listNotes: vi.fn(async () => [noteRecord()]),
			createNote: vi.fn(async (input) => noteRecord(input as Partial<NoteRecord>)),
			updateNote: vi.fn(async (_project, id: string, body: string) =>
				id === noteRecord().id ? noteRecord({ body }) : null,
			),
			deleteNote: vi.fn(async (_project, id: string) => id === noteRecord().id),
		} as unknown as Mocked<ProjectsRepository>;
		service = new ProjectsService(repository);
	});

	it('exposes a task key built from the per-project number', async () => {
		const [task] = await service.listTasks(OWNER_ID, 'grid');
		expect(task?.key).toBe('TASK-1');
		expect(task?.number).toBe(1);
	});

	it('defaults a new task to the backlog', async () => {
		const task = await service.createTask(OWNER_ID, 'grid', { title: 'Wire the host' });
		expect(task.status).toBe('backlog');
		expect(repository.createTask).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'backlog', title: 'Wire the host' }),
		);
	});

	it('reports owner kind and name together, or not at all', async () => {
		tasks = [taskRecord({ ownerKind: 'agent', ownerName: 'backend agent' })];
		const [owned] = await service.listTasks(OWNER_ID, 'grid');
		expect(owned?.owner).toEqual({ kind: 'agent', name: 'backend agent' });

		tasks = [taskRecord({ ownerKind: null, ownerName: 'ignored' })];
		const [unowned] = await service.listTasks(OWNER_ID, 'grid');
		expect(unowned?.owner).toBeNull();
	});

	it('rejects a duplicate slug for the same owner', async () => {
		await expect(service.createProject(OWNER_ID, { slug: 'grid', name: 'Grid' })).rejects.toThrow(
			ConflictException,
		);
	});

	it('allows the same slug for a different owner', async () => {
		const project = await service.createProject(OTHER_OWNER_ID, { slug: 'grid', name: 'Grid' });
		expect(project.slug).toBe('grid');
	});

	it('hides another owner projects behind a not-found', async () => {
		await expect(service.getProject(OTHER_OWNER_ID, 'grid')).rejects.toThrow(NotFoundException);
		await expect(service.listTasks(OTHER_OWNER_ID, 'grid')).rejects.toThrow(NotFoundException);
		await expect(service.updateTask(OTHER_OWNER_ID, 'grid', 1, { status: 'done' })).rejects.toThrow(
			NotFoundException,
		);
	});

	it('refuses to touch a task that belongs to no project of the owner', async () => {
		await expect(service.updateTask(OWNER_ID, 'grid', 404, { status: 'done' })).rejects.toThrow(
			NotFoundException,
		);
		expect(repository.updateTask).not.toHaveBeenCalled();
	});

	it('moves a task between stages', async () => {
		const task = await service.updateTask(OWNER_ID, 'grid', 1, { status: 'review' });
		expect(task.status).toBe('review');
		expect(repository.updateTask).toHaveBeenCalledWith(taskRecord().id, { status: 'review' });
	});

	it('saves a note with where it came from', async () => {
		const note = await service.createNote(OWNER_ID, 'grid', {
			body: 'Keep Postgres',
			source: 'Codex in Plan',
			threadId: 'thread-9',
		});
		expect(note).toMatchObject({
			body: 'Keep Postgres',
			source: 'Codex in Plan',
			threadId: 'thread-9',
		});
		expect(repository.createNote).toHaveBeenCalledWith({
			projectId: projectRecord().id,
			body: 'Keep Postgres',
			source: 'Codex in Plan',
			threadId: 'thread-9',
		});
	});

	it('lists notes as views with ISO dates', async () => {
		const [note] = await service.listNotes(OWNER_ID, 'grid');
		expect(note).toEqual({
			id: noteRecord().id,
			body: 'Use Hono for the API',
			source: 'Claude in Plan the API',
			threadId: 'thread-1',
			createdAt: '2026-09-02T00:00:00.000Z',
			updatedAt: '2026-09-02T00:00:00.000Z',
		});
	});

	it('edits and deletes only notes on the project, and hides other owners', async () => {
		const edited = await service.updateNote(OWNER_ID, 'grid', noteRecord().id, { body: 'Changed' });
		expect(edited.body).toBe('Changed');
		await expect(
			service.updateNote(OWNER_ID, 'grid', 'f0000000-0000-4000-8000-000000000000', { body: 'x' }),
		).rejects.toThrow(NotFoundException);
		await expect(
			service.deleteNote(OWNER_ID, 'grid', 'f0000000-0000-4000-8000-000000000000'),
		).rejects.toThrow(NotFoundException);
		await expect(service.listNotes(OTHER_OWNER_ID, 'grid')).rejects.toThrow(NotFoundException);
		await expect(service.deleteNote(OWNER_ID, 'grid', noteRecord().id)).resolves.toBeUndefined();
	});
});
