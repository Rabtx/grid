import { asc, eq, like, or, sql } from "drizzle-orm";

import type { Database } from "./client";
import * as schema from "./schema";

/** First path segments the console owns; a workspace slug can never be one of them. */
export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([
	"login",
	"logout",
	"setup",
	"invite",
	"settings",
	"board",
	"chat",
	"files",
	"notes",
	"terminal",
	"api",
	"uploads",
	"runner",
	"dev",
	"new",
	"workspaces",
	"admin",
]);

/** The slug a name turns into, before uniqueness: the same rule the migration backfill used. */
export function workspaceSlugBase(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50)
		.replace(/-+$/, "");
	return slug.length < 2 || RESERVED_WORKSPACE_SLUGS.has(slug) ? `${slug || "my"}-workspace` : slug;
}

/** `base`, or `base-2`, `base-3`… — whichever is free. */
export async function freeWorkspaceSlug(db: Database, base: string): Promise<string> {
	const taken = new Set(
		(
			await db
				.select({ slug: schema.workspaces.slug })
				.from(schema.workspaces)
				.where(or(eq(schema.workspaces.slug, base), like(schema.workspaces.slug, `${base}-%`)))
		).map((row) => row.slug),
	);
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n += 1;
	return `${base}-${n}`;
}

/**
 * The workspace a request without one means: the oldest the user owns, else the oldest they
 * joined. Null when they belong to none.
 */
export async function defaultWorkspaceOf(
	db: Database,
	userId: string,
): Promise<{ workspace: schema.WorkspaceRecord; role: schema.WorkspaceRole } | null> {
	const [row] = await db
		.select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
		.from(schema.workspaceMembers)
		.innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
		.where(eq(schema.workspaceMembers.userId, userId))
		.orderBy(
			sql`${schema.workspaceMembers.role} <> 'owner'`,
			asc(schema.workspaceMembers.createdAt),
		)
		.limit(1);
	return row ?? null;
}

/** A workspace of one, owned by the user: what everyone starts with. */
export async function createPersonalWorkspace(
	db: Database,
	user: { id: string; username: string; displayName?: string | null },
): Promise<schema.WorkspaceRecord> {
	const slug = await freeWorkspaceSlug(db, workspaceSlugBase(user.username));
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.insert(schema.workspaces)
			.values({ slug, name: user.displayName?.trim() || user.username })
			.returning();
		if (!workspace) throw new Error("Workspace insert did not return a record");
		await tx
			.insert(schema.workspaceMembers)
			.values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
		return workspace;
	});
}
