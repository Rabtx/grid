import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";

import type { AccessTokenPayload, AppEnv } from "./context";
import { unauthorized } from "./errors";

/** What the access-token check needs to know about sessions and users. */
export type SessionLookup = {
	session: (
		id: string,
	) => Promise<{ userId: string; revokedAt: Date | null; expiresAt: Date } | null>;
	userIsActive: (id: string) => Promise<boolean>;
};

const invalidSession = () =>
	unauthorized({ code: "AUTH_SESSION_INVALID", message: "Session is no longer active" });

/** A signed, unexpired access token's claims (HS256, `sub` and `sid`). */
export async function verifyAccessToken(
	token: string,
	secret: string,
): Promise<AccessTokenPayload> {
	try {
		const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
			algorithms: ["HS256"],
		});
		if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
			throw new Error("Missing token claims");
		}
		return { sub: payload.sub, sid: payload.sid };
	} catch {
		throw unauthorized({
			code: "AUTH_ACCESS_TOKEN_INVALID",
			message: "Invalid or expired access token",
		});
	}
}

/**
 * Routes behind sign-in: a valid `Bearer` access token whose session is still live and whose
 * user is active. The claims are then `c.get("user")`.
 */
export function requireUser(lookup: SessionLookup) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const header = c.req.header("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
		if (!token) throw unauthorized({ code: "AUTH_REQUIRED", message: "Authentication required" });
		const payload = await verifyAccessToken(token, c.get("config").jwtSecret);
		const session = await lookup.session(payload.sid);
		if (
			!session ||
			session.revokedAt !== null ||
			session.expiresAt <= new Date() ||
			session.userId !== payload.sub
		) {
			throw invalidSession();
		}
		if (!(await lookup.userIsActive(payload.sub))) throw invalidSession();
		c.set("user", payload);
		await next();
	});
}
