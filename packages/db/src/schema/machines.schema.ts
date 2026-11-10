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
import { workspaces } from "./workspaces.schema";

/** How a machine reached the control plane: provisioned by the team, or brought by a teammate. */
export const machineKind = pgEnum("machine_kind", ["managed", "byom"]);

/** A machine's reachability, as its last heartbeat or its provisioner left it. */
export const machineStatus = pgEnum("machine_status", ["pending", "online", "offline", "disabled"]);

/** What a machine says about itself on enrollment and every heartbeat. */
export type MachinePlatform = {
	hostname?: string;
	system?: string;
	cpu?: string;
	cores?: number;
	memoryTotalBytes?: number;
	runnerVersion?: string;
	projectsDir?: string;
};

/**
 * A computer agents can run on: a rootless container the team server provisioned, or a laptop,
 * VPS or server a teammate enrolled. The record lives in the control plane so every teammate sees
 * the same inventory and role permissions decide who may manage it. The machine's address and
 * secret stay server-side; only the hosted runner may read them to relay console traffic.
 */
export const machines = pgTable(
	"machines",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		/** Whose machine it is; null once that person leaves. */
		ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
		name: varchar("name", { length: 200 }).notNull(),
		kind: machineKind("kind").notNull().default("byom"),
		status: machineStatus("status").notNull().default("pending"),
		/** How the hosted runner reaches it, e.g. http://127.0.0.1:4201 or https://vps.ts.net. */
		address: varchar("address", { length: 2048 }),
		/** SHA-256 of the machine secret; the secret itself is never stored in the clear. */
		secretHash: varchar("secret_hash", { length: 64 }),
		platform: jsonb("platform").$type<MachinePlatform>().notNull().default({}),
		lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		index("machines_workspace_id_idx").on(table.workspaceId),
		index("machines_owner_id_idx").on(table.ownerId),
		index("machines_last_seen_idx").on(table.lastSeenAt),
	],
);

/**
 * A one-time code that lets one runner join a workspace. Stored hashed, valid for fifteen
 * minutes, and used once; the machine row is made first so the console can show it as pending.
 */
export const machineEnrollments = pgTable(
	"machine_enrollments",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		machineId: uuid("machine_id")
			.notNull()
			.references(() => machines.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
		tokenHash: varchar("token_hash", { length: 64 }).notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		usedAt: timestamp("used_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("machine_enrollments_token_hash_unique").on(table.tokenHash),
		index("machine_enrollments_machine_id_idx").on(table.machineId),
		index("machine_enrollments_expires_at_idx").on(table.expiresAt),
	],
);

/**
 * Which machine a project's agents run on. A missing row means the hosted runner's own machine;
 * the project is the runner's slug, the same key threads and folders use.
 */
export const machinePlacements = pgTable(
	"machine_placements",
	{
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		project: varchar("project", { length: 120 }).notNull(),
		machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.project] }),
		index("machine_placements_machine_id_idx").on(table.machineId),
	],
);

export type MachineRecord = typeof machines.$inferSelect;
export type NewMachineRecord = typeof machines.$inferInsert;
export type MachineEnrollmentRecord = typeof machineEnrollments.$inferSelect;
export type MachinePlacementRecord = typeof machinePlacements.$inferSelect;
