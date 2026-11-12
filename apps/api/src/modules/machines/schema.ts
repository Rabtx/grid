import * as z from "zod";

/** What a machine says about itself, on enrollment and every heartbeat. */
export const machinePlatformSchema = z
	.object({
		hostname: z.string().trim().max(200).optional(),
		system: z.string().trim().max(120).optional(),
		cpu: z.string().trim().max(200).optional(),
		cores: z.number().int().min(1).max(4096).optional(),
		memoryTotalBytes: z.number().int().min(0).optional(),
		runnerVersion: z.string().trim().max(40).optional(),
		projectsDir: z.string().trim().max(1024).optional(),
	})
	.strict();

const name = z.string().trim().min(1).max(120);

/** A machine a teammate brings (BYOM) or one the team server should provision. */
export const createMachineSchema = z
	.object({
		name,
		kind: z.enum(["byom", "managed"]).default("byom"),
		/** A teammate to provision a team machine for. Absent means the caller. */
		ownerId: z.uuid().optional(),
	})
	.strict();

export const updateMachineSchema = z.object({ name }).strict();

export const placementSchema = z.object({ machineId: z.uuid().nullable() }).strict();

/** A runner redeeming the one-time code the console made for it. */
export const enrollMachineSchema = z
	.object({
		code: z.string().trim().min(16).max(200),
		name: z.string().trim().min(1).max(200).optional(),
		address: z.url().max(2048).optional(),
		platform: machinePlatformSchema.optional(),
	})
	.strict();

/** A machine reporting that it is alive, and what it is. */
export const machineHeartbeatSchema = z
	.object({
		address: z.url().max(2048).optional(),
		platform: machinePlatformSchema.optional(),
	})
	.strict();
