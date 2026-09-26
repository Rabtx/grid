import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./users.schema";
import { workspaces } from "./workspaces.schema";

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

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
