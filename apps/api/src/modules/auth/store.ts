import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";

import type { ChallengePurpose } from "./crypto";

const { authChallenges, sessions, totpFactors, users } = schema;

export type ChallengeRecord = typeof authChallenges.$inferSelect;
export type SessionRecord = typeof sessions.$inferSelect;
export type RequestMetadata = { ipAddress: string | null; userAgent: string | null };

/** A new one-time challenge; any open one of the same purpose for the user is closed first. */
export async function createChallenge(
	db: Database,
	input: {
		id?: string;
		userId: string;
		email: string;
		purpose: ChallengePurpose;
		codeHash: string;
		expiresAt: Date;
	},
): Promise<ChallengeRecord> {
	return db.transaction(async (tx) => {
		await tx
			.update(authChallenges)
			.set({ consumedAt: new Date() })
			.where(
				and(
					eq(authChallenges.userId, input.userId),
					eq(authChallenges.purpose, input.purpose),
					isNull(authChallenges.consumedAt),
				),
			);
		const [challenge] = await tx.insert(authChallenges).values(input).returning();
		if (!challenge) throw new Error("Auth challenge insert did not return a record");
		return challenge;
	});
}

export async function findChallenge(db: Database, id: string): Promise<ChallengeRecord | null> {
	const [challenge] = await db
		.select()
		.from(authChallenges)
		.where(eq(authChallenges.id, id))
		.limit(1);
	return challenge ?? null;
}

/** Use a challenge once: true for the one caller that closed it. */
export async function consumeChallenge(db: Database, id: string): Promise<boolean> {
	const [challenge] = await db
		.update(authChallenges)
		.set({ consumedAt: new Date() })
		.where(and(eq(authChallenges.id, id), isNull(authChallenges.consumedAt)))
		.returning({ id: authChallenges.id });
	return Boolean(challenge);
}

export async function findLatestChallenge(
	db: Database,
	email: string,
	purpose: ChallengePurpose,
): Promise<ChallengeRecord | null> {
	const [challenge] = await db
		.select()
		.from(authChallenges)
		.where(
			and(
				eq(authChallenges.email, email),
				eq(authChallenges.purpose, purpose),
				isNull(authChallenges.consumedAt),
			),
		)
		.orderBy(desc(authChallenges.createdAt))
		.limit(1);
	return challenge ?? null;
}

/** Increment and close at the limit in one statement; concurrent guesses cannot lose attempts. */
export async function recordChallengeAttempt(
	db: Database,
	id: string,
	maxAttempts: number,
): Promise<void> {
	await db
		.update(authChallenges)
		.set({
			attempts: sql`${authChallenges.attempts} + 1`,
			consumedAt: sql`CASE WHEN ${authChallenges.attempts} + 1 >= ${maxAttempts}
				THEN CURRENT_TIMESTAMP ELSE ${authChallenges.consumedAt} END`,
		})
		.where(and(eq(authChallenges.id, id), isNull(authChallenges.consumedAt)));
}

export async function completeEmailVerification(
	db: Database,
	challengeId: string,
	userId: string,
): Promise<void> {
	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(authChallenges)
			.set({ consumedAt: now })
			.where(eq(authChallenges.id, challengeId));
		await tx
			.update(users)
			.set({ emailVerifiedAt: now, updatedAt: now })
			.where(eq(users.id, userId));
	});
}

/** New password from a reset code: every session ends, and any lockout is lifted. */
export async function completePasswordReset(
	db: Database,
	input: { challengeId: string; userId: string; passwordHash: string },
): Promise<void> {
	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(authChallenges)
			.set({ consumedAt: now })
			.where(eq(authChallenges.id, input.challengeId));
		await tx
			.update(users)
			.set({
				passwordHash: input.passwordHash,
				passwordChangedAt: now,
				updatedAt: now,
				failedLoginAttempts: 0,
				lockedUntil: null,
			})
			.where(eq(users.id, input.userId));
		await tx
			.update(sessions)
			.set({ revokedAt: now, revocationReason: "password_reset" })
			.where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt)));
	});
}

/** New password while signed in: every other session ends. */
export async function changePassword(
	db: Database,
	input: { userId: string; currentSessionId: string; passwordHash: string },
): Promise<void> {
	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(users)
			.set({ passwordHash: input.passwordHash, passwordChangedAt: now, updatedAt: now })
			.where(eq(users.id, input.userId));
		await tx
			.update(sessions)
			.set({ revokedAt: now, revocationReason: "password_changed" })
			.where(
				and(
					eq(sessions.userId, input.userId),
					ne(sessions.id, input.currentSessionId),
					isNull(sessions.revokedAt),
				),
			);
	});
}

export async function createSession(
	db: Database,
	input: {
		id: string;
		userId: string;
		refreshTokenHash: string;
		expiresAt: Date;
		metadata: RequestMetadata;
	},
): Promise<SessionRecord> {
	const [session] = await db
		.insert(sessions)
		.values({
			id: input.id,
			userId: input.userId,
			refreshTokenHash: input.refreshTokenHash,
			expiresAt: input.expiresAt,
			userAgent: input.metadata.userAgent,
			ipAddress: input.metadata.ipAddress,
		})
		.returning();
	if (!session) throw new Error("Session insert did not return a record");
	return session;
}

export async function findSession(db: Database, id: string): Promise<SessionRecord | null> {
	const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
	return session ?? null;
}

/** Swap the refresh token, only if it is still the one presented (no two rotations win). */
export async function rotateSession(
	db: Database,
	id: string,
	currentHash: string,
	nextHash: string,
	expiresAt: Date,
): Promise<SessionRecord | null> {
	const [session] = await db
		.update(sessions)
		.set({ refreshTokenHash: nextHash, expiresAt, lastUsedAt: new Date() })
		.where(
			and(
				eq(sessions.id, id),
				eq(sessions.refreshTokenHash, currentHash),
				isNull(sessions.revokedAt),
			),
		)
		.returning();
	return session ?? null;
}

export function listActiveSessions(db: Database, userId: string): Promise<SessionRecord[]> {
	return db
		.select()
		.from(sessions)
		.where(
			and(
				eq(sessions.userId, userId),
				isNull(sessions.revokedAt),
				gt(sessions.expiresAt, new Date()),
			),
		)
		.orderBy(desc(sessions.lastUsedAt));
}

export async function revokeSession(
	db: Database,
	id: string,
	userId: string,
	reason: string,
): Promise<boolean> {
	const revoked = await db
		.update(sessions)
		.set({ revokedAt: new Date(), revocationReason: reason })
		.where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
		.returning({ id: sessions.id });
	return revoked.length > 0;
}

export async function revokeAllSessions(
	db: Database,
	userId: string,
	reason: string,
): Promise<void> {
	await db
		.update(sessions)
		.set({ revokedAt: new Date(), revocationReason: reason })
		.where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function isTotpEnabled(db: Database, userId: string): Promise<boolean> {
	const [factor] = await db
		.select({ isEnabled: totpFactors.isEnabled })
		.from(totpFactors)
		.where(eq(totpFactors.userId, userId))
		.limit(1);
	return factor?.isEnabled ?? false;
}
