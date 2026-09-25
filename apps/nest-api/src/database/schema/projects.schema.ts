import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

export const projectStatus = pgEnum('project_status', ['active', 'archived']);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		slug: varchar('slug', { length: 64 }).notNull(),
		name: varchar('name', { length: 120 }).notNull(),
		summary: varchar('summary', { length: 280 }),
		repoUrl: varchar('repo_url', { length: 2048 }),
		/** How the project is drawn: an icon id (a symbol, a pixel mascot, `letter`) and a colour. */
		icon: varchar('icon', { length: 64 }),
		color: varchar('color', { length: 32 }),
		status: projectStatus('status').notNull().default('active'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex('projects_owner_slug_unique').on(table.ownerId, table.slug),
		index('projects_owner_id_idx').on(table.ownerId),
		index('projects_status_idx').on(table.status),
	],
);

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;
