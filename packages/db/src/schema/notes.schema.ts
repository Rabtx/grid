import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { projects } from "./projects.schema";
import { users } from "./users.schema";

/**
 * A project's notes: decisions, snippets and agent answers worth keeping. They belong to the
 * project, not to a machine, so they outlive the environment and the chat they came from.
 */
export const notes = pgTable(
	"notes",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/** Markdown. */
		body: text("body").notNull(),
		/** Where it was saved from, e.g. "Claude in Fix login", so the note keeps its context. */
		source: varchar("source", { length: 200 }),
		/** The chat it came from, to jump back to it. */
		threadId: varchar("thread_id", { length: 120 }),
		/** Kept at the top of the project's notes. */
		pinned: boolean("pinned").notNull().default(false),
		/** Given to agents: new threads in the project start with the shared notes. */
		shared: boolean("shared").notNull().default(false),
		/** Its glyph in the list (a fixed set the console knows); null for the plain note. */
		icon: varchar("icon", { length: 24 }),
		/** Who wrote it and who last changed it; kept as null when they leave. */
		createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
		updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("notes_project_id_idx").on(table.projectId, table.createdAt)],
);

export type NoteRecord = typeof notes.$inferSelect;
export type NewNoteRecord = typeof notes.$inferInsert;
