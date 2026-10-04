import { RESERVED_WORKSPACE_SLUGS } from "@grid/db/workspaces";
import * as z from "zod";

export const workspaceSlugSchema = z
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
	.object({ slug: workspaceSlugSchema, name: z.string().trim().min(1).max(120), icon, color })
	.strict();

const agentId = z.string().regex(/^[a-z0-9-]{1,40}$/, "Use an agent id");
const rule = z.enum(["allow", "ask", "never"]);
const permissions = z
	.object({
		startAgents: z.boolean(),
		approveCommands: z.boolean(),
		mergePulls: z.boolean(),
		production: z.boolean(),
		machines: z.boolean(),
		integrations: z.boolean(),
		invite: z.boolean(),
	})
	.partial()
	.strict();
const customRoleId = z.string().regex(/^[a-z0-9-]{1,64}$/, "Use a role id");

/** A change to what applies to everyone in the workspace; each field is optional. */
export const workspaceSettingsSchema = z
	.object({
		defaultBranch: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.regex(/^(?!.*\.\.)(?!-)[\w./-]+$/, "Use a branch name")
			.optional(),
		defaultAgent: agentId.optional(),
		weekStartsOn: z.enum(["monday", "sunday", "saturday"]).optional(),
		logRetentionDays: z.union([z.literal(0), z.number().int().min(7).max(3650)]).optional(),
		agentAccess: z.record(agentId, z.enum(["everyone", "admins"])).optional(),
		agentPolicy: z
			.object({
				rules: z
					.object({
						read: rule,
						edit: rule,
						commands: rule,
						packages: rule,
						network: rule,
						push: rule,
					})
					.partial()
					.strict()
					.optional(),
				newBranch: z.boolean().optional(),
				showCommands: z.boolean().optional(),
			})
			.strict()
			.optional(),
		rolePermissions: z
			.object({ admin: permissions, member: permissions, viewer: permissions })
			.partial()
			.strict()
			.optional(),
		customRoles: z
			.array(
				z
					.object({
						id: customRoleId,
						name: z.string().trim().min(1).max(40),
						description: z.string().trim().max(120).optional(),
						permissions,
					})
					.strict(),
			)
			.max(20)
			.refine(
				(roles) => new Set(roles.map((role) => role.id)).size === roles.length,
				"Each role needs its own id",
			)
			.optional(),
		finance: z
			.object({
				currency: z
					.string()
					.regex(/^[A-Z]{3}$/, "Use a currency code")
					.optional(),
				cash: z.number().min(0).max(1e12).nullable().optional(),
				costs: z
					.array(
						z
							.object({
								label: z.string().trim().min(1).max(40),
								monthly: z.number().min(0).max(1e10),
							})
							.strict(),
					)
					.max(20)
					.optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const updateWorkspaceSchema = z
	.object({
		slug: workspaceSlugSchema.optional(),
		name: z.string().trim().min(1).max(120).optional(),
		icon,
		color,
		settings: workspaceSettingsSchema.optional(),
	})
	.strict()
	.refine((input) => Object.keys(input).length > 0, "At least one workspace field is required");

export const updateMemberSchema = z
	.object({
		role: z.enum(["owner", "admin", "member", "viewer"]),
		/** A role the workspace made; its holder ranks as a member. */
		customRole: customRoleId.nullable().optional(),
	})
	.strict();

export const createInviteSchema = z
	.object({
		email: z.email().trim().toLowerCase().max(320).optional(),
		role: z.enum(["admin", "member", "viewer"]).default("member"),
		customRole: customRoleId.nullable().optional(),
	})
	.strict();

/** Invite tokens are 32 URL-safe characters. */
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, "Invalid invite token");

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
