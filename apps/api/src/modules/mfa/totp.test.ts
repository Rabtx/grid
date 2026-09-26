import { describe, expect, it } from "bun:test";
import { createCipheriv, createHmac, randomBytes, createHash } from "node:crypto";

import { decryptSecret, encryptSecret, hashRecoveryCode } from "../auth/secrets";
import {
	base32Decode,
	base32Encode,
	generateTotpSecret,
	totpAt,
	totpCode,
	verifyTotp,
} from "./totp";

describe("TOTP", () => {
	it("matches RFC 6238's SHA-1 test vectors (last 6 digits)", () => {
		const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
		expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
		const vectors: [number, string][] = [
			[59, "287082"],
			[1111111109, "081804"],
			[1111111111, "050471"],
			[1234567890, "005924"],
			[2000000000, "279037"],
			[20000000000, "353130"],
		];
		for (const [time, code] of vectors) expect(totpCode(secret, time)).toBe(code);
	});

	it("round-trips base32 and makes 32-character secrets", () => {
		const secret = generateTotpSecret();
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(base32Encode(base32Decode(secret))).toBe(secret);
	});

	it("accepts codes from 30 seconds before to 30 seconds after, like before", () => {
		const secret = generateTotpSecret();
		const now = 1_800_000_015;
		for (const offset of [-30, -15, 0, 15, 30]) {
			expect(verifyTotp(secret, totpCode(secret, now + offset), now)).toBe(true);
		}
		expect(verifyTotp(secret, totpAt(secret, Math.floor((now - 90) / 30)), now)).toBe(false);
		expect(verifyTotp(secret, totpAt(secret, Math.floor((now + 90) / 30)), now)).toBe(false);
		expect(verifyTotp(secret, "12345", now)).toBe(false);
		expect(verifyTotp(secret, "abcdef", now)).toBe(false);
	});
});

describe("encrypted secrets", () => {
	const authTokenSecret = "token-secret-token-secret-token-secret";

	it("decrypts what the old API encrypted", async () => {
		// The old API's encryptSecret, verbatim in behaviour.
		const iv = randomBytes(12);
		const cipher = createCipheriv(
			"aes-256-gcm",
			createHash("sha256").update(authTokenSecret).digest(),
			iv,
		);
		const encrypted = Buffer.concat([cipher.update("JBSWY3DPEHPK3PXP", "utf8"), cipher.final()]);
		const old = [iv, cipher.getAuthTag(), encrypted]
			.map((part) => part.toString("base64url"))
			.join(".");
		expect(await decryptSecret(authTokenSecret, old)).toBe("JBSWY3DPEHPK3PXP");
	});

	it("round-trips, and refuses tampering and another key", async () => {
		const sealed = await encryptSecret(authTokenSecret, "JBSWY3DPEHPK3PXP");
		expect(sealed.split(".")).toHaveLength(3);
		expect(await decryptSecret(authTokenSecret, sealed)).toBe("JBSWY3DPEHPK3PXP");
		const [iv, tag, data] = sealed.split(".");
		const flipped = `${iv}.${tag}.${(data ?? "").replace(/^./, (c) => (c === "A" ? "B" : "A"))}`;
		await expect(decryptSecret(authTokenSecret, flipped)).rejects.toThrow();
		await expect(decryptSecret("another-secret-another-secret-1234", sealed)).rejects.toThrow();
	});

	it("hashes recovery codes as before", () => {
		const expected = createHmac("sha256", authTokenSecret)
			.update("recovery:abcd-ef01")
			.digest("hex");
		expect(hashRecoveryCode(authTokenSecret, "  ABCD-EF01 ")).toBe(expected);
	});
});
