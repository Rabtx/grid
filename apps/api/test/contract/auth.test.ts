import { afterAll, describe, expect, it } from "bun:test";

import { call, json, stable, type Reply } from "./client";

/**
 * Sign-up to sign-out on one throwaway account, against whichever server CONTRACT_API_URL names.
 * The account is deleted afterwards when DATABASE_URL is set (run with
 * `bun --env-file=../nest-api/.env test test/contract`). The flows stay inside the routes'
 * per-minute limits, so run the suite at most once a minute per server.
 */
const run = Math.random().toString(36).slice(2, 10);
const email = `contract-${run}@grid.test`;
const username = `contract-${run}`;
/** The throwaway account's password; a test value, not a secret. */
const PASSWORD = "contract-password-1";
const origin = { origin: "http://localhost:3001", "x-requested-with": "XMLHttpRequest" };

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
	call(path, json(body, { headers: { ...origin, ...headers } }));

const cookieOf = (reply: Reply): string | null => {
	const raw = reply.headers.get("set-cookie");
	const match = raw?.match(/grid_refresh_token=([^;]*)/);
	return match ? (match[1] ?? "") : null;
};

/** The parts of a user that are the same on every run. */
function user(value: unknown): unknown {
	const { id, createdAt, ...rest } = value as Record<string, unknown>;
	expect(typeof id).toBe("string");
	expect(typeof createdAt).toBe("string");
	return rest;
}

function data<T = unknown>(reply: Reply): T {
	return (reply.body as { data: T }).data;
}

function error(reply: Reply): { code: string; message: string } {
	const { code, message } = reply.body as { code: string; message: string };
	return { code, message };
}

const expectedUser = { email, username, isActive: true, hasPassword: true };

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { SQL } = await import("bun");
	const sql = new SQL(process.env.DATABASE_URL, { max: 1 });
	await sql`delete from users where email = ${email}`;
	await sql.close();
});

describe("auth: sign-up and verification", () => {
	let code = "";

	it("registers an account and sends a code", async () => {
		const reply = await post("/api/v1/auth/register", { email, username, password: PASSWORD });
		expect(reply.status).toBe(201);
		const body = data<{ developmentCode: string; user: unknown }>(reply);
		expect(body).toMatchObject({ accepted: true, message: "A verification code has been sent." });
		expect(body.developmentCode).toMatch(/^\d{6}$/);
		expect(user(body.user)).toEqual({ ...expectedUser, emailVerified: false });
		code = body.developmentCode;
	});

	it("refuses the same email twice, and bad input", async () => {
		const again = await post("/api/v1/auth/register", {
			email,
			username: `${username}-b`,
			password: PASSWORD,
		});
		expect(again.status).toBe(409);
		expect(error(again)).toEqual({
			code: "AUTH_EMAIL_ALREADY_REGISTERED",
			message: "An account with this email already exists",
		});
		const bad = await post("/api/v1/auth/register", {
			email: "nope",
			username: "A!",
			password: "short",
		});
		expect(bad.status).toBe(400);
		expect(stable(bad.body)).toMatchObject({ code: "VALIDATION_ERROR" });
		const paths = (bad.body as { errors: { path: string }[] }).errors.map((item) => item.path);
		expect([...new Set(paths)].sort()).toEqual(["email", "password", "username"]);
	});

	it("won't sign in before the email is verified", async () => {
		const reply = await post("/api/v1/auth/login", { email, password: PASSWORD });
		expect(reply.status).toBe(403);
		expect(error(reply)).toEqual({
			code: "AUTH_EMAIL_NOT_VERIFIED",
			message: "Verify your email before signing in",
		});
	});

	it("rejects a wrong code, then verifies with the right one", async () => {
		const wrong = await post("/api/v1/auth/verify-email", {
			email,
			code: code === "000000" ? "111111" : "000000",
		});
		expect(wrong.status).toBe(401);
		expect(error(wrong)).toEqual({
			code: "AUTH_OTP_INVALID",
			message: "The code is invalid or expired",
		});
		const right = await post("/api/v1/auth/verify-email", { email, code });
		expect(right.status).toBe(200);
		expect(user(data(right))).toEqual({ ...expectedUser, emailVerified: true });
	});

	it("says the same thing to a resend for a verified account", async () => {
		const reply = await post("/api/v1/auth/resend-verification", { email });
		expect(reply.status).toBe(202);
		expect(data<unknown>(reply)).toEqual({
			accepted: true,
			message: "If the account requires verification, a code has been sent.",
		});
	});
});

