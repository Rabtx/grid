import { describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";

import { authCrypto, durationMs } from "./crypto";

const secrets = {
	authTokenSecret: "token-secret-token-secret-token-secret",
	jwtSecret: "jwt-secret-jwt-secret-jwt-secret-jwt",
};
const c = authCrypto(secrets);

describe("auth crypto matches what is already stored", () => {
	it("hashes codes as HMAC-SHA256 of purpose:email:code", () => {
		const expected = createHmac("sha256", secrets.authTokenSecret)
			.update("password_reset:a@b.c:123456")
			.digest("hex");
		expect(c.hashOtp("password_reset", "a@b.c", "123456")).toBe(expected);
		expect(c.verifyOtp("password_reset", "a@b.c", "123456", expected)).toBe(true);
		expect(c.verifyOtp("password_reset", "a@b.c", "654321", expected)).toBe(false);
		expect(c.verifyOtp("email_verification", "a@b.c", "123456", expected)).toBe(false);
	});

	it("hashes refresh tokens as plain SHA-256", () => {
		const token = c.createRefreshToken("0b8e7c9c-1c2d-4c2d-9262-0242ac120002");
		expect(c.hashRefreshToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
		expect(c.verifyRefreshToken(token, c.hashRefreshToken(token))).toBe(true);
		expect(c.sessionIdFromRefreshToken(token)).toBe("0b8e7c9c-1c2d-4c2d-9262-0242ac120002");
	});

	it("reads ids only from well-formed tokens", () => {
		// The id goes into a uuid column: anything else must be refused here, so a made-up one
		// answers 401 instead of reaching Postgres and coming back as a 500.
		const id = "0b8e7c9c-1c2d-4c2d-9262-0242ac120002";
		expect(c.challengeId(`${id}.secret`)).toBe(id);
		expect(c.challengeId("abc.def")).toBeNull();
		expect(c.challengeId("abc")).toBeNull();
		expect(c.challengeId("a.b.c")).toBeNull();
		expect(c.challengeId(".secret")).toBeNull();
		expect(c.sessionIdFromRefreshToken(".secret")).toBeNull();
	});

	it("makes six-digit codes and long random tokens", () => {
		for (let i = 0; i < 50; i++) expect(c.generateOtp()).toMatch(/^[1-9]\d{5}$/);
		expect(c.createChallengeToken("id").split(".")[1]).toHaveLength(43);
		expect(c.createRefreshToken("id").split(".")[1]).toHaveLength(64);
	});

	it("parses durations", () => {
		expect(durationMs("15m")).toBe(900_000);
		expect(durationMs("2h")).toBe(7_200_000);
		expect(() => durationMs("15 minutes")).toThrow();
	});
});
