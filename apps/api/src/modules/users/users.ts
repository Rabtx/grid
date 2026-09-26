import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { eq } from "drizzle-orm";

import { conflict, unauthorized } from "../../http/errors";

export type UserRecord = typeof schema.users.$inferSelect;

/** A user as clients see them: no hashes, no lockout state. */
export type PublicUser = {
	id: string;
	email: string;
	username: string;
	isActive: boolean;
	emailVerified: boolean;
	hasPassword: boolean;
	createdAt: string;
};

export function toPublicUser(user: UserRecord): PublicUser {
	return {
		id: user.id,
		email: user.email,
		username: user.username,
		isActive: user.isActive,
		emailVerified: user.emailVerifiedAt !== null,
		hasPassword: user.passwordHash !== null,
		createdAt: user.createdAt.toISOString(),
	};
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeUsername = (username: string) => username.trim().toLowerCase();

/** Postgres's unique-violation code, wherever the driver or Drizzle put it. */
export function isUniqueViolation(error: unknown): boolean {
	for (let current: unknown = error; current && typeof current === "object";) {
		const record = current as { code?: unknown; errno?: unknown; cause?: unknown };
		if (record.code === "23505" || record.errno === "23505") return true;
		current = record.cause;
	}
	return false;
}

async function first(query: Promise<UserRecord[]>): Promise<UserRecord | null> {
	const [user] = await query;
	return user ?? null;
}

export const findUserById = (db: Database, id: string) =>
	first(db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1));

export const findUserByEmail = (db: Database, email: string) =>
	first(
		db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, normalizeEmail(email)))
			.limit(1),
	);

const findUserByUsername = (db: Database, username: string) =>
	first(db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1));

/** A new account with an empty profile. Email and username must both be free. */
export async function createUser(
	db: Database,
	input: { email: string; username: string; passwordHash: string },
): Promise<UserRecord> {
	const email = normalizeEmail(input.email);
	const username = normalizeUsername(input.username);
	if (await findUserByEmail(db, email)) {
		throw conflict({
			code: "AUTH_EMAIL_ALREADY_REGISTERED",
			message: "An account with this email already exists",
		});
	}
	if (await findUserByUsername(db, username)) {
		throw conflict({ code: "AUTH_USERNAME_TAKEN", message: "This username is already taken" });
	}
	try {
		return await db.transaction(async (tx) => {
			const [user] = await tx
				.insert(schema.users)
				.values({ email, username, passwordHash: input.passwordHash })
				.returning();
			if (!user) throw new Error("User insert did not return a record");
			await tx.insert(schema.userProfiles).values({ userId: user.id });
			return user;
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw conflict({
				code: "AUTH_ACCOUNT_ALREADY_EXISTS",
				message: "An account with these details already exists",
			});
		}
		throw error;
	}
}

/** The signed-in user, still active. */
export async function currentUser(db: Database, id: string): Promise<PublicUser> {
	const user = await findUserById(db, id);
	if (!user?.isActive) {
		throw unauthorized({ code: "AUTH_SESSION_INVALID", message: "Authentication required" });
	}
	return toPublicUser(user);
}

/** Count a failed sign-in, locking the account for a while after too many. */
export async function recordFailedLogin(
	db: Database,
	user: UserRecord,
	limits: { maxAttempts: number; lockMinutes: number },
): Promise<void> {
	const attempts = user.failedLoginAttempts + 1;
	const lockedUntil =
		attempts >= limits.maxAttempts
			? new Date(Date.now() + limits.lockMinutes * 60_000)
			: user.lockedUntil;
	await db
		.update(schema.users)
		.set({ failedLoginAttempts: attempts, lockedUntil, updatedAt: new Date() })
		.where(eq(schema.users.id, user.id));
}

export async function resetFailedLogins(db: Database, id: string): Promise<void> {
	await db
		.update(schema.users)
		.set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
		.where(eq(schema.users.id, id));
}
