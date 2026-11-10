import { type Database, schema } from "@grid/db";
import { mayDo } from "@grid/db/roles";
import { and, asc, count, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";

import type { AppConfig } from "../../config/config";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../http/errors";
import type { WorkspaceAccess } from "../workspaces/access";
import {
	hashToken,
	machineAuthorization,
	newEnrollmentCode,
	newMachineSecret,
	sameSecret,
} from "./crypto";
import { type MachineProvisioner, managedAddress, portFree } from "./provision";
import type { enrollMachineSchema, machineHeartbeatSchema } from "./schema";
import type * as z from "zod";

const ENROLLMENT_TTL_MS = 15 * 60 * 1000;
const ONLINE_WINDOW_MS = 90_000;

export type MachineStatus = "pending" | "online" | "offline" | "disabled";
export type MachineKind = "managed" | "byom";

/** The person asking and their role in the workspace the machines belong to. */
export type MachinesActor = { userId: string; access: WorkspaceAccess };

export type MachineView = {
	id: string;
	name: string;
	kind: MachineKind;
	status: MachineStatus;
	ownerId: string | null;
	ownerName: string | null;
	/** Whether the caller brought this machine and may manage it as its owner. */
	mine: boolean;
	canManage: boolean;
	/** The address only for people who may manage it: it can carry a private tailnet name. */
	address: string | null;
	platform: schema.MachinePlatform;
	lastSeenAt: string | null;
	createdAt: string;
};

export type EnrollmentView = { code: string; expiresAt: string };

type MachineRecord = typeof schema.machines.$inferSelect;

function effectiveStatus(machine: MachineRecord, now: number): MachineStatus {
	if (machine.status === "disabled") return "disabled";
	if (machine.lastSeenAt && now - machine.lastSeenAt.getTime() < ONLINE_WINDOW_MS) return "online";
	return machine.status === "online" ? "offline" : machine.status;
}

function mayManage(actor: MachinesActor, machine: MachineRecord): boolean {
	if (machine.ownerId === actor.userId) return true;
	return mayDo(
		"machines",
		actor.access.role,
		actor.access.customRole,
		actor.access.workspace.settings,
	);
}

function view(
	actor: MachinesActor,
	machine: MachineRecord,
	ownerName: string | null,
	now: number,
): MachineView {
	const canManage = mayManage(actor, machine);
	return {
		id: machine.id,
		name: machine.name,
		kind: machine.kind,
		status: effectiveStatus(machine, now),
		ownerId: machine.ownerId,
		ownerName,
		mine: machine.ownerId === actor.userId,
		canManage,
		address: canManage ? machine.address : null,
		platform: machine.platform,
		lastSeenAt: machine.lastSeenAt?.toISOString() ?? null,
		createdAt: machine.createdAt.toISOString(),
	};
}

/** The workspace's machines and which project runs on which; a project not named runs on this server. */
export async function list(
	db: Database,
	actor: MachinesActor,
): Promise<{ machines: MachineView[]; placements: Record<string, string> }> {
	const workspaceId = actor.access.workspace.id;
	const [rows, placed] = await Promise.all([
		db
			.select({
				machine: schema.machines,
				displayName: schema.userProfiles.displayName,
				username: schema.users.username,
			})
			.from(schema.machines)
			.leftJoin(schema.users, eq(schema.users.id, schema.machines.ownerId))
			.leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
			.where(eq(schema.machines.workspaceId, workspaceId))
			.orderBy(asc(schema.machines.createdAt)),
		db
			.select({
				project: schema.machinePlacements.project,
				machineId: schema.machinePlacements.machineId,
			})
			.from(schema.machinePlacements)
			.where(eq(schema.machinePlacements.workspaceId, workspaceId)),
	]);
	const now = Date.now();
	return {
		machines: rows.map((row) =>
			view(actor, row.machine, row.displayName ?? row.username ?? null, now),
		),
		placements: Object.fromEntries(
			placed
				.filter((row): row is { project: string; machineId: string } => row.machineId !== null)
				.map((row) => [row.project, row.machineId]),
		),
	};
}

/** Replaces any unused code for a machine with a fresh one; only its hash is kept. */
async function issueEnrollment(
	db: Database,
	machine: MachineRecord,
	userId: string,
): Promise<EnrollmentView> {
	await db
		.delete(schema.machineEnrollments)
		.where(eq(schema.machineEnrollments.machineId, machine.id));
	const code = newEnrollmentCode();
	const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS);
	await db.insert(schema.machineEnrollments).values({
		workspaceId: machine.workspaceId,
		machineId: machine.id,
		createdBy: userId,
		tokenHash: hashToken(code),
		expiresAt,
	});
	return { code, expiresAt: expiresAt.toISOString() };
}

