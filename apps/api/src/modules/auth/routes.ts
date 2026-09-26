import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import type { JWTVerifyGetKey } from "jose";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { clientIp, rateLimit } from "../../http/rate-limit";
import { noContent, ok } from "../../http/respond";
import { body, uuidV4 } from "../../http/validate";
import { clearRefreshCookie, isNativeClient, readRefreshCookie, setRefreshCookie } from "./cookies";
import { csrf } from "./csrf";
import * as flows from "./flows";
import type { AuthDeps, MfaChallenge, SessionResult } from "./flows";
import * as mfa from "../mfa/mfa";
import * as passkeys from "../passkeys/passkeys";
import * as google from "../social/google";
import {
	challengeTokenBodySchema,
	changePasswordBodySchema,
	emailBodySchema,
	googleCredentialBodySchema,
	passkeyAuthenticationBodySchema,
	passkeyOptionsBodySchema,
	passkeyRegistrationBodySchema,
	totpCodeBodySchema,
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

export type AuthRouteDeps = AuthDeps & {
	sessions: SessionLookup;
	/** Google's signing keys; tests pass their own. */
	googleKeys?: JWTVerifyGetKey;
};

/**
 * `/auth`: sign-up, email verification, sign-in (password, 2FA, magic link, passkey, Google)
 * with a refresh-token session, refresh, sign-out, password reset and change, sessions, and
 * `/auth/security` for managing 2FA, passkeys and Google.
 */
export function authRoutes(deps: AuthRouteDeps): Hono<AppEnv> {
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
		})
		.post("/methods/two-factor/verify", perMinute(8), csrf, async (c) => {
			const input = await body(c.req, challengeTokenBodySchema);
			return ok(c, presentSession(c, await flows.completeMfaLogin(deps, input, metadata(c))));
		})
		.post("/methods/google", perMinute(10), csrf, async (c) => {
			const { credential } = await body(c.req, googleCredentialBodySchema);
			const user = await google.authenticateGoogle(deps, credential);
			return ok(c, presentSession(c, await flows.createSession(deps, user, metadata(c))));
		})
		.post("/methods/passkeys/options", perMinute(10), csrf, async (c) => {
			const { email } = await body(c.req, passkeyOptionsBodySchema);
			return ok(c, await passkeys.beginAuthentication(deps, email), 201);
		})
		.post("/methods/passkeys/verify", perMinute(10), csrf, async (c) => {
			const input = await body(c.req, passkeyAuthenticationBodySchema);
			const user = await passkeys.finishAuthentication(deps, {
				challengeId: input.challengeId,
				response: input.response as unknown as AuthenticationResponseJSON,
			});
			return ok(c, presentSession(c, await flows.createSession(deps, user, metadata(c))));
		})
		.route("/security", securityRoutes(deps));
}

/**
 * `/auth/security`, signed in: 2FA setup and removal, passkeys, and connecting Google. Like
 * before, these POSTs answer 201 and take no CSRF check (the access token is a header).
 */
function securityRoutes(deps: AuthRouteDeps): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.use("*", requireUser(deps.sessions))
		.get("/", async (c) => {
			const userId = c.get("user").sub;
			const [mfaStatus, passkeyList, social] = await Promise.all([
				mfa.mfaStatus(deps, userId),
				passkeys.listPasskeys(deps, userId),
				google.googleStatus(deps.db, userId),
			]);
			return ok(c, { mfa: mfaStatus, passkeys: passkeyList, social });
		})
		.post("/totp/setup", async (c) => ok(c, await mfa.beginTotpSetup(deps, c.get("user").sub), 201))
		.post("/totp/confirm", async (c) => {
			const { code } = await body(c.req, totpCodeBodySchema);
			return ok(c, await mfa.confirmTotpSetup(deps, c.get("user").sub, code), 201);
		})
		.post("/totp/disable", async (c) => {
			const { code } = await body(c.req, totpCodeBodySchema);
			return ok(c, await mfa.disableTotp(deps, c.get("user").sub, code), 201);
		})
		.post("/passkeys/options", async (c) =>
			ok(c, await passkeys.beginRegistration(deps, c.get("user").sub), 201),
		)
		.post("/passkeys", async (c) => {
			const input = await body(c.req, passkeyRegistrationBodySchema);
			const passkey = await passkeys.finishRegistration(deps, {
				userId: c.get("user").sub,
				challengeId: input.challengeId,
				name: input.name,
				response: input.response as unknown as RegistrationResponseJSON,
			});
			return ok(c, passkey, 201);
		})
		.delete("/passkeys/:passkeyId", async (c) =>
			ok(
				c,
				await passkeys.removePasskey(deps, c.get("user").sub, uuidV4(c.req.param("passkeyId"))),
			),
		)
		.post("/google/link", async (c) => {
			const { credential } = await body(c.req, googleCredentialBodySchema);
			return ok(c, await google.linkGoogle(deps, c.get("user").sub, credential), 201);
		});
}
