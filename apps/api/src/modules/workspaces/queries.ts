import { type Database, schema } from "@grid/db";
import { and, asc, eq, isNotNull, notInArray, sql } from "drizzle-orm";

const { workspaces, workspaceMembers, users, userProfiles } = schema;

export const listForUser = (db: Database, userId: string) =>
	db
		.select({
			workspace: workspaces,
			role: workspaceMembers.role,
			customRole: workspaceMembers.customRole,
		})
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
		.where(eq(workspaceMembers.userId, userId))
		.orderBy(asc(workspaces.name));

export async function slugTaken(db: Database, slug: string) {
	const [row] = await db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.slug, slug))
		.limit(1);
	return Boolean(row);
}

export function createWorkspace(
	db: Database,
	ownerId: string,
	input: Pick<schema.WorkspaceRecord, "slug" | "name" | "icon" | "color">,
) {
	return db.transaction(async (tx) => {
		const [workspace] = await tx.insert(workspaces).values(input).returning();
		if (!workspace) throw new Error("Workspace insert did not return a record");
		await tx
			.insert(workspaceMembers)
			.values({ workspaceId: workspace.id, userId: ownerId, role: "owner" });
		return workspace;
	});
}

export async function updateWorkspace(
	db: Database,
	id: string,
	input: Partial<
		Pick<schema.WorkspaceRecord, "slug" | "name" | "icon" | "color" | "logoUrl" | "settings">
	>,
) {
	const [workspace] = await db
		.update(workspaces)
		.set({ ...input, updatedAt: new Date() })
		.where(eq(workspaces.id, id))
		.returning();
	return workspace ?? null;
}

export const deleteWorkspace = (db: Database, id: string) =>
	db.delete(workspaces).where(eq(workspaces.id, id));

export const listMembers = (db: Database, workspaceId: string) =>
	db
		.select({
			userId: users.id,
			username: users.username,
			// Teammates see each other's email in Settings → Members, as they would in any team tool.
			email: users.email,
			displayName: userProfiles.displayName,
			avatarUrl: userProfiles.avatarUrl,
			role: workspaceMembers.role,
			customRole: workspaceMembers.customRole,
			joinedAt: workspaceMembers.createdAt,
		})
		.from(workspaceMembers)
		.innerJoin(users, eq(users.id, workspaceMembers.userId))
		.leftJoin(userProfiles, eq(userProfiles.userId, users.id))
		.where(eq(workspaceMembers.workspaceId, workspaceId))
		.orderBy(asc(workspaceMembers.createdAt));

export async function findMember(db: Database, workspaceId: string, userId: string) {
	const [member] = await db
		.select()
		.from(workspaceMembers)
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
		.limit(1);
	return member ?? null;
}

export async function countOwners(db: Database, workspaceId: string) {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(workspaceMembers)
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
	return Number(row?.count ?? 0);
}

export const setRole = (
	db: Database,
	workspaceId: string,
	userId: string,
	role: schema.WorkspaceRole,
	customRole: string | null = null,
) =>
	db
		.update(workspaceMembers)
		.set({ role, customRole })
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));

export const removeMember = (db: Database, workspaceId: string, userId: string) =>
	db
		.delete(workspaceMembers)
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));

/** People and invites on a custom role the workspace no longer has go back to member. */
export async function dropGoneCustomRoles(db: Database, workspaceId: string, kept: string[]) {
	const gone = (
		column: typeof workspaceMembers.customRole | typeof schema.workspaceInvites.customRole,
	) => (kept.length ? and(isNotNull(column), notInArray(column, kept)) : isNotNull(column));
	await db
		.update(workspaceMembers)
		.set({ customRole: null })
		.where(and(eq(workspaceMembers.workspaceId, workspaceId), gone(workspaceMembers.customRole)));
	await db
		.update(schema.workspaceInvites)
		.set({ customRole: null })
		.where(
			and(
				eq(schema.workspaceInvites.workspaceId, workspaceId),
				gone(schema.workspaceInvites.customRole),
			),
		);
}
