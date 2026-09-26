import { boolean, check, pgTable, smallint, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./users.schema";

/** This Grid's own settings: one row. */
export const instanceSettings = pgTable(
	"instance_settings",
	{
		id: smallint("id").primaryKey().default(1),
		/** Anyone may sign up; otherwise only with an invite. Closed until the owner opens it. */
		signupOpen: boolean("signup_open").notNull().default(false),
		/** Who set this Grid up: the one who can open signup. */
		ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
		/** The first-run setup code (hashed), while nobody has signed up yet. */
		setupCodeHash: varchar("setup_code_hash", { length: 64 }),
		setupCodeExpiresAt: timestamp("setup_code_expires_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [check("instance_settings_single_row", sql`${table.id} = 1`)],
);

export type InstanceSettingsRecord = typeof instanceSettings.$inferSelect;
