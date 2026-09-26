import { createDatabase } from "./client";
import { issueSetupCode } from "./instance";

/**
 * First start of a Grid: while nobody has signed up, issue a one-time setup code. Prints one line
 * of JSON for the launcher (`{"code": "..."}`, or `{"code": null}` once someone has signed up);
 * the person opening `/setup?code=...` creates the owner account and the first workspace.
 *
 *   bun packages/db/src/setup-code.ts
 */
async function main(): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is required");
	const { db, close } = createDatabase(url, { max: 1 });
	try {
		console.log(JSON.stringify({ code: await issueSetupCode(db) }));
	} finally {
		await close();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