/** A port on the host no other managed machine or process holds. */
async function allocatePort(db: Database, config: AppConfig): Promise<number> {
	const rows = await db
		.select({ address: schema.machines.address })
		.from(schema.machines)
		.where(eq(schema.machines.kind, "managed"));
	const used = new Set<number>();
	for (const row of rows) {
		if (!row.address) continue;
		try {
			const port = Number(new URL(row.address).port);
			if (Number.isInteger(port) && port > 0) used.add(port);
		} catch {
			// An address someone set by hand that is not a URL: it holds no port here.
		}
	}
	for (let port = config.machines.portMin; port <= config.machines.portMax; port++) {
		if (!used.has(port) && (await portFree(port, config.machines.addressHost))) return port;
	}
	throw conflict(
		`No free machine port between ${config.machines.portMin} and ${config.machines.portMax}. Remove a machine or widen MACHINES_PORT_MIN/MAX.`,
	);
}

/**
 * Adds a machine. A BYOM machine waits for its teammate's runner with a one-time code; a managed
 * one is started now in its own container, and its code is handed to that container's environment.
 */
export async function create(
	db: Database,
	config: AppConfig,
	provisioner: MachineProvisioner,
	actor: MachinesActor,
	input: { name: string; kind: MachineKind; ownerId?: string },
): Promise<{ machine: MachineView; enrollment: EnrollmentView }> {
	const workspaceId = actor.access.workspace.id;
	const ownerId = input.kind === "managed" ? (input.ownerId ?? actor.userId) : actor.userId;
	if (input.kind === "managed") {
		if (actor.access.role === "viewer") throw forbidden("Viewers can't provision machines");
		if (
			ownerId !== actor.userId &&
			!mayDo(
				"machines",
				actor.access.role,
				actor.access.customRole,
				actor.access.workspace.settings,
			)
		)
			throw forbidden("Your role in this workspace can't provision a machine for someone else");
		if (ownerId !== actor.userId) {
			const [member] = await db
				.select({ userId: schema.workspaceMembers.userId })
				.from(schema.workspaceMembers)
				.where(
					and(
						eq(schema.workspaceMembers.workspaceId, workspaceId),
						eq(schema.workspaceMembers.userId, ownerId),
					),
				)
				.limit(1);
			if (!member) throw badRequest("That person is not in this workspace");
		}
		const availability = await provisioner.available();
		if (!availability.available)
			throw badRequest(availability.reason ?? "Team-managed machines are not available");
		const [existing] = await db
			.select({ total: count() })
			.from(schema.machines)
			.where(
				and(eq(schema.machines.workspaceId, workspaceId), eq(schema.machines.kind, "managed")),
			);
		if ((existing?.total ?? 0) >= config.machines.maxPerWorkspace)
			throw conflict(
				`This workspace already has ${config.machines.maxPerWorkspace} managed machines`,
			);
		const [held] = await db
			.select({ id: schema.machines.id })
			.from(schema.machines)
			.where(
				and(
					eq(schema.machines.workspaceId, workspaceId),
					eq(schema.machines.kind, "managed"),
					eq(schema.machines.ownerId, ownerId),
				),
			)
			.limit(1);
		if (held) throw conflict("That teammate already has a machine on this server");
		const port = await allocatePort(db, config);
		const [machine] = await db
			.insert(schema.machines)
			.values({
				workspaceId,
				ownerId,
				name: input.name,
				kind: "managed",
				status: "pending",
			})
			.returning();
		if (!machine) throw new Error("The machine could not be recorded");
		const enrollment = await issueEnrollment(db, machine, actor.userId);
		try {
			await provisioner.create({
				id: machine.id,
				workspaceId,
				name: input.name,
				port,
				enrollmentCode: enrollment.code,
			});
		} catch (cause) {
			await db.delete(schema.machines).where(eq(schema.machines.id, machine.id));
			throw badRequest(cause instanceof Error ? cause.message : "The machine could not be started");
		}
		const [started] = await db
			.update(schema.machines)
			.set({ address: managedAddress(config, port), updatedAt: new Date() })
			.where(eq(schema.machines.id, machine.id))
			.returning();
		return {
			machine: view(actor, started ?? machine, null, Date.now()),
			enrollment,
		};
	}

	if (actor.access.role === "viewer") throw forbidden("Viewers can't connect machines");
	const [machine] = await db
		.insert(schema.machines)
		.values({
			workspaceId,
			ownerId: actor.userId,
			name: input.name,
			kind: "byom",
			status: "pending",
		})
		.returning();
	if (!machine) throw new Error("The machine could not be recorded");
	const enrollment = await issueEnrollment(db, machine, actor.userId);
	return { machine: view(actor, machine, null, Date.now()), enrollment };
}

