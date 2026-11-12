import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type Database, type DatabaseInstance, schema } from "@grid/db";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import type { MachineProvisioner, ManagedMachineSpec } from "./provision";
import * as service from "./service";

const SECRET = "test-secret-that-is-at-least-32-characters";
const config = createConfig(parseEnv({ NODE_ENV: "test", JWT_SECRET: SECRET }));

const workspaceId = crypto.randomUUID();
const userId = crypto.randomUUID();
const otherId = crypto.randomUUID();

let instance: DatabaseInstance;
let db: Database;
const started: ManagedMachineSpec[] = [];

const provisioner: MachineProvisioner = {
	available: async () => ({ available: true, reason: null }),
	create: async (spec) => {
		started.push(spec);
	},
	remove: async () => {},
};

function actor(role: schema.WorkspaceRole = "member", id = userId): service.MachinesActor {
	return {
		userId: id,
		access: {
			role,
			customRole: null,
			workspace: { id: workspaceId, settings: {} } as schema.WorkspaceRecord,
		},
	};
}

beforeAll(async () => {
	instance = createDatabase(":memory:");
	await instance.ready;
	await instance.migrate();
	db = instance.db;
	await db.insert(schema.users).values([
		{ id: userId, email: "ada@grid.test", username: "ada" },
		{ id: otherId, email: "bo@grid.test", username: "bo" },
	]);
	await db.insert(schema.workspaces).values({ id: workspaceId, slug: "ada", name: "Ada" });
	await db.insert(schema.workspaceMembers).values([
		{ workspaceId, userId, role: "member" },
		{ workspaceId, userId: otherId, role: "member" },
	]);
});

afterAll(async () => {
	await instance.close();
});

describe("machine enrollment", () => {
	it("gives a teammate one team container, then lets a laptop enroll beside it", async () => {
		const managed = await service.create(db, config, provisioner, actor(), {
			name: "Ada's server",
			kind: "managed",
		});
		expect(started).toHaveLength(1);
		expect(started[0]?.enrollmentCode).toBe(managed.enrollment.code);
		expect(started[0]?.id).toBe(managed.machine.id);
		expect(managed.machine.kind).toBe("managed");
		expect(managed.machine.mine).toBe(true);

		await expect(
			service.create(db, config, provisioner, actor(), {
				name: "Another",
				kind: "managed",
			}),
		).rejects.toThrow("already has a machine");
		expect(started).toHaveLength(1);

		await expect(
			service.create(db, config, provisioner, actor("member"), {
				name: "Bo's server",
				kind: "managed",
				ownerId: otherId,
			}),
		).rejects.toThrow("someone else");

		const brought = await service.create(db, config, provisioner, actor(), {
			name: "Laptop",
			kind: "byom",
		});
		const enrolled = await service.enroll(db, {
			code: brought.enrollment.code,
			name: "Ada's laptop",
			address: "http://100.64.0.8:4100",
		});
		expect(enrolled.secret.startsWith("gms_")).toBe(true);
		expect(enrolled.machine.workspaceId).toBe(workspaceId);

		await expect(service.enroll(db, { code: brought.enrollment.code })).rejects.toThrow(
			/wrong or has expired/,
		);

		const machine = await service.machineForToken(
			db,
			`Machine ${enrolled.machine.id}.${enrolled.secret}`,
		);
		expect(machine?.name).toBe("Ada's laptop");
		expect(await service.machineForToken(db, `Machine ${enrolled.machine.id}.nope`)).toBeNull();

		await service.heartbeat(db, machine!, { address: "http://100.64.0.8:4100" });
		const fleet = await service.fleet(db);
		expect(fleet).toContainEqual(
			expect.objectContaining({
				id: enrolled.machine.id,
				workspaceId,
				kind: "byom",
				address: "http://100.64.0.8:4100",
				status: "online",
			}),
		);
	});

	it("refuses a viewer", async () => {
		await expect(
			service.create(db, config, provisioner, actor("viewer"), { name: "Nope", kind: "byom" }),
		).rejects.toThrow("Viewers");
	});
});
