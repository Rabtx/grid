import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { clientIp, rateLimit } from "../../http/rate-limit";
import { noContent, ok } from "../../http/respond";
import { body, uuidV4 } from "../../http/validate";
import { clearRefreshCookie, isNativeClient, readRefreshCookie, setRefreshCookie } from "./cookies";
import { csrf } from "./csrf";
import * as flows from "./flows";
import type { AuthDeps, MfaChallenge, SessionResult } from "./flows";
import {
	changePasswordBodySchema,
	emailBodySchema,
	loginBodySchema,
	magicLinkBodySchema,
	refreshBodySchema,
	registerBodySchema,
	resetPasswordBodySchema,
	verifyEmailBodySchema,
} from "./schemas";

const perMinute = (limit: number) => rateLimit({ limit, windowMs: 60_000 });

const metadata = (c: AppContext) => ({
	ipAddress: clientIp(c) === "unknown" ? null : clientIp(c),
	userAgent: c.req.header("user-agent") ?? null,
});

/** A new session's reply: the refresh token in the cookie, and in the body only for native apps. */
function presentSession(c: AppContext, result: SessionResult) {
	setRefreshCookie(c, result.refreshToken);
	if (isNativeClient(c)) return result;
	const { refreshToken: _refreshToken, ...rest } = result;
	return rest;
}

function presentLogin(c: AppContext, result: SessionResult | MfaChallenge) {
	return "requiresTwoFactor" in result ? result : presentSession(c, result);
}

/** The refresh token from the cookie, or (native apps) the body. */
async function refreshToken(c: AppContext): Promise<string> {
	const { refreshToken } = await body(c.req, refreshBodySchema);
	return readRefreshCookie(c) ?? refreshToken ?? "";
}

/**
 * `/auth`: sign-up, email verification, sign-in with a refresh-token session, refresh, sign-out,
 * password reset and change, and the session list. 2FA completion, passkeys and Google are still
 * served by NestJS (they fall through to it).
 */
export function authRoutes(deps: AuthDeps & { sessions: SessionLookup }): Hono<AppEnv> {
	const signedIn = requireUser(deps.sessions);
	return new Hono<AppEnv>()
		.post("/register", perMinute(5), csrf, async (c) =>
			ok(c, await flows.register(deps, await body(c.req, registerBodySchema)), 201),
		)
		.post("/verify-email", perMinute(8), csrf, async (c) =>
			ok(c, await flows.verifyEmail(deps, await body(c.req, verifyEmailBodySchema))),
		)
		.post("/resend-verification", perMinute(3), csrf, async (c) =>
			ok(c, await flows.resendVerification(deps, await body(c.req, emailBodySchema)), 202),
		)
		.post("/login", perMinute(8), csrf, async (c) => {
			const result = await flows.login(deps, await body(c.req, loginBodySchema), metadata(c));
			return ok(c, presentLogin(c, result));
		})
		.post("/refresh", perMinute(30), csrf, async (c) =>
			ok(c, presentSession(c, await flows.refresh(deps, await refreshToken(c)))),
		)
		.post("/logout", csrf, async (c) => {
			await flows.logout(deps, await refreshToken(c));
			clearRefreshCookie(c);
			return noContent(c);
		})
		.post("/logout-all", csrf, signedIn, async (c) => {
			await flows.logoutAll(deps, c.get("user").sub);
			clearRefreshCookie(c);
			return noContent(c);
		})
		.get("/me", csrf, signedIn, async (c) => ok(c, await flows.me(deps, c.get("user").sub)))
		.post("/forgot-password", perMinute(3), csrf, async (c) =>
			ok(c, await flows.forgotPassword(deps, await body(c.req, emailBodySchema)), 202),
		)
		.post("/reset-password", perMinute(8), csrf, async (c) =>
			ok(c, await flows.resetPassword(deps, await body(c.req, resetPasswordBodySchema))),
		)
		.post("/change-password", csrf, signedIn, async (c) =>
			ok(
				c,
				await flows.changePassword(
					deps,
					c.get("user"),
					await body(c.req, changePasswordBodySchema),
				),
			),
		)
		.get("/sessions", csrf, signedIn, async (c) =>
			ok(c, await flows.listSessions(deps, c.get("user"))),
		)
		.delete("/sessions/:sessionId", csrf, signedIn, async (c) => {
			const sessionId = uuidV4(c.req.param("sessionId"));
			const result = await flows.revokeSession(deps, c.get("user"), sessionId);
			if (result.current) clearRefreshCookie(c);
			return ok(c, { revoked: true as const });
		})
		.get("/methods", csrf, (c) =>
			ok(c, { google: { enabled: Boolean(c.get("config").googleClientId) } }),
		)
		.post("/methods/magic-link/request", perMinute(3), csrf, async (c) =>
			ok(c, await flows.requestMagicLink(deps, await body(c.req, emailBodySchema)), 202),
		)
		.post("/methods/magic-link/consume", perMinute(8), csrf, async (c) => {
			const { token } = await body(c.req, magicLinkBodySchema);
			return ok(c, presentSession(c, await flows.consumeMagicLink(deps, token, metadata(c))));
		});
}