/** A fresh one-time code for a machine that has not connected (or has lost its secret). */
export async function reissue(
	db: Database,
	actor: MachinesActor,
	id: string,
): Promise<{ machine: MachineView; enrollment: EnrollmentView }> {
	const machine = await mustFind(db, actor.access.workspace.id, id);
	if (!mayManage(actor, machine))
		throw forbidden("Only its owner or a machine manager can reconnect it");
	const enrollment = await issueEnrollment(db, machine, actor.userId);
	return { machine: view(actor, machine, null, Date.now()), enrollment };
}

export async function rename(
	db: Database,
	actor: MachinesActor,
	id: string,
	name: string,
): Promise<MachineView> {
	const machine = await mustFind(db, actor.access.workspace.id, id);
	if (!mayManage(actor, machine))
		throw forbidden("Only its owner or a machine manager can rename it");
	const [updated] = await db
		.update(schema.machines)
		.set({ name, updatedAt: new Date() })
		.where(eq(schema.machines.id, machine.id))
		.returning();
	return view(actor, updated ?? machine, null, Date.now());
}

export async function remove(
	db: Database,
	provisioner: MachineProvisioner,
	actor: MachinesActor,
	id: string,
): Promise<void> {
	const machine = await mustFind(db, actor.access.workspace.id, id);
	if (!mayManage(actor, machine))
		throw forbidden("Only its owner or a machine manager can remove it");
	if (machine.kind === "managed") await provisioner.remove(machine.id);
	await db.delete(schema.machines).where(eq(schema.machines.id, machine.id));
}

async function mustFind(db: Database, workspaceId: string, id: string): Promise<MachineRecord> {
	const [machine] = await db
		.select()
		.from(schema.machines)
		.where(and(eq(schema.machines.id, id), eq(schema.machines.workspaceId, workspaceId)))
		.limit(1);
	if (!machine) throw notFound("That machine is not in this workspace");
	return machine;
}

/**
 * Redeems a one-time code. The code row is consumed in the same statement that reads it, so two
 * runners racing with one code cannot both enroll; the loser sees an expired code.
 */
export async function enroll(
	db: Database,
	input: z.infer<typeof enrollMachineSchema>,
): Promise<{ machine: { id: string; name: string; workspaceId: string }; secret: string }> {
	const [enrollment] = await db
		.update(schema.machineEnrollments)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(schema.machineEnrollments.tokenHash, hashToken(input.code)),
				isNull(schema.machineEnrollments.usedAt),
				gt(schema.machineEnrollments.expiresAt, new Date()),
			),
		)
		.returning();
	if (!enrollment) throw unauthorized("That enrollment code is wrong or has expired");
	const [machine] = await db
		.select()
		.from(schema.machines)
		.where(eq(schema.machines.id, enrollment.machineId))
		.limit(1);
	if (!machine) throw unauthorized("That enrollment code is wrong or has expired");
	if (machine.status === "disabled") throw forbidden("That machine is disabled");
	const secret = newMachineSecret();
	const [updated] = await db
		.update(schema.machines)
		.set({
			...(input.name ? { name: input.name } : {}),
			...(input.address ? { address: input.address } : {}),
			...(input.platform ? { platform: { ...machine.platform, ...input.platform } } : {}),
			secretHash: hashToken(secret),
			status: "online",
			lastSeenAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(schema.machines.id, machine.id))
		.returning();
	const enrolled = updated ?? machine;
	return {
		machine: { id: enrolled.id, name: enrolled.name, workspaceId: enrolled.workspaceId },
		secret,
	};
}

