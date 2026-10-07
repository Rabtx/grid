import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";

import { createDatabase, type DatabaseInstance } from "./client";
import * as schema from "./schema";
import { ensureDefaultWorkspace } from "./workspaces";

describe("a new user's default workspace", () => {
	let instance: DatabaseInstance;
	let n = 0;

	beforeAll(async () => {
		instance = createDatabase(":memory:", { server: true });
		await instance.ready;
		await instance.migrate();
		// Starting PGlite and migrating takes over Bun's 5 second default on a CI runner.
	}, 60_000);
	afterAll(async () => {
		await instance.close();
	});

	async function newUser() {
		const username = `new-${++n}`;
		const [user] = await instance.db
			.insert(schema.users)
			.values({ email: `${username}@grid.test`, username })
			.returning();
		return { id: user?.id ?? "", username };
	}

	const owned = async (userId: string) =>
		instance.db
			.select()
			.from(schema.workspaceMembers)
			.where(eq(schema.workspaceMembers.userId, userId));

	it("is made once when the first page load asks for it several times at once", async () => {
		const user = await newUser();
		const answers = await Promise.all(
			Array.from({ length: 5 }, () => ensureDefaultWorkspace(instance.db, user)),
		);
		expect(await owned(user.id)).toHaveLength(1);
		expect(new Set(answers.map((answer) => answer.workspace.id)).size).toBe(1);
		expect(answers.every((answer) => answer.role === "owner")).toBe(true);
	});

	it("finds the one that exists", async () => {
		const user = await newUser();
		const first = await ensureDefaultWorkspace(instance.db, user);
		const again = await ensureDefaultWorkspace(instance.db, user);
		expect(again.workspace.id).toBe(first.workspace.id);
	});
});
