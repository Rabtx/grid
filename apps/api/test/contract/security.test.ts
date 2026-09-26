import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import { createDatabase, schema } from "@grid/db";
import { hashPassword } from "@grid/db/password";
import { eq } from "drizzle-orm";

import { call, json, type Reply, SIGN_IN_TIMEOUT, stable } from "./client";

/**
 * 2FA, passkeys and Google, on one throwaway account made directly in the database and signed
 * in with a magic link (sign-in attempts are rate limited and the other suites use them).
 */
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed: run bun run test:contract");
const database = createDatabase(process.env.DATABASE_URL, { max: 1 });
const tag = Math.random().toString(36).slice(2, 10);
const email = `security-${tag}@grid.test`;
/** The throwaway account's password; a test value, not a secret. */
const PASSWORD = "security-password-1";
const browser = { origin: "http://localhost:3001", "x-requested-with": "XMLHttpRequest" };
let access = "";

const data = <T = unknown>(reply: Reply) => (reply.body as { data: T }).data;
const error = (reply: Reply) => {
	const { code, message } = reply.body as { code: string; message: string };
	return { code, message };
};
const signedIn = (path: string, init: RequestInit = {}) =>
	call(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${access}` } });
const postJson = (path: string, value: unknown) =>
	signedIn(path, json(value, { headers: { "content-type": "application/json" } }));

/** RFC 6238 on its own, so the test does not trust the server's implementation. */
function totp(secret: string, time = Math.floor(Date.now() / 1000)): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
	const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(time / 30)));
	const mac = createHmac("sha1", key).update(counter).digest();
	const offset = (mac[mac.length - 1] ?? 0) & 0xf;
	return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

beforeAll(async () => {
	await database.db.insert(schema.users).values({
		email,
		username: `security-${tag}`,
		passwordHash: await hashPassword(PASSWORD, 4),
		emailVerifiedAt: new Date(),
	});
	const request = await call(
		"/api/v1/auth/methods/magic-link/request",
		json({ email }, { headers: browser }),
	);
	const token = data<{ developmentToken: string }>(request).developmentToken;
	const session = await call(
		"/api/v1/auth/methods/magic-link/consume",
		json({ token }, { headers: browser }),
	);
	access = data<{ accessToken: string }>(session).accessToken;
}, SIGN_IN_TIMEOUT);

afterAll(async () => {
	await database.db.delete(schema.users).where(eq(schema.users.email, email));
	await database.close();
});

describe("account security", () => {
	it("needs sign-in", async () => {
		const reply = await call("/api/v1/auth/security");
		expect(reply.status).toBe(401);
		expect(error(reply).code).toBe("AUTH_REQUIRED");
	});

	it("starts with nothing set up", async () => {
		const reply = await signedIn("/api/v1/auth/security");
		expect(reply.status).toBe(200);
		expect(data<unknown>(reply)).toEqual({
			mfa: { totpEnabled: false, recoveryCodesRemaining: 0 },
			passkeys: [],
			social: { googleLinked: false },
		});
	});
});

describe("two-factor authentication", () => {
	let secret = "";
	let recovery: string[] = [];

	it("can't confirm before setup starts", async () => {
		const reply = await postJson("/api/v1/auth/security/totp/confirm", { code: "123456" });
		expect(reply.status).toBe(400);
		expect(error(reply)).toEqual({
			code: "MFA_SETUP_NOT_STARTED",
			message: "Start two-factor setup before confirming it",
		});
	});

	it("sets up with a secret, a URI and a QR code", async () => {
		const reply = await signedIn("/api/v1/auth/security/totp/setup", { method: "POST" });
		expect(reply.status).toBe(201);
		const body = data<{ secret: string; uri: string; qrCodeDataUrl: string }>(reply);
		expect(body.secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(body.uri).toBe(
			`otpauth://totp/Grid:${encodeURIComponent(email)}?secret=${body.secret}&issuer=Grid`,
		);
		expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
		secret = body.secret;
	});

	it("turns on with a current code and hands out ten recovery codes", async () => {
		const wrong = await postJson("/api/v1/auth/security/totp/confirm", {
			code: totp(secret) === "000000" ? "111111" : "000000",
		});
		expect(wrong.status).toBe(401);
		expect(error(wrong)).toEqual({
			code: "MFA_CODE_INVALID",
			message: "The authentication code is invalid or expired",
		});
		const reply = await postJson("/api/v1/auth/security/totp/confirm", { code: totp(secret) });
		expect(reply.status).toBe(201);
		const body = data<{ enabled: boolean; recoveryCodes: string[] }>(reply);
		expect(body.enabled).toBe(true);
		expect(body.recoveryCodes).toHaveLength(10);
		for (const code of body.recoveryCodes) expect(code).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}$/);
		recovery = body.recoveryCodes;
		const status = await signedIn("/api/v1/auth/security");
		expect(data<{ mfa: unknown }>(status).mfa).toEqual({
			totpEnabled: true,
			recoveryCodesRemaining: 10,
		});
	});

	it("then asks for a second step at sign-in, which a recovery code completes once", async () => {
		const login = await call(
			"/api/v1/auth/login",
			json({ email, password: PASSWORD }, { headers: browser }),
		);
		expect(login.status).toBe(200);
		const challenge = data<{
			requiresTwoFactor: boolean;
			challengeToken: string;
			methods: string[];
		}>(login);
		expect(challenge.requiresTwoFactor).toBe(true);
		expect(challenge.methods).toEqual(["totp", "recovery_code"]);
		expect(login.headers.get("set-cookie")).toBeNull();

		const verify = (code: string) =>
			call(
				"/api/v1/auth/methods/two-factor/verify",
				json({ challengeToken: challenge.challengeToken, code }, { headers: browser }),
			);
		const wrong = await verify("zzzzzzzz-zzzzzzzz");
		expect(wrong.status).toBe(401);
		expect(error(wrong)).toEqual({
			code: "AUTH_OTP_INVALID",
			message: "The code is invalid or expired",
		});
		const done = await verify(recovery[0] ?? "");
		expect(done.status).toBe(200);
		expect(Object.keys(data<object>(done)).sort()).toEqual([
			"accessToken",
			"accessTokenExpiresAt",
			"user",
		]);
		expect(done.headers.get("set-cookie") ?? "").toMatch(/grid_refresh_token=/);
		const again = await verify(recovery[0] ?? "");
		expect(again.status).toBe(401);

		const status = await signedIn("/api/v1/auth/security");
		expect(
			data<{ mfa: { recoveryCodesRemaining: number } }>(status).mfa.recoveryCodesRemaining,
		).toBe(9);
	});

	it("turns off with a code", async () => {
		const wrong = await postJson("/api/v1/auth/security/totp/disable", { code: "000000" });
		expect([401]).toContain(wrong.status);
		const reply = await postJson("/api/v1/auth/security/totp/disable", { code: totp(secret) });
		expect(reply.status).toBe(201);
		expect(data<unknown>(reply)).toEqual({ enabled: false });
	});
});

