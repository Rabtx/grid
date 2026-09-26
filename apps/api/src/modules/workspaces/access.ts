import { type Database, schema } from "@grid/db";
import { createPersonalWorkspace, defaultWorkspaceOf } from "@grid/db/workspaces";
import { and, eq } from "drizzle-orm";

import { forbidden, notFound } from "../../http/errors";

export type WorkspaceRole = schema.WorkspaceRole;
export type WorkspaceAccess = { workspace: schema.WorkspaceRecord; role: WorkspaceRole };

/** Who is asking, and in which workspace: a slug from the URL, or null for their default one. */
export type WorkspaceScope = { userId: string; workspace: string | null };

async function membership(db: Database, userId: string, slug: string) {
	const [row] = await db
		.select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
		.from(schema.workspaces)
		.innerJoin(
			schema.workspaceMembers,
			and(
				eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
				eq(schema.workspaceMembers.userId, userId),
			),
		)
		.where(eq(schema.workspaces.slug, slug))
		.limit(1);
	return row ?? null;
}

/** The user's default workspace, made on first use for someone who has none yet. */
async function defaultAccess(db: Database, userId: string): Promise<WorkspaceAccess> {
	const current = await defaultWorkspaceOf(db, userId);
	if (current) return current;
	const [user] = await db
		.select({ username: schema.users.username, displayName: schema.userProfiles.displayName })
		.from(schema.users)
		.leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
		.where(eq(schema.users.id, userId))
		.limit(1);
	if (!user) throw notFound("User not found");
	return {
		workspace: await createPersonalWorkspace(db, { id: userId, ...user }),
		role: "owner",
	};
}

/**
 * The workspace a request acts in, and the user's role there. A workspace they do not belong to
 * answers exactly like one that does not exist.
 */
export async function workspaceAccess(
	db: Database,
	scope: WorkspaceScope,
): Promise<WorkspaceAccess> {
	if (scope.workspace === null) return defaultAccess(db, scope.userId);
	const access = await membership(db, scope.userId, scope.workspace);
	if (!access) throw notFound(`Workspace "${scope.workspace}" not found`);
	return access;
}

const RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

/** Throws unless the role is at least `minimum`. */
export function requireRole(access: WorkspaceAccess, minimum: WorkspaceRole): void {
	if (RANK[access.role] < RANK[minimum]) throw forbidden(`Only a workspace ${minimum} can do this`);
}

export const outranks = (a: WorkspaceRole, b: WorkspaceRole) => RANK[a] >= RANK[b];
