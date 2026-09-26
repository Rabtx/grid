import { migrate } from "drizzle-orm/bun-sql/migrator";

import { createDatabase } from "./client";

/** Apply pending migrations: `bun run --filter @grid/db migrate`, or from the launcher. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to run migrations");

const { db, close } = createDatabase(url, { max: 1 });
try {
	await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
} finally {
	await close();
}
