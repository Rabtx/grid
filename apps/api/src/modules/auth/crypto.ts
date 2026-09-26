import { randomInt, timingSafeEqual } from "node:crypto";

import { SignJWT } from "jose";

import type { AccessTokenPayload } from "../../http/context";

/**
 * Codes, tokens and hashes, byte-for-byte as NestJS made them, so a code sent by one API is
 * accepted by the other and sessions survive the switch. HMACs use Bun's own hasher.
 */
export type ChallengePurpose = "email_verification" | "password_reset" | "magic_link" | "mfa_login";

const hmac = (secret: string, value: string) =>
	new Bun.CryptoHasher("sha256", secret).update(value).digest("hex");

const sha256 = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

const randomBase64Url = (bytes: number) =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");

function sameHex(actual: string, expected: string): boolean {
	const a = Buffer.from(actual, "hex");
	const b = Buffer.from(expected, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

/** A `<uuid>.<secret>` token's id, or null when it is not one. */
function tokenId(token: string): string | null {
	const [id, secret, ...rest] = token.split(".");
	return id && secret && rest.length === 0 ? id : null;
}

export function authCrypto(secrets: { authTokenSecret: string; jwtSecret: string }) {
	const hashOtp = (purpose: ChallengePurpose, email: string, code: string) =>
		hmac(secrets.authTokenSecret, `${purpose}:${email}:${code}`);

	return {
		generateOtp: () => randomInt(100_000, 1_000_000).toString(),
		hashOtp,
		verifyOtp: (purpose: ChallengePurpose, email: string, code: string, expected: string) =>
			sameHex(hashOtp(purpose, email, code), expected),

		createChallengeToken: (id: string) => `${id}.${randomBase64Url(32)}`,
		challengeId: tokenId,
		// A challenge token is hashed exactly like a code.
		hashChallengeToken: hashOtp,
		verifyChallengeToken: (
			purpose: ChallengePurpose,
			email: string,
			token: string,
			expected: string,
		) => sameHex(hashOtp(purpose, email, token), expected),

		createRefreshToken: (sessionId: string) => `${sessionId}.${randomBase64Url(48)}`,
		hashRefreshToken: sha256,
		verifyRefreshToken: (token: string, expected: string) => sameHex(sha256(token), expected),
		sessionIdFromRefreshToken: tokenId,

		async signAccessToken(payload: AccessTokenPayload, expiresIn: string) {
			const expiresAt = new Date(Date.now() + durationMs(expiresIn));
			const token = await new SignJWT({ sid: payload.sid })
				.setProtectedHeader({ alg: "HS256", typ: "JWT" })
				.setSubject(payload.sub)
				.setIssuedAt()
				.setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
				.sign(new TextEncoder().encode(secrets.jwtSecret));
			return { token, expiresAt };
		},
	};
}

export type AuthCrypto = ReturnType<typeof authCrypto>;

/** `15m`, `1h`, `30d`… in milliseconds. */
export function durationMs(value: string): number {
	const match = /^(\d+)([smhd])$/.exec(value);
	if (!match) throw new Error(`Invalid duration: ${value}`);
	const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
		match[2] as "s" | "m" | "h" | "d"
	];
	return Number(match[1]) * unit;
}
