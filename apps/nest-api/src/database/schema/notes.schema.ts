import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { projects } from './projects.schema';

/**
 * A project's notes: decisions, snippets and agent answers worth keeping. They belong to the
 * project, not to a machine, so they outlive the environment and the chat they came from.
 */
export const notes = pgTable(
	'notes',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		/** Markdown. */
		body: text('body').notNull(),
		/** Where it was saved from, e.g. "Claude in Fix login", so the note keeps its context. */
		source: varchar('source', { length: 200 }),
		/** The chat it came from, to jump back to it. */
		threadId: varchar('thread_id', { length: 120 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index('notes_project_id_idx').on(table.projectId, table.createdAt)],
);

export type NoteRecord = typeof notes.$inferSelect;
export type NewNoteRecord = typeof notes.$inferInsert;
