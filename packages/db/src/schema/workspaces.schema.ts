import {
	index,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.schema";

/**
 * A workspace is the company: it owns projects, billing and (later) environments, agents and
 * secrets. People belong to several and switch between them.
 */
export const workspaces = pgTable(
	"workspaces",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		/** In URLs: `/acme/board/web-app`. */
		slug: varchar("slug", { length: 64 }).notNull(),
		name: varchar("name", { length: 120 }).notNull(),
		/** How the workspace is drawn, like a project: an icon id and a colour. */
		icon: varchar("icon", { length: 64 }),
		color: varchar("color", { length: 32 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [uniqueIndex("workspaces_slug_unique").on(table.slug)],
);

/** Owner: billing and deleting the workspace. Admin: members and settings. Member: the work. */
export const workspaceRole = pgEnum("workspace_role", ["owner", "admin", "member"]);

export const workspaceMembers = pgTable(
	"workspace_members",
	{
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: workspaceRole("role").notNull().default("member"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.userId] }),
		index("workspace_members_user_id_idx").on(table.userId),
	],
);

export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type WorkspaceMemberRecord = typeof workspaceMembers.$inferSelect;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
