import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type DatabaseInstance, schema } from "@grid/db";
import { eq } from "drizzle-orm";

import * as service from "./service";

/** Workspace rules against a database of its own (PGlite in memory): nothing shared is touched. */
describe("workspace roles", () => {
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

	async function person(name: string): Promise<string> {
		const [user] = await instance.db
			.insert(schema.users)
			.values({ email: `${name}-${++n}@grid.test`, username: `${name}-${n}` })
			.returning();
		return user?.id ?? "";
	}

	/** A workspace with its owner, a viewer and a custom role called reviewer. */
	async function workspace() {
		const owner = await person("owner");
		const viewer = await person("viewer");
		const slug = `ws-${++n}`;
		const created = await service.createWorkspace(instance.db, owner, { slug, name: "Acme" });
		await instance.db
			.update(schema.workspaces)
			.set({
				settings: {
					customRoles: [{ id: "reviewer", name: "Reviewer", permissions: { startAgents: true } }],
				},
			})
			.where(eq(schema.workspaces.id, created.id));
		await instance.db
			.insert(schema.workspaceMembers)
			.values({ workspaceId: created.id, userId: viewer, role: "viewer" });
		return { owner, viewer, slug };
	}

	it("keeps the last owner from stepping down through a custom role", async () => {
		const { owner, slug } = await workspace();
		const scope = { userId: owner, workspace: slug };
		// Asked as owner, but a custom role makes its holder a member: that would leave no owner.
		await expect(
			service.updateMember(instance.db, scope, owner, { role: "owner", customRole: "reviewer" }),
		).rejects.toThrow("A workspace needs at least one owner");
		const members = await service.listMembers(instance.db, scope);
		expect(members.find((member) => member.userId === owner)?.role).toBe("owner");
	});

	it("refuses a viewer's logo before anything is written", async () => {
		const { owner, viewer, slug } = await workspace();
		await expect(
			service.assertCanSetLogo(instance.db, { userId: viewer, workspace: slug }),
		).rejects.toThrow();
		await service.assertCanSetLogo(instance.db, { userId: owner, workspace: slug });
	});
});
