import * as z from 'zod';

export const TASK_STATUSES = [
	'backlog',
	'ready',
	'in_progress',
	'review',
	'qa',
	'blocked',
	'done',
] as const;

export const TASK_OWNER_KINDS = ['human', 'agent'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskOwnerKind = (typeof TASK_OWNER_KINDS)[number];

const slug = z
	.string()
	.trim()
	.toLowerCase()
	.min(2)
	.max(64)
	.regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and dashes');

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const createProjectSchema = z
	.object({
		slug,
		name: z.string().trim().min(1).max(120),
		summary: optionalText(280),
		repoUrl: z.url().max(2048).nullable().optional(),
	})
	.strict();

export class CreateProjectDto {
	static schema = createProjectSchema;
	slug!: string;
	name!: string;
	summary?: string | null;
	repoUrl?: string | null;
}

export const updateProjectSchema = z
	.object({
		name: z.string().trim().min(1).max(120).optional(),
		summary: optionalText(280),
		repoUrl: z.url().max(2048).nullable().optional(),
		status: z.enum(['active', 'archived']).optional(),
	})
	.strict()
	.refine((input) => Object.keys(input).length > 0, 'At least one project field is required');

export class UpdateProjectDto {
	static schema = updateProjectSchema;
	name?: string;
	summary?: string | null;
	repoUrl?: string | null;
	status?: 'active' | 'archived';
}

const owner = z
	.object({
		ownerKind: z.enum(TASK_OWNER_KINDS).nullable().optional(),
		ownerName: optionalText(120),
	})
	.partial();

export const createTaskSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: optionalText(4000),
		status: z.enum(TASK_STATUSES).optional(),
		branch: optionalText(200),
	})
	.extend(owner.shape)
	.strict();

export class CreateTaskDto {
	static schema = createTaskSchema;
	title!: string;
	description?: string | null;
	status?: TaskStatus;
	ownerKind?: TaskOwnerKind | null;
	ownerName?: string | null;
	branch?: string | null;
}

export const updateTaskSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		description: optionalText(4000),
		status: z.enum(TASK_STATUSES).optional(),
		branch: optionalText(200),
		position: z.number().int().min(0).max(1_000_000).optional(),
	})
	.extend(owner.shape)
	.strict()
	.refine((input) => Object.keys(input).length > 0, 'At least one task field is required');

export class UpdateTaskDto {
	static schema = updateTaskSchema;
	title?: string;
	description?: string | null;
	status?: TaskStatus;
	ownerKind?: TaskOwnerKind | null;
	ownerName?: string | null;
	branch?: string | null;
	position?: number;
}

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
