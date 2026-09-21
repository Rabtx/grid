import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

import { projects } from './projects.schema';

/**
 * The workflow stages from the Grid product definition. Stages are fixed for now;
 * making them configurable per project is a later concern, and a closed enum keeps
 * the board honest until then.
 */
export const taskStatus = pgEnum('task_status', [
	'backlog',
	'ready',
	'in_progress',
	'review',
	'qa',
	'blocked',
	'done',
]);

/** Humans and agents are both first-class workers, so ownership records which kind. */
export const taskOwnerKind = pgEnum('task_owner_kind', ['human', 'agent']);

export const tasks = pgTable(
	'tasks',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		/** Per-project counter that gives a task its human-readable TASK-<number> key. */
		number: integer('number').notNull(),
		title: varchar('title', { length: 200 }).notNull(),
		description: text('description'),
		status: taskStatus('status').notNull().default('backlog'),
		ownerKind: taskOwnerKind('owner_kind'),
		/** Free text until agents are entities of their own, e.g. "backend agent". */
		ownerName: varchar('owner_name', { length: 120 }),
		/** Branch the work lives on, e.g. agent/backend/auth-api. */
		branch: varchar('branch', { length: 200 }),
		/** Sort order inside a status column; larger sorts later. */
		position: integer('position').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('tasks_project_number_unique').on(table.projectId, table.number),
		index('tasks_project_id_idx').on(table.projectId),
		index('tasks_project_status_idx').on(table.projectId, table.status),
	],
);

export type TaskRecord = typeof tasks.$inferSelect;
export type NewTaskRecord = typeof tasks.$inferInsert;
