import { type Database, schema } from "@grid/db";
import { hashSecret, randomSecret } from "@grid/db/instance";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import type { AppConfig } from "../../config/config";
import { forbidden, notFound } from "../../http/errors";
import { type EmailSender, sendWorkspaceInvite } from "../email/email";
import { outranks, requireRole, workspaceAccess, type WorkspaceScope } from "./access";
import type { CreateInviteInput } from "./schema";

const { workspaceInvites, workspaceMembers, workspaces } = schema;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InviteRecord = schema.WorkspaceInviteRecord;

export const inviteInvalid = () =>
	notFound({ code: "INVITE_INVALID", message: "The invite is invalid or expired" });
export const emailMismatch = () =>
	forbidden({
		code: "INVITE_EMAIL_MISMATCH",
		message: "This invite is for a different email address",
	});

const inviteUrl = (config: AppConfig, token: string) => `${config.webAppUrl}/invite/${token}`;
const pending = () =>
	and(isNull(workspaceInvites.acceptedAt), gt(workspaceInvites.expiresAt, sql`now()`));
const inviteView = (r: InviteRecord) => ({
	id: r.id,
	email: r.email,
	role: r.role,
	expiresAt: r.expiresAt.toISOString(),
	createdAt: r.createdAt.toISOString(),
});

/**
 * Invites someone, by email (sent to them) or as a link to pass on. The token is in the reply
 * once and stored hashed. Admins invite members and admins; ownership is handed over, not invited.
 */
export async function createInvite(
	deps: { db: Database; send: EmailSender; config: AppConfig },
	scope: WorkspaceScope,
	input: CreateInviteInput,
) {
	const access = await workspaceAccess(deps.db, scope);
	requireRole(access, "admin");
	if (!outranks(access.role, input.role)) throw forbidden("Only a workspace owner can do this");
	const token = randomSecret();
	const [invite] = await deps.db
		.insert(workspaceInvites)
		.values({
			workspaceId: access.workspace.id,
			tokenHash: hashSecret(token),
			email: input.email ?? null,
			role: input.role,
			invitedBy: scope.userId,
			expiresAt: new Date(Date.now() + INVITE_TTL_MS),
		})
		.returning();
	if (!invite) throw new Error("Invite insert did not return a record");
	const url = inviteUrl(deps.config, token);
	if (invite.email) {
		try {
			await sendWorkspaceInvite(deps.send, invite.email, access.workspace.name, url);
		} catch (error) {
			await deps.db.delete(workspaceInvites).where(eq(workspaceInvites.id, invite.id));
			throw error;
		}
	}
	return { ...inviteView(invite), token, url };
}

/** Invites not yet accepted or expired. */
export async function listInvites(db: Database, scope: WorkspaceScope) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "admin");
	const rows = await db
		.select()
		.from(workspaceInvites)
		.where(and(eq(workspaceInvites.workspaceId, access.workspace.id), pending()))
		.orderBy(desc(workspaceInvites.createdAt));
	return rows.map(inviteView);
}

export async function revokeInvite(db: Database, scope: WorkspaceScope, id: string) {
	const access = await workspaceAccess(db, scope);
	requireRole(access, "admin");
	const removed = await db
		.delete(workspaceInvites)
		.where(and(eq(workspaceInvites.id, id), eq(workspaceInvites.workspaceId, access.workspace.id)))
		.returning({ id: workspaceInvites.id });
	if (removed.length === 0) throw notFound("Invite not found");
}

/** A usable invite for this token, or null. */
export async function findPendingInvite(db: Database, token: string) {
	const [row] = await db
		.select({ invite: workspaceInvites, workspace: workspaces })
		.from(workspaceInvites)
		.innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
		.where(and(eq(workspaceInvites.tokenHash, hashSecret(token)), pending()))
		.limit(1);
	return row ?? null;
}

/** What the invite page shows before anyone signs in. */
export async function previewInvite(db: Database, token: string) {
	const row = await findPendingInvite(db, token);
	if (!row) throw inviteInvalid();
	return {
		workspace: {
			slug: row.workspace.slug,
			name: row.workspace.name,
			icon: row.workspace.icon,
			color: row.workspace.color,
		},
		role: row.invite.role,
		email: row.invite.email,
		expiresAt: row.invite.expiresAt.toISOString(),
	};
}

/**
 * Joins the workspace with the invite's role, once. Someone already in it keeps their role.
 * An invite for an email only works for that address.
 */
export async function acceptInvite(
	db: Database,
	token: string,
	user: { id: string; email: string },
) {
	return db.transaction(async (tx) => {
		const [invite] = await tx
			.select()
			.from(workspaceInvites)
			.where(and(eq(workspaceInvites.tokenHash, hashSecret(token)), pending()))
			.for("update")
			.limit(1);
		if (!invite) throw inviteInvalid();
		if (invite.email && invite.email !== user.email.toLowerCase()) throw emailMismatch();
		await tx
			.insert(workspaceMembers)
			.values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role })
			.onConflictDoNothing();
		await tx
			.update(workspaceInvites)
			.set({ acceptedAt: new Date(), acceptedBy: user.id })
			.where(eq(workspaceInvites.id, invite.id));
		const [joined] = await tx
			.select({ workspace: workspaces, role: workspaceMembers.role })
			.from(workspaceMembers)
			.innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
			.where(
				and(
					eq(workspaceMembers.workspaceId, invite.workspaceId),
					eq(workspaceMembers.userId, user.id),
				),
			);
		if (!joined) throw new Error("Membership was not created");
		return { slug: joined.workspace.slug, name: joined.workspace.name, role: joined.role };
	});
}
