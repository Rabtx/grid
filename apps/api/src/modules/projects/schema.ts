import * as z from "zod";

import { webUrl } from "../../http/validate";

export const TASK_STATUSES = [
	"backlog",
	"ready",
	"in_progress",
	"review",
	"qa",
	"blocked",
	"done",
] as const;

export const TASK_OWNER_KINDS = ["human", "agent"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskOwnerKind = (typeof TASK_OWNER_KINDS)[number];

const slug = z
	.string()
	.trim()
	.toLowerCase()
	.min(2)
	.max(64)
	.regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

// A project's look: an icon id and a colour (a palette name or #rrggbb).
const icon = z
	.string()
	.trim()
	.max(64)
	.regex(/^[a-z0-9:-]+$/, "Use an icon id")
	.nullable()
	.optional();
const color = z
	.string()
	.trim()
	.max(32)
	.regex(/^(#[0-9a-fA-F]{6}|[a-z]+)$/, "Use a palette colour or #rrggbb")
	.nullable()
	.optional();

export const createProjectSchema = z
	.object({
		slug,
		name: z.string().trim().min(1).max(120),
		summary: optionalText(280),
		repoUrl: webUrl(2048).nullable().optional(),
		icon,
		color,
	})
	.strict();

export const updateProjectSchema = z
	.object({
		name: z.string().trim().min(1).max(120).optional(),
		summary: optionalText(280),
		repoUrl: webUrl(2048).nullable().optional(),
		status: z.enum(["active", "archived"]).optional(),
		icon,
		color,
	})
	.strict()
	.refine((input) => Object.keys(input).length > 0, "At least one project field is required");

const owner = z
	.object({
		ownerKind: z.enum(TASK_OWNER_KINDS).nullable().optional(),
		ownerName: optionalText(120),
	})
	.partial();

export const createTaskSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: optionalText(4000),
		status: z.enum(TASK_STATUSES).optional(),
		branch: optionalText(200),
	})
	.extend(owner.shape)
	.strict();

export const updateTaskSchema = z
	.object({
		title: z.string().trim().min(1).max(200).optional(),
		description: optionalText(4000),
		status: z.enum(TASK_STATUSES).optional(),
		branch: optionalText(200),
		position: z.number().int().min(0).max(1_000_000).optional(),
	})
	.extend(owner.shape)
	.strict()
	.refine((input) => Object.keys(input).length > 0, "At least one task field is required");

/** The glyphs a note can wear in the list; the console draws each. */
export const NOTE_ICONS = [
	"note",
	"flag",
	"layers",
	"rules",
	"check",
	"calendar",
	"bolt",
	"code",
	"globe",
	"shield",
] as const;

const noteBody = z.string().trim().min(1).max(20_000);
const noteFlags = {
	pinned: z.boolean().optional(),
	shared: z.boolean().optional(),
	icon: z.enum(NOTE_ICONS).nullable().optional(),
	/** The agents (provider ids) a shared note goes to; null for every agent. */
	agents: z
		.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/, "An agent is named by its id"))
		.max(16)
		.nullable()
		.optional(),
};

export const createNoteSchema = z
	.object({
		body: noteBody,
		source: optionalText(200),
		threadId: optionalText(120),
		...noteFlags,
	})
	.strict();

export const updateNoteSchema = z
	.object({ body: noteBody.optional(), ...noteFlags })
	.strict()
	.refine((input) => Object.keys(input).length > 0, "At least one note field is required");

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