/** The machine a heartbeat token names, when the secret is its own. Null otherwise. */
export async function machineForToken(
	db: Database,
	header: string | undefined,
): Promise<MachineRecord | null> {
	const token = machineAuthorization(header);
	if (!token) return null;
	const [machine] = await db
		.select()
		.from(schema.machines)
		.where(eq(schema.machines.id, token.id))
		.limit(1);
	if (!machine?.secretHash || !sameSecret(token.secret, machine.secretHash)) return null;
	return machine;
}

/** A machine saying it is alive; the hosted runner uses this to know whom it may relay to. */
export async function heartbeat(
	db: Database,
	machine: MachineRecord,
	input: z.infer<typeof machineHeartbeatSchema>,
): Promise<{ id: string; name: string; workspaceId: string; status: MachineStatus }> {
	if (machine.status === "disabled") throw forbidden("That machine is disabled");
	const [updated] = await db
		.update(schema.machines)
		.set({
			status: "online",
			lastSeenAt: new Date(),
			updatedAt: new Date(),
			...(machine.kind === "byom" && input.address ? { address: input.address } : {}),
			...(input.platform ? { platform: { ...machine.platform, ...input.platform } } : {}),
		})
		.where(eq(schema.machines.id, machine.id))
		.returning();
	const current = updated ?? machine;
	return {
		id: current.id,
		name: current.name,
		workspaceId: current.workspaceId,
		status: "online",
	};
}

export type FleetTarget = {
	id: string;
	workspaceId: string;
	name: string;
	kind: MachineKind;
	address: string;
	status: MachineStatus;
};

/** Every reachable machine, for the hosted runner that carries console calls to them. */
export async function fleet(db: Database): Promise<FleetTarget[]> {
	const rows = await db
		.select({
			id: schema.machines.id,
			workspaceId: schema.machines.workspaceId,
			name: schema.machines.name,
			kind: schema.machines.kind,
			address: schema.machines.address,
			status: schema.machines.status,
			lastSeenAt: schema.machines.lastSeenAt,
		})
		.from(schema.machines)
		.where(and(ne(schema.machines.status, "disabled"), isNotNull(schema.machines.address)))
		.orderBy(asc(schema.machines.workspaceId), asc(schema.machines.name));
	const now = Date.now();
	return rows
		.filter((row): row is typeof row & { address: string } => row.address !== null)
		.map((row) => ({
			id: row.id,
			workspaceId: row.workspaceId,
			name: row.name,
			kind: row.kind,
			address: row.address,
			status:
				row.lastSeenAt && now - row.lastSeenAt.getTime() < ONLINE_WINDOW_MS
					? "online"
					: row.status === "online"
						? "offline"
						: row.status,
		}));
}

/** Runs a project's agents on a machine; null puts it back on the hosted runner's own machine. */
export async function place(
	db: Database,
	actor: MachinesActor,
	project: string,
	machineId: string | null,
): Promise<void> {
	const workspaceId = actor.access.workspace.id;
	const [found] = await db
		.select({ id: schema.projects.id })
		.from(schema.projects)
		.where(and(eq(schema.projects.workspaceId, workspaceId), eq(schema.projects.slug, project)))
		.limit(1);
	if (!found) throw notFound(`Project "${project}" not found`);
	if (machineId === null) {
		await db
			.delete(schema.machinePlacements)
			.where(
				and(
					eq(schema.machinePlacements.workspaceId, workspaceId),
					eq(schema.machinePlacements.project, project),
				),
			);
		return;
	}
	const machine = await mustFind(db, workspaceId, machineId);
	if (machine.status === "disabled") throw conflict("That machine is disabled");
	await db
		.insert(schema.machinePlacements)
		.values({ workspaceId, project, machineId, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: [schema.machinePlacements.workspaceId, schema.machinePlacements.project],
			set: { machineId, updatedAt: new Date() },
		});
}
