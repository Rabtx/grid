import { afterAll, describe, expect, it } from "bun:test";

import { createDatabase, schema } from "@grid/db";
import { hashPassword } from "@grid/db/password";
import { eq, like } from "drizzle-orm";

import { createApp } from "../../app";
import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { ApiError } from "../../http/errors";
import { sessionLookup } from "../../sessions";
import { authCrypto } from "./crypto";
import * as flows from "./flows";
import * as store from "./store";

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

	it("answers a wrong password the same way whether or not the account exists", async () => {
		const user = await account("enumeration");
		for (let i = 0; i < 3; i++) {
			await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		}
		// Locked now. A wrong password must still look exactly like an unknown email, or the
		// lockout status is a way to find out which addresses are registered.
		for (const email of [user.email, `flows-${tag}-nobody@grid.test`]) {
			expect(await failure(flows.login(deps, { email, password: "wrong" }, meta))).toEqual({
				status: 401,
				code: "AUTH_INVALID_CREDENTIALS",
			});
		}
		// The right password still learns it is locked.
		expect(
			await failure(flows.login(deps, { email: user.email, password: PASSWORD }, meta)),
		).toEqual({ status: 423, code: "AUTH_ACCOUNT_LOCKED" });
	});

	it("refuses a refresh token whose id is not a uuid", async () => {
		expect(await failure(flows.refresh(deps, `${"a".repeat(24)}.${"b".repeat(43)}`))).toEqual({
			status: 401,
			code: "AUTH_REFRESH_TOKEN_INVALID",
		});
	});

	it("forgets failed attempts after a successful sign-in", async () => {
		const user = await account("reset");
		await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		await flows.login(deps, { email: user.email, password: PASSWORD }, meta);
		const [row] = await database.db.select().from(schema.users).where(eq(schema.users.id, user.id));
		expect(row?.failedLoginAttempts).toBe(0);
	});

	it("gives a fresh budget once a lockout has passed, instead of relocking on every try", async () => {
		// The counter only came back down on a successful sign-in, so after a lockout ran out the
		// next wrong guess started from the old total and locked the account again straight away —
		// one wrong guess every lock period kept it locked forever.
		const user = await account("decay");
		for (let i = 0; i < 3; i++) {
			await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		}
		// The lockout has run out. That is all the passing of time changes.
		await database.db
			.update(schema.users)
			.set({ lockedUntil: new Date(Date.now() - 1000) })
			.where(eq(schema.users.id, user.id));

		await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		const [row] = await database.db.select().from(schema.users).where(eq(schema.users.id, user.id));
		// The first wrong guess of a new run, not the fourth of the old one.
		expect(row?.failedLoginAttempts).toBe(1);

		// So a whole run of guesses is left before it locks again, rather than just the one.
		await failure(flows.login(deps, { email: user.email, password: "wrong" }, meta));
		expect(await flows.login(deps, { email: user.email, password: PASSWORD }, meta)).toBeTruthy();
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

	it("counts concurrent wrong reset codes atomically and keeps the exhausted challenge consumed", async () => {
		const user = await account("otp-race");
		const sent = await flows.forgotPassword(deps, { email: user.email });
		const challenge = await store.findLatestChallenge(deps.db, user.email, "password_reset");
		if (!challenge) throw new Error("no challenge");
		const wrong = sent.developmentCode === "000000" ? "111111" : "000000";
		const failures = await Promise.all(
			Array.from({ length: config.otpMaxAttempts }, () =>
				failure(
					flows.resetPassword(deps, {
						email: user.email,
						code: wrong,
						newPassword: "new-password-1234",
					}),
				),
			),
		);
		expect(failures.every((result) => result.code === "AUTH_OTP_INVALID")).toBe(true);
		const exhausted = await store.findChallenge(deps.db, challenge.id);
		expect(exhausted?.attempts).toBe(config.otpMaxAttempts);
		expect(exhausted?.consumedAt).not.toBeNull();
		await store.recordChallengeAttempt(deps.db, challenge.id, config.otpMaxAttempts);
		const stillConsumed = await store.findChallenge(deps.db, challenge.id);
		expect(stillConsumed?.attempts).toBe(config.otpMaxAttempts);
		expect(stillConsumed?.consumedAt).toEqual(exhausted?.consumedAt);
		expect(
			await failure(
				flows.resetPassword(deps, {
					email: user.email,
					code: sent.developmentCode ?? "",
					newPassword: "new-password-1234",
				}),
			),
		).toEqual({ status: 401, code: "AUTH_OTP_INVALID" });
	});

	it("counts concurrent wrong MFA codes atomically and exhausts the login challenge", async () => {
		const user = await account("mfa-race");
		const id = crypto.randomUUID();
		const challengeToken = deps.crypto.createChallengeToken(id);
		await store.createChallenge(deps.db, {
			id,
			userId: user.id,
			email: user.email,
			purpose: "mfa_login",
			codeHash: deps.crypto.hashChallengeToken("mfa_login", user.email, challengeToken),
			expiresAt: new Date(Date.now() + 60_000),
		});
		const failures = await Promise.all(
			Array.from({ length: config.otpMaxAttempts }, () =>
				failure(flows.completeMfaLogin(deps, { challengeToken, code: "000000" }, meta)),
			),
		);
		expect(failures.every((result) => result.code === "AUTH_OTP_INVALID")).toBe(true);
		const exhausted = await store.findChallenge(deps.db, id);
		expect(exhausted?.attempts).toBe(config.otpMaxAttempts);
		expect(exhausted?.consumedAt).not.toBeNull();
		expect(
			await failure(flows.completeMfaLogin(deps, { challengeToken, code: "000000" }, meta)),
		).toEqual({ status: 401, code: "AUTH_OTP_INVALID" });
		expect((await store.findChallenge(deps.db, id))?.attempts).toBe(config.otpMaxAttempts);
	});

	it("logout revokes its authenticated session even after another tab rotated the cookie", async () => {
		const user = await account("logout-rotated");
		const initial = await flows.createSession(deps, user, meta);
		const rotated = await flows.refresh(deps, initial.refreshToken);
		const app = createApp({
			config,
			db: deps.db,
			sessions: sessionLookup(deps.db),
			send: deps.send,
		});
		const out = await app.request("/api/v1/auth/logout", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${initial.accessToken}`,
				cookie: `${config.refreshCookieName}=${initial.refreshToken}`,
			},
			body: "{}",
		});
		expect(out.status).toBe(204);
		expect(out.headers.get("set-cookie")).toContain(`${config.refreshCookieName}=;`);
		expect(await failure(flows.refresh(deps, rotated.refreshToken))).toEqual({
			status: 401,
			code: "AUTH_REFRESH_TOKEN_INVALID",
		});
	});

	it("logout and refresh cannot leave a rotated session active when racing", async () => {
		const user = await account("logout-race");
		const initial = await flows.createSession(deps, user, meta);
		const app = createApp({
			config,
			db: deps.db,
			sessions: sessionLookup(deps.db),
			send: deps.send,
		});
		const [refresh, out] = await Promise.all([
			flows.refresh(deps, initial.refreshToken).catch((error: unknown) => {
				if (error instanceof ApiError && error.code === "AUTH_REFRESH_TOKEN_INVALID") return null;
				throw error;
			}),
			app.request("/api/v1/auth/logout", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${initial.accessToken}`,
					cookie: `${config.refreshCookieName}=${initial.refreshToken}`,
				},
				body: "{}",
			}),
		]);
		expect(out.status).toBe(204);
		const sessionId = deps.crypto.sessionIdFromRefreshToken(initial.refreshToken) ?? "";
		expect((await store.findSession(deps.db, sessionId))?.revokedAt).not.toBeNull();
		if (refresh)
			expect(await failure(flows.refresh(deps, refresh.refreshToken))).toEqual({
				status: 401,
				code: "AUTH_REFRESH_TOKEN_INVALID",
			});
	});

	it("logout never revokes a session from forged JWTs or mismatched signed user claims", async () => {
		const user = await account("logout-proof");
		const other = await account("logout-other");
		const app = createApp({
			config,
			db: deps.db,
			sessions: sessionLookup(deps.db),
			send: deps.send,
		});
		for (const forged of [true, false]) {
			const initial = await flows.createSession(deps, user, meta);
			const sid = deps.crypto.sessionIdFromRefreshToken(initial.refreshToken) ?? "";
			const signer = forged
				? authCrypto({ ...config, jwtSecret: "different-test-secret-0123456789" })
				: deps.crypto;
			const signed = await signer.signAccessToken({ sub: other.id, sid }, "15m");
			const out = await app.request("/api/v1/auth/logout", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${signed.token}`,
					cookie: `${config.refreshCookieName}=${sid}.invalid`,
				},
				body: "{}",
			});
			expect(out.status).toBe(204);
			expect((await store.findSession(deps.db, sid))?.revokedAt).toBeNull();
			expect((await flows.refresh(deps, initial.refreshToken)).user.id).toBe(user.id);
		}
	});

	it("logout keeps cookie proof available without a bearer or with an expired bearer", async () => {
		const user = await account("logout-cookie");
		const app = createApp({
			config,
			db: deps.db,
			sessions: sessionLookup(deps.db),
			send: deps.send,
		});
		for (const expired of [false, true]) {
			const initial = await flows.createSession(deps, user, meta);
			const sid = deps.crypto.sessionIdFromRefreshToken(initial.refreshToken) ?? "";
			const signed = await deps.crypto.signAccessToken({ sub: user.id, sid }, "0s");
			const out = await app.request("/api/v1/auth/logout", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(expired ? { authorization: `Bearer ${signed.token}` } : {}),
					cookie: `${config.refreshCookieName}=${initial.refreshToken}`,
				},
				body: "{}",
			});
			expect(out.status).toBe(204);
			expect((await store.findSession(deps.db, sid))?.revokedAt).not.toBeNull();
		}
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

	it("counts wrong codes sent in parallel, so they still close the code", async () => {
		// Counting from the row read before the code was checked lost every increment but one when
		// the guesses arrived together, which is how a brute-forcer avoids the attempt limit:
		// a burst of them counted as one and the real code stayed usable.
		const user = await account("otp-parallel");
		const sent = await flows.forgotPassword(deps, { email: user.email });
		const code = sent.developmentCode ?? "";
		const wrong = code === "000000" ? "111111" : "000000";
		await Promise.all(
			Array.from({ length: config.otpMaxAttempts }, () =>
				failure(
					flows.resetPassword(deps, {
						email: user.email,
						code: wrong,
						newPassword: "new-password-1234",
					}),
				),
			),
		);
		expect(
			await failure(
				flows.resetPassword(deps, { email: user.email, code, newPassword: "new-password-1234" }),
			),
		).toEqual({ status: 401, code: "AUTH_OTP_INVALID" });
	});
});
