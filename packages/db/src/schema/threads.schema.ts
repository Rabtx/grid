import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.schema";
import { workspaces } from "./workspaces.schema";

/**
 * Agent threads, as their runners send them. A runner keeps each thread in its own SQLite for
 * speed and for working offline; this is where they outlive that machine. `id` is the runner's own
 * session id, so the same thread sent twice is the same row.
 */
export const threads = pgTable(
	"threads",
	{
		id: varchar("id", { length: 120 }).primaryKey(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		/** The project's slug, as the runner knows it. */
		project: varchar("project", { length: 120 }).notNull(),
		/** Who started it; kept as null when they leave. */
		ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
		provider: varchar("provider", { length: 64 }).notNull(),
		title: text("title").notNull(),
		model: varchar("model", { length: 200 }),
		mode: varchar("mode", { length: 64 }),
		effort: varchar("effort", { length: 32 }),
		/** The machine whose runner holds it now, and that machine's name when it last sent it. */
		machineId: varchar("machine_id", { length: 64 }).notNull(),
		machineName: varchar("machine_name", { length: 200 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
		syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("threads_workspace_project_idx").on(table.workspaceId, table.project, table.updatedAt),
		index("threads_machine_idx").on(table.machineId),
	],
);

/**
 * A thread's events in order: messages, tool calls, diffs, approvals. Append-only, numbered by the
 * runner, so a sync sends what came after the last `seq` the server has and a repeat is a no-op.
 */
export const threadEvents = pgTable(
	"thread_events",
	{
		threadId: varchar("thread_id", { length: 120 })
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		data: jsonb("data").notNull(),
	},
	(table) => [primaryKey({ columns: [table.threadId, table.seq] })],
);

/**
 * Files attached to a thread's messages (images, logs), each sent once by the machine holding the
 * thread, so a restored thread opens them too. Base64, which every driver reads the same; a file is
 * at most 10 MB on the runner.
 */
export const threadAttachments = pgTable(
	"thread_attachments",
	{
		threadId: varchar("thread_id", { length: 120 })
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		id: varchar("id", { length: 120 }).notNull(),
		name: text("name").notNull(),
		mimeType: varchar("mime_type", { length: 200 }).notNull(),
		size: integer("size").notNull(),
		data: text("data").notNull(),
	},
	(table) => [primaryKey({ columns: [table.threadId, table.id] })],
);

export type ThreadRecord = typeof threads.$inferSelect;
export type NewThreadRecord = typeof threads.$inferInsert;
