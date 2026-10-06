import { createDatabase } from "./client";

/** Apply pending migrations: `bun run --filter @grid/db migrate`, or from the launcher. */
const url = process.env.DATABASE_URL;
const { close, kind, migrate } = createDatabase(url, { max: 1 });
try {
	console.log(`[db] Applying migrations to ${kind} (${url ?? "local data dir"})…`);
	await migrate();
} finally {
	await close();
}
