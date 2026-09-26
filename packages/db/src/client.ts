import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import * as schema from "./schema";

export type DatabaseOptions = {
	/** Pool size; scripts use one connection. */
	max?: number;
	/** Require TLS, for hosted Postgres. */
	ssl?: boolean;
};

/** Grid's Postgres through Bun's own client (`Bun.sql`), with the schema for typed queries. */
export function createDatabase(url: string, options: DatabaseOptions = {}) {
	const client = new SQL(url, {
		max: options.max ?? 10,
		// Poolers in transaction mode (Neon, PgBouncer) cannot keep prepared statements.
		prepare: false,
		tls: options.ssl ?? false,
	});
	const db = drizzle({ client, schema });
	return { db, close: () => client.close({ timeout: 5 }) };
}

export type Database = ReturnType<typeof createDatabase>["db"];
