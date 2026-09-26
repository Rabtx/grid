import { describe, expect, it } from "bun:test";

import type { Database } from "@grid/db";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { ApiError } from "../../http/errors";
import { verifyGoogleCredential } from "./google";

const CLIENT_ID = "grid-test.apps.googleusercontent.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };
const deps = {
	db: {} as Database,
	config: createConfig(parseEnv({ NODE_ENV: "test", GOOGLE_CLIENT_ID: CLIENT_ID })),
	googleKeys: createLocalJWKSet({ keys: [jwk] }),
};

/** An ID token shaped like Google's, signed with the test key. */
function idToken(claims: Record<string, unknown>, overrides: { aud?: string; iss?: string } = {}) {
	return new SignJWT({
		email: "Person@Example.com",
		email_verified: true,
		name: "Person",
		...claims,
	})
		.setProtectedHeader({ alg: "RS256", kid: "test" })
		.setSubject("google-123")
		.setAudience(overrides.aud ?? CLIENT_ID)
		.setIssuer(overrides.iss ?? "https://accounts.google.com")
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(privateKey);
}

const code = async (work: Promise<unknown>) => {
	try {
		await work;
	} catch (error) {
		return error instanceof ApiError ? error.code : String(error);
	}
	return "accepted";
};

describe("Google ID tokens", () => {
	it("accepts a token for this app with a verified email", async () => {
		expect(await verifyGoogleCredential(deps, await idToken({}))).toEqual({
			subject: "google-123",
			email: "person@example.com",
			name: "Person",
			picture: null,
		});
	});

	it("refuses another app's token, another issuer, and unverified emails", async () => {
		expect(
			await code(verifyGoogleCredential(deps, await idToken({}, { aud: "someone-else" }))),
		).toBe("GOOGLE_CREDENTIAL_INVALID");
		expect(
			await code(verifyGoogleCredential(deps, await idToken({}, { iss: "https://evil.example" }))),
		).toBe("GOOGLE_CREDENTIAL_INVALID");
		expect(await code(verifyGoogleCredential(deps, await idToken({ email_verified: false })))).toBe(
			"GOOGLE_CREDENTIAL_INVALID",
		);
		expect(await code(verifyGoogleCredential(deps, "not.a.token"))).toBe(
			"GOOGLE_CREDENTIAL_INVALID",
		);
	});

	it("says so when Google sign-in is not configured", async () => {
		const off = { ...deps, config: createConfig(parseEnv({ NODE_ENV: "test" })) };
		expect(await code(verifyGoogleCredential(off, await idToken({})))).toBe(
			"GOOGLE_AUTH_NOT_CONFIGURED",
		);
	});
});
