import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users.schema";

/** Who may start an agent in a workspace. */
export type AgentAccess = "everyone" | "admins";

/** What applies to everyone in a workspace; a missing field is its default. */
export type WorkspaceSettings = {
	/** New tasks and worktrees branch from here. */
	defaultBranch?: string;
	/** Used when a task does not pick an agent. */
	defaultAgent?: string;
	/** The board, automations and reports start their weeks here. */
	weekStartsOn?: "monday" | "sunday" | "saturday";
	/** Agent transcripts and terminal output older than this many days are cleared; 0 keeps them. */
	logRetentionDays?: number;
	/** Per agent id, who may start it; everyone when not set. */
	agentAccess?: Record<string, AgentAccess>;
};

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
		/** An uploaded logo, as a path on the API (`/uploads/logos/…`); drawn instead of the icon. */
		logoUrl: varchar("logo_url", { length: 2048 }),
		/**
		 * What applies to everyone in it (Settings → General): the default branch and agent, the
		 * first day of the week, how long run logs are kept, and who may start each agent.
		 */
		settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
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

/**
 * An invitation to join a workspace with a role, by link (anyone holding it) or for one email.
 * Used once; the token is stored hashed.
 */
export const workspaceInvites = pgTable(
	"workspace_invites",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		tokenHash: varchar("token_hash", { length: 64 }).notNull(),
		/** Only this address may accept; null for a link anyone can use. */
		email: varchar("email", { length: 320 }),
		role: workspaceRole("role").notNull().default("member"),
		invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("workspace_invites_token_hash_unique").on(table.tokenHash),
		index("workspace_invites_workspace_id_idx").on(table.workspaceId),
	],
);

export type WorkspaceRecord = typeof workspaces.$inferSelect;
export type WorkspaceInviteRecord = typeof workspaceInvites.$inferSelect;
export type WorkspaceMemberRecord = typeof workspaceMembers.$inferSelect;
export type WorkspaceRole = (typeof workspaceRole.enumValues)[number];
