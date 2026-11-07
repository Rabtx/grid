import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.schema";
import { workspaces } from "./workspaces.schema";

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

/** Where a workflow state sits in the work's life: how Grid colours it and what it counts as. */
export type WorkflowCategory = "backlog" | "unstarted" | "started" | "review" | "done";

/** One state of a project's workflow, as it is kept: its key, name, kind and whether it shows. */
export type WorkflowStateRecord = {
	key: string;
	name: string;
	category: WorkflowCategory;
	/** Kept but not shown as a column (a built-in state the project does not use). */
	hidden?: boolean;
};

/**
 * The workflow a project has until it changes it, after Linear's: Backlog, Todo, In progress,
 * In review, Done, with Blocked and QA kept but hidden. Every key here is a built-in: always in
 * a workflow, renamed, reordered or hidden but never removed, because agents move cards by them.
 */
export const DEFAULT_WORKFLOW: readonly WorkflowStateRecord[] = [
	{ key: "backlog", name: "Backlog", category: "backlog" },
	{ key: "ready", name: "Todo", category: "unstarted" },
	{ key: "in_progress", name: "In progress", category: "started" },
	{ key: "blocked", name: "Blocked", category: "started", hidden: true },
	{ key: "review", name: "In review", category: "review" },
	{ key: "qa", name: "QA", category: "review", hidden: true },
	{ key: "done", name: "Done", category: "done" },
];

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		/** The workspace that owns the project. */
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		/** Who made it; kept when they leave (the project stays with the workspace). */
		createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
		slug: varchar("slug", { length: 64 }).notNull(),
		name: varchar("name", { length: 120 }).notNull(),
		summary: varchar("summary", { length: 280 }),
		repoUrl: varchar("repo_url", { length: 2048 }),
		/** How the project is drawn: an icon id (a symbol, a pixel mascot, `letter`) and a colour. */
		icon: varchar("icon", { length: 64 }),
		color: varchar("color", { length: 32 }),
		status: projectStatus("status").notNull().default("active"),
		/** The board's states in order; null until the project changes them (the built-ins). */
		workflow: jsonb("workflow").$type<WorkflowStateRecord[]>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("projects_workspace_slug_unique").on(table.workspaceId, table.slug),
		index("projects_workspace_id_idx").on(table.workspaceId),
		index("projects_status_idx").on(table.status),
	],
);

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;
