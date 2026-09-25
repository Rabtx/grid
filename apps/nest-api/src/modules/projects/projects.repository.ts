import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { DatabaseService } from '@/database/database.service';
import type { NewNoteRecord, NewProjectRecord, NewTaskRecord } from '@/database/schema';
import { notes, projects, tasks } from '@/database/schema';

@Injectable()
export class ProjectsRepository {
	constructor(private readonly database: DatabaseService) {}

	async listProjects(ownerId: string) {
		return this.database.db
			.select()
			.from(projects)
			.where(eq(projects.ownerId, ownerId))
			.orderBy(asc(projects.name));
	}

	async findProjectBySlug(ownerId: string, slug: string) {
		const [project] = await this.database.db
			.select()
			.from(projects)
			.where(and(eq(projects.ownerId, ownerId), eq(projects.slug, slug)))
			.limit(1);
		return project ?? null;
	}

	async createProject(input: NewProjectRecord) {
		const [project] = await this.database.db.insert(projects).values(input).returning();
		if (!project) throw new Error('Project insert did not return a record');
		return project;
	}

	async updateProject(projectId: string, input: Partial<NewProjectRecord>) {
		const [project] = await this.database.db
			.update(projects)
			.set({ ...input, updatedAt: new Date() })
			.where(eq(projects.id, projectId))
			.returning();
		return project ?? null;
	}

	async listTasks(projectId: string) {
		return this.database.db
			.select()
			.from(tasks)
			.where(eq(tasks.projectId, projectId))
			.orderBy(asc(tasks.position), asc(tasks.number));
	}

	async findTaskByNumber(projectId: string, number: number) {
		const [task] = await this.database.db
			.select()
			.from(tasks)
			.where(and(eq(tasks.projectId, projectId), eq(tasks.number, number)))
			.limit(1);
		return task ?? null;
	}

	/**
	 * Allocates the task's per-project number and trailing board position.
	 *
	 * Computing `max(number) + 1` in a subquery is not enough: under READ COMMITTED
	 * two concurrent inserts both read the same maximum, and one of them dies on the
	 * unique index. That is exactly what happened when this was first exercised
	 * against Postgres — five of eight concurrent creates were rejected. Locking the
	 * project row first serialises allocation per board, which is the granularity
	 * that matters, and leaves boards in other projects free to proceed.
	 */
	async createTask(input: Omit<NewTaskRecord, 'number' | 'position'>) {
		return this.database.db.transaction(async (tx) => {
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
			if (!task) throw new Error('Task insert did not return a record');
			return task;
		});
	}

	async updateTask(taskId: string, input: Partial<NewTaskRecord>) {
		const [task] = await this.database.db
			.update(tasks)
			.set({ ...input, updatedAt: new Date() })
			.where(eq(tasks.id, taskId))
			.returning();
		return task ?? null;
	}

	async deleteTask(taskId: string) {
		const deleted = await this.database.db.delete(tasks).where(eq(tasks.id, taskId)).returning();
		return deleted.length > 0;
	}

	async listNotes(projectId: string) {
		return this.database.db
			.select()
			.from(notes)
			.where(eq(notes.projectId, projectId))
			.orderBy(desc(notes.createdAt));
	}

	async createNote(input: NewNoteRecord) {
		const [note] = await this.database.db.insert(notes).values(input).returning();
		if (!note) throw new Error('Note insert did not return a record');
		return note;
	}

	async updateNote(projectId: string, noteId: string, body: string) {
		const [note] = await this.database.db
			.update(notes)
			.set({ body, updatedAt: new Date() })
			.where(and(eq(notes.projectId, projectId), eq(notes.id, noteId)))
			.returning();
		return note ?? null;
	}

	async deleteNote(projectId: string, noteId: string) {
		const deleted = await this.database.db
			.delete(notes)
			.where(and(eq(notes.projectId, projectId), eq(notes.id, noteId)))
			.returning();
		return deleted.length > 0;
	}
}
