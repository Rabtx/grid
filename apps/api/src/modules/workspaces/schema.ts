import { RESERVED_WORKSPACE_SLUGS } from "@grid/db/workspaces";
import * as z from "zod";

const slug = z
	.string()
	.trim()
	.toLowerCase()
	.min(2)
	.max(64)
	.regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes")
	.refine((value) => !RESERVED_WORKSPACE_SLUGS.has(value), "That name is reserved");

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

export const createWorkspaceSchema = z
	.object({ slug, name: z.string().trim().min(1).max(120), icon, color })
	.strict();

export const updateWorkspaceSchema = z
	.object({
		slug: slug.optional(),
		name: z.string().trim().min(1).max(120).optional(),
		icon,
		color,
	})
	.strict()
	.refine((input) => Object.keys(input).length > 0, "At least one workspace field is required");

export const updateMemberSchema = z.object({ role: z.enum(["owner", "admin", "member"]) }).strict();

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