describe("auth: sessions", () => {
	let access = "";
	let cookie = "";

	const bearer = () => ({ authorization: `Bearer ${access}` });

	it("signs in with a refresh cookie, and never shows the refresh token to a browser", async () => {
		const wrong = await post("/api/v1/auth/login", { email, password: "wrong-password-123" });
		expect(wrong.status).toBe(401);
		expect(error(wrong)).toEqual({
			code: "AUTH_INVALID_CREDENTIALS",
			message: "Invalid email or password",
		});

		const reply = await post("/api/v1/auth/login", { email, password: PASSWORD });
		expect(reply.status).toBe(200);
		const body = data<Record<string, unknown>>(reply);
		expect(Object.keys(body).sort()).toEqual(["accessToken", "accessTokenExpiresAt", "user"]);
		expect(user(body.user)).toEqual({ ...expectedUser, emailVerified: true });
		// This session is the one the tests below use.
		access = (body as { accessToken: string }).accessToken;
		cookie = cookieOf(reply) ?? "";
		const setCookie = reply.headers.get("set-cookie") ?? "";
		expect(setCookie).toMatch(/grid_refresh_token=[0-9a-f-]{36}\.[A-Za-z0-9_-]+/);
		expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
		expect(setCookie).toMatch(/HttpOnly/i);
		expect(setCookie).toMatch(/SameSite=Lax/i);
		expect(setCookie).toMatch(/Max-Age=2592000/);
	});

	it("gives native clients the refresh token in the body", async () => {
		const reply = await post(
			"/api/v1/auth/login",
			{ email, password: PASSWORD },
			{ "x-client-platform": "native" },
		);
		expect(reply.status).toBe(200);
		expect(Object.keys(data<object>(reply)).sort()).toEqual([
			"accessToken",
			"accessTokenExpiresAt",
			"refreshToken",
			"user",
		]);
	});

	it("GET /auth/me", async () => {
		const reply = await call("/api/v1/auth/me", { headers: bearer() });
		expect(reply.status).toBe(200);
		expect(user(data(reply))).toEqual({ ...expectedUser, emailVerified: true });
	});

	it("rotates the refresh token, and treats reuse of an old one as theft", async () => {
		const first = await post(
			"/api/v1/auth/refresh",
			{},
			{ cookie: `grid_refresh_token=${cookie}` },
		);
		expect(first.status).toBe(200);
		const next = cookieOf(first);
		expect(next).not.toBeNull();
		expect(next).not.toBe(cookie);
		access = data<{ accessToken: string }>(first).accessToken;

		const reused = await post(
			"/api/v1/auth/refresh",
			{},
			{ cookie: `grid_refresh_token=${cookie}` },
		);
		expect(reused.status).toBe(401);
		expect(error(reused)).toEqual({
			code: "AUTH_REFRESH_TOKEN_INVALID",
			message: "Session could not be refreshed",
		});
		// Reuse revoked that session, so its new token is dead too.
		const after = await post("/api/v1/auth/refresh", {}, { cookie: `grid_refresh_token=${next}` });
		expect(after.status).toBe(401);
		const none = await post("/api/v1/auth/refresh", {});
		expect(error(none).code).toBe("AUTH_REFRESH_TOKEN_INVALID");
	});

	it("lists sessions and revokes one", async () => {
		const native = await post(
			"/api/v1/auth/login",
			{ email, password: PASSWORD },
			{ "x-client-platform": "native" },
		);
		access = data<{ accessToken: string }>(native).accessToken;
		const list = await call("/api/v1/auth/sessions", { headers: bearer() });
		expect(list.status).toBe(200);
		const sessions = data<{ id: string; isCurrent: boolean }[]>(list);
		expect(sessions.filter((session) => session.isCurrent)).toHaveLength(1);
		expect(Object.keys(sessions[0] ?? {}).sort()).toEqual([
			"createdAt",
			"expiresAt",
			"id",
			"ipAddress",
			"isCurrent",
			"lastUsedAt",
			"userAgent",
		]);

		const bad = await call("/api/v1/auth/sessions/not-a-uuid", {
			method: "DELETE",
			headers: bearer(),
		});
		expect(bad.status).toBe(400);
		expect(stable(bad.body)).toMatchObject({ statusCode: 400, code: "BAD_REQUEST" });

		const other = sessions.find((session) => !session.isCurrent);
		if (other) {
			const revoked = await call(`/api/v1/auth/sessions/${other.id}`, {
				method: "DELETE",
				headers: bearer(),
			});
			expect(revoked.status).toBe(200);
			expect(data<unknown>(revoked)).toEqual({ revoked: true });
		}
	});

	it("changes the password, checking the current one", async () => {
		const wrong = await call(
			"/api/v1/auth/change-password",
			json(
				{ currentPassword: "nope-nope-nope", newPassword: "contract-password-2" },
				{ headers: { ...origin, ...bearer() } },
			),
		);
		expect(wrong.status).toBe(401);
		expect(error(wrong)).toEqual({
			code: "AUTH_CURRENT_PASSWORD_INVALID",
			message: "Current password is incorrect",
		});
		const same = await call(
			"/api/v1/auth/change-password",
			json(
				{ currentPassword: PASSWORD, newPassword: PASSWORD },
				{ headers: { ...origin, ...bearer() } },
			),
		);
		expect(same.status).toBe(400);
		expect((same.body as { errors: unknown[] }).errors).toEqual([
			{
				code: "custom",
				path: "newPassword",
				message: "New password must be different from the current password",
			},
		]);
		const changed = await call(
			"/api/v1/auth/change-password",
			json(
				{ currentPassword: PASSWORD, newPassword: "contract-password-2" },
				{ headers: { ...origin, ...bearer() } },
			),
		);
		expect(changed.status).toBe(200);
		expect(data<unknown>(changed)).toEqual({
			accepted: true,
			message: "Password changed successfully. Other sessions were signed out.",
		});
	});

	it("rejects cross-site writes", async () => {
		// Not on /login: sign-in attempts are rate limited, and other suites need theirs.
		const reply = await call(
			"/api/v1/auth/verify-email",
			json({ email, code: "123456" }, { headers: { origin: "https://evil.example" } }),
		);
		expect(reply.status).toBe(403);
		expect(error(reply)).toEqual({
			code: "AUTH_CSRF_REJECTED",
			message: "Request origin could not be verified",
		});
	});
});

