import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { DatabaseService } from '@/database/database.service';
import type { NewProjectRecord, NewTaskRecord } from '@/database/schema';
import { projects, tasks } from '@/database/schema';

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
	 * Allocates the task's per-project number and trailing position inside one
	 * statement, so two concurrent creates cannot pick the same number. The unique
	 * index on (project_id, number) is the backstop if they ever do.
	 */
	async createTask(input: Omit<NewTaskRecord, 'number' | 'position'>) {
		const nextNumber = sql`(select coalesce(max(${tasks.number}), 0) + 1 from ${tasks} where ${tasks.projectId} = ${input.projectId})`;
		const nextPosition = sql`(select coalesce(max(${tasks.position}), 0) + 1 from ${tasks} where ${tasks.projectId} = ${input.projectId})`;
		const [task] = await this.database.db
			.insert(tasks)
			.values({
				...input,
				number: nextNumber as unknown as number,
				position: nextPosition as unknown as number,
			})
			.returning();
		if (!task) throw new Error('Task insert did not return a record');
		return task;
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
}
