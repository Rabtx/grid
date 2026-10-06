import { timingSafeEqual } from "node:crypto";

import { type Database, schema } from "@grid/db";
import { hashSecret } from "@grid/db/instance";
import { hashPassword } from "@grid/db/password";
import { eq, sql } from "drizzle-orm";
import * as z from "zod";

import type { AppConfig } from "../../config/config";
import { conflict, forbidden } from "../../http/errors";
import { emailSchema, passwordSchema, usernameSchema } from "../auth/schemas";
import { workspaceSlugSchema } from "../workspaces/schema";

const { instanceSettings, users, userProfiles, workspaces, workspaceMembers } = schema;

export const signupClosed = () =>
	forbidden({ code: "SIGNUP_CLOSED", message: "Signing up needs an invite to a workspace" });

async function settings(db: Database) {
	const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.id, 1));
	return row ?? null;
}

async function hasUsers(db: Database) {
	const [row] = await db.select({ id: users.id }).from(users).limit(1);
	return Boolean(row);
}

export async function isSignupOpen(db: Database): Promise<boolean> {
	return (await settings(db))?.signupOpen ?? false;
}

/** What the sign-in and setup pages need to know, public. */
export async function instanceStatus(db: Database) {
	return {
		setupNeeded: !(await hasUsers(db)),
		signupOpen: await isSignupOpen(db),
	};
}

/** Opening or closing signup is for whoever set this Grid up. */
export async function updateInstance(
	db: Database,
	userId: string,
	input: z.infer<typeof updateInstanceSchema>,
) {
	if ((await settings(db))?.ownerId !== userId)
		throw forbidden("Only the owner of this Grid can change its settings");
	await db
		.update(instanceSettings)
		.set({ signupOpen: input.signupOpen, updatedAt: new Date() })
		.where(eq(instanceSettings.id, 1));
	return instanceStatus(db);
}

export const updateInstanceSchema = z.object({ signupOpen: z.boolean() }).strict();

export const setupSchema = z
	.object({
		code: z.string().min(1).max(128),
		email: emailSchema,
		username: usernameSchema,
		password: passwordSchema,
		displayName: z.string().trim().min(1).max(100).optional(),
		workspace: z
			.object({ name: z.string().trim().min(1).max(120), slug: workspaceSlugSchema })
			.strict(),
	})
	.strict();

const invalidCode = () =>
	forbidden({ code: "SETUP_CODE_INVALID", message: "The setup link is invalid or expired" });

/** The setup code guards this Grid's first run, so it is compared in constant time. */
function sameHex(actual: string, expected: string): boolean {
	const a = Buffer.from(actual, "hex");
	const b = Buffer.from(expected, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * First run: with the code from the setup link, create the owner (verified, since they hold the
 * machine's link), their workspace, and make them this Grid's owner. Works once, while nobody
 * has an account.
 */
export async function setUp(
	db: Database,
	config: AppConfig,
	input: z.infer<typeof setupSchema>,
): Promise<typeof schema.users.$inferSelect> {
	const passwordHash = await hashPassword(input.password, config.passwordBcryptRounds);
	return db.transaction(async (tx) => {
		// Holding the settings row serialises two setups racing each other.
		const [current] = await tx
			.select()
			.from(instanceSettings)
			.where(eq(instanceSettings.id, 1))
			.for("update");
		const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
		if (count > 0) throw conflict({ code: "SETUP_DONE", message: "This Grid is already set up" });
		if (
			!current?.setupCodeHash ||
			!current.setupCodeExpiresAt ||
			current.setupCodeExpiresAt < new Date() ||
			!sameHex(current.setupCodeHash, hashSecret(input.code))
		)
			throw invalidCode();
		const [user] = await tx
			.insert(users)
			.values({
				email: input.email,
				username: input.username,
				passwordHash,
				emailVerifiedAt: new Date(),
			})
			.returning();
		if (!user) throw new Error("User insert did not return a record");
		await tx.insert(userProfiles).values({ userId: user.id, displayName: input.displayName });
		const [workspace] = await tx
			.insert(workspaces)
			.values({ slug: input.workspace.slug, name: input.workspace.name })
			.returning();
		if (!workspace) throw new Error("Workspace insert did not return a record");
		await tx
			.insert(workspaceMembers)
			.values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
		await tx
			.update(instanceSettings)
			.set({
				ownerId: user.id,
				setupCodeHash: null,
				setupCodeExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(eq(instanceSettings.id, 1));
		return user;
	});
}