describe("auth: recovery and sign-out", () => {
	let magicAccess = "";

	it("resets a forgotten password with a code", async () => {
		const forgot = await post("/api/v1/auth/forgot-password", { email });
		expect(forgot.status).toBe(202);
		const body = data<{ developmentCode: string }>(forgot);
		expect(body).toMatchObject({
			accepted: true,
			message: "If an account exists, a password reset code has been sent.",
		});
		const wrong = await post("/api/v1/auth/reset-password", {
			email,
			code: body.developmentCode === "000000" ? "111111" : "000000",
			newPassword: "contract-password-3",
		});
		expect(wrong.status).toBe(401);
		const reset = await post("/api/v1/auth/reset-password", {
			email,
			code: body.developmentCode,
			newPassword: "contract-password-3",
		});
		expect(reset.status).toBe(200);
		expect(data<unknown>(reset)).toEqual({
			accepted: true,
			message: "Password reset successfully. Sign in with your new password.",
		});
	});

	it("signs in once with a magic link", async () => {
		const request = await post("/api/v1/auth/methods/magic-link/request", { email });
		expect(request.status).toBe(202);
		const token = data<{ developmentToken: string }>(request).developmentToken;
		expect(token).toMatch(/^[0-9a-f-]{36}\./);
		const first = await post("/api/v1/auth/methods/magic-link/consume", { token });
		expect(first.status).toBe(200);
		magicAccess = data<{ accessToken: string }>(first).accessToken;
		expect(Object.keys(data<object>(first)).sort()).toEqual([
			"accessToken",
			"accessTokenExpiresAt",
			"user",
		]);
		const again = await post("/api/v1/auth/methods/magic-link/consume", { token });
		expect(again.status).toBe(401);
		expect(error(again)).toEqual({
			code: "MAGIC_LINK_INVALID",
			message: "The sign-in link is invalid or expired",
		});
	});

	it("lists the sign-in providers", async () => {
		const reply = await call("/api/v1/auth/methods");
		expect(reply.status).toBe(200);
		expect(Object.keys(data<object>(reply))).toEqual(["google"]);
	});

	it("signs out one session, then all of them", async () => {
		const login = await post("/api/v1/auth/login", { email, password: "contract-password-3" });
		expect(login.status).toBe(200);
		const cookie = cookieOf(login);
		const access = data<{ accessToken: string }>(login).accessToken;

		const out = await post("/api/v1/auth/logout", {}, { cookie: `grid_refresh_token=${cookie}` });
		expect(out.status).toBe(204);
		expect(out.headers.get("set-cookie") ?? "").toMatch(/grid_refresh_token=;/);
		const refresh = await post(
			"/api/v1/auth/refresh",
			{},
			{ cookie: `grid_refresh_token=${cookie}` },
		);
		expect(refresh.status).toBe(401);

		const all = await call("/api/v1/auth/logout-all", {
			method: "POST",
			headers: { ...origin, authorization: `Bearer ${access}` },
		});
		// The session behind this token was signed out above, so the token no longer works.
		expect(all.status).toBe(401);
		expect(error(all).code).toBe("AUTH_SESSION_INVALID");

		const everywhere = await call("/api/v1/auth/logout-all", {
			method: "POST",
			headers: { ...origin, authorization: `Bearer ${magicAccess}` },
		});
		expect(everywhere.status).toBe(204);
		const gone = await call("/api/v1/auth/me", {
			headers: { authorization: `Bearer ${magicAccess}` },
		});
		expect(gone.status).toBe(401);
	});
});
