import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { eq } from "drizzle-orm";

import type { SessionLookup } from "./http/auth";

/** The access-token check's view of sessions and users, from Postgres. */
export function sessionLookup(db: Database): SessionLookup {
	return {
		async session(id) {
			const [row] = await db
				.select({
					userId: schema.sessions.userId,
					revokedAt: schema.sessions.revokedAt,
					expiresAt: schema.sessions.expiresAt,
				})
				.from(schema.sessions)
				.where(eq(schema.sessions.id, id))
				.limit(1);
			return row ?? null;
		},
		async userIsActive(id) {
			const [row] = await db
				.select({ isActive: schema.users.isActive })
				.from(schema.users)
				.where(eq(schema.users.id, id))
				.limit(1);
			return row?.isActive === true;
		},
	};
}
