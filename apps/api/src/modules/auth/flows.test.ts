import { afterAll, describe, expect, it } from "bun:test";

import { createDatabase, schema } from "@grid/db";
import { hashPassword } from "@grid/db/password";
import { eq, like } from "drizzle-orm";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { ApiError } from "../../http/errors";
import { authCrypto } from "./crypto";
import * as flows from "./flows";

/**
 * Sign-in rules against a real database (the dev one, with throwaway `flows-*@grid.test`
 * accounts removed afterwards). Skipped without DATABASE_URL (Bun loads it from apps/api/.env).
 */
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("sign-in rules", () => {
	const database = createDatabase(url ?? "postgres://unused", { max: 2 });
	const config = createConfig(
		parseEnv({
			NODE_ENV: "test",
			DATABASE_URL: url,
			MAX_LOGIN_ATTEMPTS: "3",
			LOGIN_LOCK_MINUTES: "15",
		}),
	);
	const deps = { db: database.db, config, crypto: authCrypto(config), send: async () => {} };
	const meta = { ipAddress: null, userAgent: "test" };
	const tag = Math.random().toString(36).slice(2, 8);
	/** The throwaway accounts' password; a test value, not a secret. */
	const PASSWORD = "flows-password-123";

	async function account(name: string, overrides: Partial<typeof schema.users.$inferInsert> = {}) {
		const email = `flows-${tag}-${name}@grid.test`;
		const [user] = await database.db
			.insert(schema.users)
			.values({
				email,
				username: `flows-${tag}-${name}`,
				passwordHash: await hashPassword(PASSWORD, 4),
				emailVerifiedAt: new Date(),
				...overrides,
			})
			.returning();
		if (!user) throw new Error("no user");
		return user;
	}

	const failure = async (work: Promise<unknown>) => {
		try {
			await work;
		} catch (error) {
			if (error instanceof ApiError) return { status: error.status, code: error.code };
			throw error;
		}
		throw new Error("expected a failure");
	};

	afterAll(async () => {
		await database.db.delete(schema.users).where(like(schema.users.email, `flows-${tag}-%`));
		await database.close();
	});

	it("locks an account after too many wrong passwords, even for the right one", async () => {
		const user = await account("lock");
		for (let i = 0; i < 3; i++) {
			expect(
				await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta)),
			).toEqual({
				status: 401,
				code: "AUTH_INVALID_CREDENTIALS",
			});
		}
		expect(
			await failure(flows.login(deps, { email: user.email, password: PASSWORD }, meta)),
		).toEqual({
			status: 423,
			code: "AUTH_ACCOUNT_LOCKED",
		});
	});

	it("counts wrong passwords sent in parallel, so they still lock the account", async () => {
		// Counting from the row read before the password check lost every increment but one when
		// the guesses arrived together, which is how a brute-forcer avoids the lockout: ten at
		// once counted as one.
		const user = await account("parallel");
		const attempts = await Promise.all(
			Array.from({ length: 3 }, () =>
				failure(flows.login(deps, { email: user.email, password: "wrong" }, meta)),
			),
		);
		expect(attempts).toEqual(
			Array.from({ length: 3 }, () => ({ status: 401, code: "AUTH_INVALID_CREDENTIALS" })),
		);
		const [row] = await database.db.select().from(schema.users).where(eq(schema.users.id, user.id));
		expect(row?.failedLoginAttempts).toBe(3);
		expect(row?.lockedUntil).not.toBeNull();
		expect(
			await failure(flows.login(deps, { email: user.email, password: PASSWORD }, meta)),
		).toEqual({
			status: 423,
			code: "AUTH_ACCOUNT_LOCKED",
		});
	});

	it("forgets failed attempts after a successful sign-in", async () => {
		const user = await account("reset");
		await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		await flows.login(deps, { email: user.email, password: PASSWORD }, meta);
		const [row] = await database.db.select().from(schema.users).where(eq(schema.users.id, user.id));
		expect(row?.failedLoginAttempts).toBe(0);
	});

	it("refuses inactive accounts, and accounts without a password", async () => {
		const inactive = await account("inactive", { isActive: false });
		expect(
			await failure(flows.login(deps, { email: inactive.email, password: PASSWORD }, meta)),
		).toEqual({
			status: 401,
			code: "AUTH_ACCOUNT_INACTIVE",
		});
		const google = await account("nopass", { passwordHash: null });
		expect(
			(await failure(flows.login(deps, { email: google.email, password: PASSWORD }, meta))).code,
		).toBe("AUTH_INVALID_CREDENTIALS");
	});

	it("hands accounts with 2FA a challenge to complete, not a session", async () => {
		const user = await account("mfa");
		await database.db
			.insert(schema.totpFactors)
			.values({ userId: user.id, secretEncrypted: "x", isEnabled: true });
		const result = await flows.login(deps, { email: user.email, password: PASSWORD }, meta);
		expect("requiresTwoFactor" in result && result.methods).toEqual(["totp", "recovery_code"]);
		if (!("requiresTwoFactor" in result)) throw new Error("expected a challenge");
		const id = result.challengeToken.split(".")[0] ?? "";
		const [challenge] = await database.db
			.select()
			.from(schema.authChallenges)
			.where(eq(schema.authChallenges.id, id));
		expect(challenge?.purpose).toBe("mfa_login");
		expect(
			deps.crypto.verifyChallengeToken(
				"mfa_login",
				user.email,
				result.challengeToken,
				challenge?.codeHash ?? "",
			),
		).toBe(true);
	});

	it("closes a code after too many wrong tries", async () => {
		const user = await account("otp");
		const sent = await flows.forgotPassword(deps, { email: user.email });
		const code = sent.developmentCode ?? "";
		const wrong = code === "000000" ? "111111" : "000000";
		for (let i = 0; i < config.otpMaxAttempts; i++) {
			await failure(
				flows.resetPassword(deps, {
					email: user.email,
					code: wrong,
					newPassword: "new-password-1234",
				}),
			);
		}
		expect(
			await failure(
				flows.resetPassword(deps, { email: user.email, code, newPassword: "new-password-1234" }),
			),
		).toEqual({ status: 401, code: "AUTH_OTP_INVALID" });
	});
});
