import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";
import { eq } from "drizzle-orm";

import { createDatabase, type DatabaseInstance } from "./client";
import { hashSecret, issueSetupCode } from "./instance";
import * as schema from "./schema";

describe("@grid/db client (PGlite & Postgres)", () => {
	let instance: DatabaseInstance;

	beforeAll(async () => {
		instance = createDatabase(":memory:", { server: true });
		await instance.ready;
		await instance.migrate();
	});

	afterAll(async () => {
		await instance.close();
	});

	it("initializes an in-memory PGlite database and applies migrations", () => {
		expect(instance.kind).toBe("pglite");
		expect(instance.url).toBeDefined();
		expect(instance.url?.startsWith("postgresql://")).toBe(true);
	});

	it("inserts and selects records via Drizzle schema", async () => {
		const [user] = await instance.db
			.insert(schema.users)
			.values({
				email: "pglite-test@grid.dev",
				username: "pglite-test",
			})
			.returning();

		expect(user).toBeDefined();
		expect(user?.email).toBe("pglite-test@grid.dev");

		const [found] = await instance.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, "pglite-test@grid.dev"));

		expect(found).toBeDefined();
		expect(found?.username).toBe("pglite-test");
	});

	it("issues setup codes on PGlite", async () => {
		// Clean users so issueSetupCode can issue a code
		await instance.db.delete(schema.users);
		const code = await issueSetupCode(instance.db);
		expect(code).toBeString();
		expect(code?.length).toBeGreaterThan(10);

		const [settings] = await instance.db.select().from(schema.instanceSettings);
		expect(settings).toBeDefined();
		expect(settings.setupCodeHash).toBe(hashSecret(code!));
	});

	it("allows external SQL clients to connect via the socket server", async () => {
		expect(instance.url).toBeDefined();
		const client = new SQL(instance.url!, { max: 1 });
		try {
			const res = await client`SELECT 42 as answer`;
			expect(res).toBeDefined();
			expect(res[0]?.answer).toBe(42);
		} finally {
			await client.close();
		}
	});
});
