import { z } from "zod";

/** The machine a runner runs on: a stable id it keeps in its own data, and a name to show. */
export const machineSchema = z
	.object({
		id: z.string().trim().min(8).max(64),
		name: z.string().trim().max(200).optional(),
	})
	.strict();

const threadSchema = z
	.object({
		id: z.string().trim().min(1).max(120),
		workspaceId: z.uuid(),
		project: z.string().trim().min(1).max(120),
		ownerId: z.string().max(120).nullable(),
		provider: z.string().trim().min(1).max(64),
		title: z.string().max(10_000),
		model: z.string().max(200).nullable().optional(),
		mode: z.string().max(64).nullable().optional(),
		effort: z.string().max(32).nullable().optional(),
		createdAt: z.iso.datetime({ offset: true }),
		updatedAt: z.iso.datetime({ offset: true }),
		/** Events after what the server last confirmed, in order. */
		events: z
			.array(z.object({ seq: z.number().int().min(1), data: z.unknown() }).strict())
			.max(2000),
	})
	.strict();

/** One round of a runner's sync: threads that changed, with their new events, and deletions. */
export const syncSchema = z
	.object({
		machine: machineSchema,
		threads: z.array(threadSchema).max(200),
		deleted: z.array(z.string().trim().min(1).max(120)).max(500).default([]),
	})
	.strict();

/** One attached file, sent by the machine holding its thread. 10 MB on the runner, as base64. */
export const attachmentSchema = z
	.object({
		machine: machineSchema,
		name: z.string().min(1).max(500),
		mimeType: z.string().min(1).max(200),
		size: z
			.number()
			.int()
			.min(0)
			.max(10 * 1024 * 1024),
		data: z.base64().max(14 * 1024 * 1024),
	})
	.strict();

export const claimSchema = z.object({ machine: machineSchema }).strict();

export type SyncInput = z.infer<typeof syncSchema>;
export type SyncThread = SyncInput["threads"][number];
export type Machine = z.infer<typeof machineSchema>;