describe("passkeys", () => {
	it("offers registration options for the signed-in account", async () => {
		const reply = await signedIn("/api/v1/auth/security/passkeys/options", { method: "POST" });
		expect(reply.status).toBe(201);
		const body = data<{ challengeId: string; options: { challenge: string; rp: { id: string } } }>(
			reply,
		);
		expect(body.challengeId).toMatch(/^[0-9a-f-]{36}$/);
		expect(typeof body.options.challenge).toBe("string");
		expect(typeof body.options.rp.id).toBe("string");
	});

	it("refuses a registration that isn't a real authenticator's", async () => {
		const options = await signedIn("/api/v1/auth/security/passkeys/options", { method: "POST" });
		const { challengeId } = data<{ challengeId: string }>(options);
		const reply = await postJson("/api/v1/auth/security/passkeys", {
			challengeId,
			name: "Fake key",
			response: { id: "not-a-credential", response: {} },
		});
		expect(reply.status).toBeGreaterThanOrEqual(400);
		expect(error(reply).code === "PASSKEY_INVALID" || reply.status === 500).toBe(true);
	});

	it("says which passkeys it can't remove", async () => {
		const bad = await signedIn("/api/v1/auth/security/passkeys/nope", { method: "DELETE" });
		expect(bad.status).toBe(400);
		expect(error(bad).message).toBe("Validation failed (uuid v 4 is expected)");
		const missing = await signedIn(
			"/api/v1/auth/security/passkeys/2c1a1a40-0f1e-4c5b-9b1a-3d9a5d1e7f00",
			{ method: "DELETE" },
		);
		expect(missing.status).toBe(400);
		expect(error(missing)).toEqual({ code: "PASSKEY_NOT_FOUND", message: "Passkey not found" });
	});

	it("offers sign-in options for any discoverable passkey, and none for an account without one", async () => {
		const any = await call("/api/v1/auth/methods/passkeys/options", json({}, { headers: browser }));
		expect(any.status).toBe(201);
		expect(data<{ challengeId: string }>(any).challengeId).toMatch(/^[0-9a-f-]{36}$/);
		for (const who of [email, `nobody-${tag}@grid.test`]) {
			const reply = await call(
				"/api/v1/auth/methods/passkeys/options",
				json({ email: who }, { headers: browser }),
			);
			expect(reply.status).toBe(401);
			expect(error(reply)).toEqual({
				code: "PASSKEY_INVALID",
				message: "Passkey authentication could not be completed",
			});
		}
	});

	it("refuses a sign-in with an unknown challenge", async () => {
		const reply = await call(
			"/api/v1/auth/methods/passkeys/verify",
			json(
				{ challengeId: "2c1a1a40-0f1e-4c5b-9b1a-3d9a5d1e7f00", response: { id: "x" } },
				{ headers: browser },
			),
		);
		expect(reply.status).toBe(401);
		expect(error(reply).code).toBe("PASSKEY_INVALID");
	});
});

describe("Google", () => {
	it("answers sign-in and linking the same way", async () => {
		const methods = await call("/api/v1/auth/methods");
		const enabled = data<{ google: { enabled: boolean } }>(methods).google.enabled;
		const credential = "x".repeat(120);
		const signIn = await call(
			"/api/v1/auth/methods/google",
			json({ credential }, { headers: browser }),
		);
		const link = await postJson("/api/v1/auth/security/google/link", { credential });
		for (const reply of [signIn, link]) {
			if (enabled) {
				expect(reply.status).toBe(401);
				expect(error(reply).code).toBe("GOOGLE_CREDENTIAL_INVALID");
			} else {
				expect(reply.status).toBe(503);
				expect(error(reply)).toEqual({
					code: "GOOGLE_AUTH_NOT_CONFIGURED",
					message: "Google sign-in is not configured.",
				});
			}
		}
		const short = await call(
			"/api/v1/auth/methods/google",
			json({ credential: "x" }, { headers: browser }),
		);
		expect(short.status).toBe(400);
		expect(stable(short.body)).toMatchObject({ code: "VALIDATION_ERROR" });
	});
});
