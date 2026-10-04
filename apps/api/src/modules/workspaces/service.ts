import type { Database, schema } from "@grid/db";

import { badRequest, conflict, forbidden, notFound } from "../../http/errors";
import {
	outranks,
	requireRole,
	type WorkspaceAccess,
	workspaceAccess,
	type WorkspaceScope,
} from "./access";
import * as q from "./queries";
import type { CreateWorkspaceInput, UpdateMemberInput, UpdateWorkspaceInput } from "./schema";

const workspaceView = (
	w: schema.WorkspaceRecord,
	role: schema.WorkspaceRole,
	customRole: string | null = null,
) => ({
	/** Stable across renames: what other services (the runner) key a workspace's data by. */
	id: w.id,
	slug: w.slug,
	name: w.name,
	icon: w.icon,
	color: w.color,
	logoUrl: w.logoUrl,
	settings: w.settings,
	role,
	/** Your custom role there, when you hold one (Settings → Roles). */
	customRole,
	createdAt: w.createdAt.toISOString(),
	updatedAt: w.updatedAt.toISOString(),
});
const accessView = (access: WorkspaceAccess) =>
	workspaceView(access.workspace, access.role, access.customRole ?? null);

/** Yours, each with your role; `isDefault` marks the one requests without a workspace act in. */
export async function listWorkspaces(db: Database, userId: string) {
	// Resolving the default first makes a personal workspace for someone who has none yet.
	const fallback = await workspaceAccess(db, { userId, workspace: null });
	const rows = await q.listForUser(db, userId);
	return rows.map((row) => ({
		...workspaceView(row.workspace, row.role, row.customRole),
		isDefault: row.workspace.id === fallback.workspace.id,
	}));
}

export async function createWorkspace(db: Database, userId: string, input: CreateWorkspaceInput) {
	if (await q.slugTaken(db, input.slug)) throw conflict(`Workspace "${input.slug}" already exists`);
	const workspace = await q.createWorkspace(db, userId, {
		slug: input.slug,
		name: input.name,
		icon: input.icon ?? null,
		color: input.color ?? null,
	});
	return workspaceView(workspace, "owner");
}

export async function getWorkspace(db: Database, scope: WorkspaceScope) {
	return accessView(await workspaceAccess(db, scope));
}

/** Admins change how it looks; only an owner renames the slug, since every link uses it. */
export async function updateWorkspace(
	db: Database,
	scope: WorkspaceScope,
	input: UpdateWorkspaceInput,
) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, input.slug !== undefined ? "owner" : "admin");
	if (input.slug && input.slug !== access.workspace.slug && (await q.slugTaken(db, input.slug)))
		throw conflict(`Workspace "${input.slug}" already exists`);
	// Settings merge into what is there: changing the default branch keeps who may start agents.
	const { settings, ...rest } = input;
	const updated = await q.updateWorkspace(db, access.workspace.id, {
		...rest,
		...(settings
			? {
					settings: {
						...access.workspace.settings,
						...settings,
						...(settings.agentAccess
							? {
									agentAccess: {
										...access.workspace.settings.agentAccess,
										...settings.agentAccess,
									},
								}
							: {}),
						...(settings.agentPolicy
							? {
									agentPolicy: {
										...access.workspace.settings.agentPolicy,
										...settings.agentPolicy,
										rules: {
											...access.workspace.settings.agentPolicy?.rules,
											...settings.agentPolicy.rules,
										},
									},
								}
							: {}),
						...(settings.finance
							? { finance: { ...access.workspace.settings.finance, ...settings.finance } }
							: {}),
						...(settings.rolePermissions
							? {
									rolePermissions: mergeRolePermissions(
										access.workspace.settings.rolePermissions,
										settings.rolePermissions,
									),
								}
							: {}),
					},
				}
			: {}),
	});
	if (!updated) throw notFound(`Workspace "${access.workspace.slug}" not found`);
	if (settings?.customRoles)
		await q.dropGoneCustomRoles(
			db,
			access.workspace.id,
			settings.customRoles.map((role) => role.id),
		);
	return workspaceView(updated, access.role, access.customRole ?? null);
}

/** Each role's changed permissions over what it had: switching one keeps the others. */
function mergeRolePermissions(
	current: schema.WorkspaceSettings["rolePermissions"],
	change: NonNullable<schema.WorkspaceSettings["rolePermissions"]>,
): schema.WorkspaceSettings["rolePermissions"] {
	const merged = { ...current };
	for (const role of ["admin", "member", "viewer"] as const) {
		if (change[role]) merged[role] = { ...current?.[role], ...change[role] };
	}
	return merged;
}

/** A new logo (a path on this API), set by an admin. */
export async function updateLogo(db: Database, scope: WorkspaceScope, logoUrl: string | null) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "admin");
	const updated = await q.updateWorkspace(db, access.workspace.id, { logoUrl });
	if (!updated) throw notFound(`Workspace "${access.workspace.slug}" not found`);
	return workspaceView(updated, access.role, access.customRole ?? null);
}

/** Deletes the workspace with all its projects, tasks and notes. Owners only. */
export async function deleteWorkspace(db: Database, scope: WorkspaceScope) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "owner");
	await q.deleteWorkspace(db, access.workspace.id);
}

export async function listMembers(db: Database, scope: WorkspaceScope) {
	const access = await workspaceAccess(db, scope);
	return (await q.listMembers(db, access.workspace.id)).map((m) => ({
		...m,
		joinedAt: m.joinedAt.toISOString(),
	}));
}

async function requireMember(db: Database, workspaceId: string, userId: string) {
	const member = await q.findMember(db, workspaceId, userId);
	if (!member) throw notFound("Member not found");
	return member;
}

async function keepAnOwner(db: Database, workspaceId: string, member: { role: string }) {
	if (member.role === "owner" && (await q.countOwners(db, workspaceId)) <= 1)
		throw badRequest("A workspace needs at least one owner");
}

/**
 * Admins move people between viewer, member, a custom role and admin; making, or unmaking, an
 * owner takes an owner. A custom role ranks as a member.
 */
export async function updateMember(
	db: Database,
	scope: WorkspaceScope,
	userId: string,
	input: UpdateMemberInput,
) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "admin");
	const member = await requireMember(db, access.workspace.id, userId);
	if (!outranks(access.role, member.role) || !outranks(access.role, input.role))
		throw forbidden(`Only a workspace owner can do this`);
	if (input.role !== "owner") await keepAnOwner(db, access.workspace.id, member);
	const customRole = input.customRole ?? null;
	if (customRole && !access.workspace.settings.customRoles?.some((role) => role.id === customRole))
		throw badRequest("That role is not in this workspace");
	await q.setRole(db, access.workspace.id, userId, customRole ? "member" : input.role, customRole);
	return (await listMembers(db, scope)).find((m) => m.userId === userId);
}

/** Anyone can leave; admins remove members and admins, owners remove anyone. */
export async function removeMember(db: Database, scope: WorkspaceScope, userId: string) {
	const access = await workspaceAccess(db, scope);
	const member = await requireMember(db, access.workspace.id, userId);
	if (userId !== scope.userId) {
		requireRole(access, "admin");
		if (!outranks(access.role, member.role)) throw forbidden(`Only a workspace owner can do this`);
	}
	await keepAnOwner(db, access.workspace.id, member);
	await q.removeMember(db, access.workspace.id, userId);
}
