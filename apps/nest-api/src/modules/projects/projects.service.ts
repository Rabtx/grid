import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { ProjectRecord, TaskRecord } from '@/database/schema';
import type {
	CreateProjectInput,
	CreateTaskInput,
	UpdateProjectInput,
	UpdateTaskInput,
} from './projects.dto';
import { ProjectsRepository } from './projects.repository';

export type ProjectView = {
	slug: string;
	name: string;
	summary: string | null;
	repoUrl: string | null;
	icon: string | null;
	color: string | null;
	status: ProjectRecord['status'];
	createdAt: string;
	updatedAt: string;
};

export type TaskView = {
	key: string;
	number: number;
	title: string;
	description: string | null;
	status: TaskRecord['status'];
	owner: { kind: NonNullable<TaskRecord['ownerKind']>; name: string | null } | null;
	branch: string | null;
	position: number;
	createdAt: string;
	updatedAt: string;
};

@Injectable()
export class ProjectsService {
	constructor(private readonly repository: ProjectsRepository) {}

	async listProjects(ownerId: string): Promise<ProjectView[]> {
		const records = await this.repository.listProjects(ownerId);
		return records.map(toProjectView);
	}

	async createProject(ownerId: string, input: CreateProjectInput): Promise<ProjectView> {
		const existing = await this.repository.findProjectBySlug(ownerId, input.slug);
		if (existing) {
			throw new ConflictException(`Project "${input.slug}" already exists`);
		}
		const project = await this.repository.createProject({
			ownerId,
			slug: input.slug,
			name: input.name,
			summary: input.summary ?? null,
			repoUrl: input.repoUrl ?? null,
			icon: input.icon ?? null,
			color: input.color ?? null,
		});
		return toProjectView(project);
	}

	async getProject(ownerId: string, slug: string): Promise<ProjectView> {
		return toProjectView(await this.requireProject(ownerId, slug));
	}

	async updateProject(
		ownerId: string,
		slug: string,
		input: UpdateProjectInput,
	): Promise<ProjectView> {
		const project = await this.requireProject(ownerId, slug);
		const updated = await this.repository.updateProject(project.id, input);
		if (!updated) throw new NotFoundException(`Project "${slug}" not found`);
		return toProjectView(updated);
	}

	async listTasks(ownerId: string, slug: string): Promise<TaskView[]> {
		const project = await this.requireProject(ownerId, slug);
		const records = await this.repository.listTasks(project.id);
		return records.map(toTaskView);
	}

	async createTask(ownerId: string, slug: string, input: CreateTaskInput): Promise<TaskView> {
		const project = await this.requireProject(ownerId, slug);
		const task = await this.repository.createTask({
			projectId: project.id,
			title: input.title,
			description: input.description ?? null,
			status: input.status ?? 'backlog',
			ownerKind: input.ownerKind ?? null,
			ownerName: input.ownerName ?? null,
			branch: input.branch ?? null,
		});
		return toTaskView(task);
	}

	async updateTask(
		ownerId: string,
		slug: string,
		number: number,
		input: UpdateTaskInput,
	): Promise<TaskView> {
		const task = await this.requireTask(ownerId, slug, number);
		const updated = await this.repository.updateTask(task.id, input);
		if (!updated) throw new NotFoundException(`Task ${taskKey(number)} not found`);
		return toTaskView(updated);
	}

	async deleteTask(ownerId: string, slug: string, number: number): Promise<void> {
		const task = await this.requireTask(ownerId, slug, number);
		const deleted = await this.repository.deleteTask(task.id);
		if (!deleted) throw new NotFoundException(`Task ${taskKey(number)} not found`);
	}

	private async requireProject(ownerId: string, slug: string): Promise<ProjectRecord> {
		const project = await this.repository.findProjectBySlug(ownerId, slug);
		if (!project) throw new NotFoundException(`Project "${slug}" not found`);
		return project;
	}

	private async requireTask(ownerId: string, slug: string, number: number): Promise<TaskRecord> {
		const project = await this.requireProject(ownerId, slug);
		const task = await this.repository.findTaskByNumber(project.id, number);
		if (!task) throw new NotFoundException(`Task ${taskKey(number)} not found`);
		return task;
	}
}

function taskKey(number: number): string {
	return `TASK-${number}`;
}

function toProjectView(record: ProjectRecord): ProjectView {
	return {
		slug: record.slug,
		name: record.name,
		summary: record.summary,
		repoUrl: record.repoUrl,
		icon: record.icon,
		color: record.color,
		status: record.status,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}

function toTaskView(record: TaskRecord): TaskView {
	return {
		key: taskKey(record.number),
		number: record.number,
		title: record.title,
		description: record.description,
		status: record.status,
		owner: record.ownerKind ? { kind: record.ownerKind, name: record.ownerName } : null,
		branch: record.branch,
		position: record.position,
		createdAt: record.createdAt.toISOString(),
		updatedAt: record.updatedAt.toISOString(),
	};
}
