import type { Database } from "@grid/db";
import { hashPassword, verifyPassword } from "@grid/db/password";

import type { AppConfig } from "../../config/config";
import { isProduction } from "../../config/config";
import type { AccessTokenPayload } from "../../http/context";
import { forbidden, locked, unauthorized } from "../../http/errors";
import {
	type EmailSender,
	sendMagicLink,
	sendPasswordResetCode,
	sendVerificationCode,
} from "../email/email";
import {
	createUser,
	currentUser,
	findUserByEmail,
	findUserById,
	markEmailVerified,
	normalizeEmail,
	type PublicUser,
	recordFailedLogin,
	resetFailedLogins,
	toPublicUser,
	type UserRecord,
} from "../users/users";
import { isSignupOpen, signupClosed } from "../instance/instance";
import { verifyLoginCode } from "../mfa/mfa";
import {
	acceptInvite,
	emailMismatch,
	findPendingInvite,
	inviteInvalid,
} from "../workspaces/invites";
import type { AuthCrypto, ChallengePurpose } from "./crypto";
import * as store from "./store";
import type { ChallengeRecord, RequestMetadata } from "./store";

export type AuthDeps = {
	db: Database;
	config: AppConfig;
	crypto: AuthCrypto;
	send: EmailSender;
};

export type AuthChallengeResult = {
	accepted: true;
	message: string;
	developmentCode?: string;
	developmentToken?: string;
};

/** A new session: the refresh token goes in a cookie (or to a native app), never in logs. */
export type SessionResult = {
	accessToken: string;
	accessTokenExpiresAt: string;
	refreshToken: string;
	user: PublicUser;
};

export type MfaChallenge = {
	requiresTwoFactor: true;
	challengeToken: string;
	expiresAt: string;
	methods: ["totp", "recovery_code"];
};

const accepted = (message: string): AuthChallengeResult => ({ accepted: true, message });

const invalidCredentials = () =>
	unauthorized({ code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password" });
const invalidRefreshToken = () =>
	unauthorized({ code: "AUTH_REFRESH_TOKEN_INVALID", message: "Session could not be refreshed" });
const invalidOtp = () =>
	unauthorized({ code: "AUTH_OTP_INVALID", message: "The code is invalid or expired" });
const invalidMagicLink = () =>
	unauthorized({ code: "MAGIC_LINK_INVALID", message: "The sign-in link is invalid or expired" });

const exposeCodes = (config: AppConfig) => !isProduction(config) && config.authDevExposeCodes;
const hash = (deps: AuthDeps, password: string) =>
	hashPassword(password, deps.config.passwordBcryptRounds);

function isLive(session: store.SessionRecord | null): session is store.SessionRecord {
	return session !== null && session.revokedAt === null && session.expiresAt > new Date();
}

/**
 * Sign-up: open to anyone only when this Grid's owner has opened it; otherwise it takes an invite,
 * which the new account accepts straight away. An invite sent to this email already proves the
 * address, so that account starts verified.
 */
export async function register(
	deps: AuthDeps,
	body: { email: string; username: string; password: string; inviteToken?: string },
): Promise<AuthChallengeResult & { user: PublicUser }> {
	const { inviteToken, ...account } = body;
	const invite = inviteToken ? await findPendingInvite(deps.db, inviteToken) : null;
	if (inviteToken && !invite) throw inviteInvalid();
	if (!invite && !(await isSignupOpen(deps.db))) throw signupClosed();
	if (invite?.invite.email && invite.invite.email !== normalizeEmail(account.email))
		throw emailMismatch();
	const created = await createUser(deps.db, {
		...account,
		passwordHash: await hash(deps, account.password),
	});
	if (invite && inviteToken) await acceptInvite(deps.db, inviteToken, created);
	if (invite?.invite.email === created.email) {
		const user = (await markEmailVerified(deps.db, created.id)) ?? created;
		return { ...accepted("Your account is ready."), user: toPublicUser(user) };
	}
	return {
		...(await issueCode(deps, created, "email_verification")),
		user: toPublicUser(created),
	};
}

export async function verifyEmail(
	deps: AuthDeps,
	body: { email: string; code: string },
): Promise<PublicUser> {
	const user = await findUserByEmail(deps.db, body.email);
	if (!user) throw invalidOtp();
	if (user.emailVerifiedAt) return toPublicUser(user);
	const challenge = await checkCode(deps, body.email, "email_verification", body.code);
	await store.completeEmailVerification(deps.db, challenge.id, user.id);
	const verified = await findUserById(deps.db, user.id);
	if (!verified) throw new Error("Verified user could not be loaded");
	return toPublicUser(verified);
}

export async function resendVerification(deps: AuthDeps, body: { email: string }) {
	const user = await findUserByEmail(deps.db, body.email);
	if (!user || user.emailVerifiedAt) {
		return accepted("If the account requires verification, a code has been sent.");
	}
	return issueCode(deps, user, "email_verification");
}

export async function login(
	deps: AuthDeps,
	body: { email: string; password: string },
	metadata: RequestMetadata,
): Promise<SessionResult | MfaChallenge> {
	const user = await findUserByEmail(deps.db, body.email);
	if (!user) {
		// The same work as a real check, so timing does not tell which emails have accounts.
		await hash(deps, body.password);
		throw invalidCredentials();
	}
	const lockedNow = Boolean(user.lockedUntil && user.lockedUntil > new Date());
	const valid = user.passwordHash
		? await verifyPassword(body.password, user.passwordHash)
		: (await hash(deps, body.password), false);
	if (!valid) {
		// A wrong password answers the same way whether or not the account exists or is locked:
		// reporting "locked" here instead would turn the lockout into a way to discover which
		// emails are registered. Only a correct password gets to hear about it.
		if (!lockedNow) {
			await recordFailedLogin(deps.db, user, {
				maxAttempts: deps.config.maxLoginAttempts,
				lockMinutes: deps.config.loginLockMinutes,
			});
		}
		throw invalidCredentials();
	}
	if (lockedNow) {
		throw locked({
			code: "AUTH_ACCOUNT_LOCKED",
			message: "Too many failed attempts. Try again later.",
		});
	}
	if (!user.isActive) {
		throw unauthorized({ code: "AUTH_ACCOUNT_INACTIVE", message: "This account is inactive" });
	}
	if (!user.emailVerifiedAt) {
		throw forbidden({
			code: "AUTH_EMAIL_NOT_VERIFIED",
			message: "Verify your email before signing in",
		});
	}
	await resetFailedLogins(deps.db, user.id);
	return signInAs(deps, user, metadata);
}

/**
 * The end of every first-factor sign-in (a password, an emailed link, Google): a session, or for an
 * account with an authenticator the challenge its code answers. One place, so no way in skips it.
 */
export async function signInAs(
	deps: AuthDeps,
	user: UserRecord,
	metadata: RequestMetadata,
): Promise<SessionResult | MfaChallenge> {
	if (await store.isTotpEnabled(deps.db, user.id)) return mfaChallenge(deps, user);
	return createSession(deps, user, metadata);
}

/** The second step for accounts with 2FA: the login's challenge plus a code or recovery code. */
export async function completeMfaLogin(
	deps: AuthDeps,
	body: { challengeToken: string; code: string },
	metadata: RequestMetadata,
): Promise<SessionResult> {
	const challenge = await tokenChallenge(deps, body.challengeToken, "mfa_login");
	if (!(await verifyLoginCode(deps, challenge.userId, body.code))) {
		await store.recordChallengeAttempt(deps.db, challenge.id, deps.config.otpMaxAttempts);
		throw invalidOtp();
	}
	if (!(await store.consumeChallenge(deps.db, challenge.id))) throw invalidOtp();
	const user = await findUserById(deps.db, challenge.userId);
	if (!user?.isActive) throw invalidCredentials();
	return createSession(deps, user, metadata);
}

export async function requestMagicLink(deps: AuthDeps, body: { email: string }) {
	const user = await findUserByEmail(deps.db, body.email);
	const result = accepted("If an account exists, a secure sign-in link has been sent.");
	if (!user?.isActive || !user.emailVerifiedAt) return result;
	const id = crypto.randomUUID();
	const token = deps.crypto.createChallengeToken(id);
	await store.createChallenge(deps.db, {
		id,
		userId: user.id,
		email: user.email,
		purpose: "magic_link",
		codeHash: deps.crypto.hashChallengeToken("magic_link", user.email, token),
		expiresAt: new Date(Date.now() + deps.config.magicLinkTtlMinutes * 60_000),
	});
	await sendMagicLink(
		deps.send,
		user.email,
		`${deps.config.consoleUrl}/magic-link?token=${encodeURIComponent(token)}`,
	);
	return { ...result, ...(exposeCodes(deps.config) ? { developmentToken: token } : {}) };
}

export async function consumeMagicLink(
	deps: AuthDeps,
	token: string,
	metadata: RequestMetadata,
): Promise<SessionResult | MfaChallenge> {
	const challenge = await tokenChallenge(deps, token, "magic_link");
	if (!(await store.consumeChallenge(deps.db, challenge.id))) throw invalidMagicLink();
	const user = await findUserById(deps.db, challenge.userId);
	if (!user?.isActive) throw invalidMagicLink();
	// The link stands in for the password, not for the second factor: an account with an
	// authenticator still has to give its code, or getting into someone's email would be enough.
	return signInAs(deps, user, metadata);
}

export async function refresh(deps: AuthDeps, refreshToken: string): Promise<SessionResult> {
	const sessionId = deps.crypto.sessionIdFromRefreshToken(refreshToken);
	if (!sessionId) throw invalidRefreshToken();
	const session = await store.findSession(deps.db, sessionId);
	if (!isLive(session)) throw invalidRefreshToken();
	if (!deps.crypto.verifyRefreshToken(refreshToken, session.refreshTokenHash)) {
		// An old token for a live session: it was copied. End the session for everyone holding it.
		await store.revokeSession(deps.db, session.id, session.userId, "refresh_token_reuse");
		throw invalidRefreshToken();
	}
	const user = await findUserById(deps.db, session.userId);
	if (!user?.isActive) {
		await store.revokeSession(deps.db, session.id, session.userId, "user_inactive");
		throw invalidRefreshToken();
	}
	const next = deps.crypto.createRefreshToken(session.id);
	const rotated = await store.rotateSession(
		deps.db,
		session.id,
		session.refreshTokenHash,
		deps.crypto.hashRefreshToken(next),
		sessionExpiry(deps),
	);
	if (!rotated) throw invalidRefreshToken();
	return sessionResult(deps, user, rotated.id, next);
}

export async function logout(
	deps: AuthDeps,
	refreshToken: string | null,
	access: AccessTokenPayload | null = null,
): Promise<void> {
	if (access) {
		// The route verified this JWT. Rotation changes the cookie hash, never its session owner.
		await store.revokeSession(deps.db, access.sid, access.sub, "logout");
		return;
	}
	const sessionId = refreshToken ? deps.crypto.sessionIdFromRefreshToken(refreshToken) : null;
	if (!refreshToken || !sessionId) return;
	const session = await store.findSession(deps.db, sessionId);
	if (session && deps.crypto.verifyRefreshToken(refreshToken, session.refreshTokenHash)) {
		await store.revokeSession(deps.db, session.id, session.userId, "logout");
	}
}

export const logoutAll = (deps: AuthDeps, userId: string) =>
	store.revokeAllSessions(deps.db, userId, "logout_all");

export const me = (deps: AuthDeps, userId: string) => currentUser(deps.db, userId);

export async function forgotPassword(deps: AuthDeps, body: { email: string }) {
	const user = await findUserByEmail(deps.db, body.email);
	if (!user?.isActive)
		return accepted("If an account exists, a password reset code has been sent.");
	return issueCode(deps, user, "password_reset");
}

export async function resetPassword(
	deps: AuthDeps,
	body: { email: string; code: string; newPassword: string },
) {
	const user = await findUserByEmail(deps.db, body.email);
	if (!user) throw invalidOtp();
	const challenge = await checkCode(deps, body.email, "password_reset", body.code);
	await store.completePasswordReset(deps.db, {
		challengeId: challenge.id,
		userId: user.id,
		passwordHash: await hash(deps, body.newPassword),
	});
	return accepted("Password reset successfully. Sign in with your new password.");
}

export async function changePassword(
	deps: AuthDeps,
	user: AccessTokenPayload,
	body: { currentPassword: string; newPassword: string },
) {
	const record = await findUserById(deps.db, user.sub);
	if (!record?.passwordHash || !(await verifyPassword(body.currentPassword, record.passwordHash))) {
		throw unauthorized({
			code: "AUTH_CURRENT_PASSWORD_INVALID",
			message: "Current password is incorrect",
		});
	}
	await store.changePassword(deps.db, {
		userId: user.sub,
		currentSessionId: user.sid,
		passwordHash: await hash(deps, body.newPassword),
	});
	return accepted("Password changed successfully. Other sessions were signed out.");
}

export async function listSessions(deps: AuthDeps, user: AccessTokenPayload) {
	const sessions = await store.listActiveSessions(deps.db, user.sub);
	return sessions.map((session) => ({
		id: session.id,
		userAgent: session.userAgent,
		ipAddress: session.ipAddress,
		createdAt: session.createdAt.toISOString(),
		lastUsedAt: session.lastUsedAt.toISOString(),
		expiresAt: session.expiresAt.toISOString(),
		isCurrent: session.id === user.sid,
	}));
}

export async function revokeSession(deps: AuthDeps, user: AccessTokenPayload, sessionId: string) {
	await store.revokeSession(deps.db, sessionId, user.sub, "user_revoked");
	return { current: sessionId === user.sid };
}

/** Sessions for other sign-in methods (2FA, passkeys, Google) once they move here. */
export async function createSession(
	deps: AuthDeps,
	user: UserRecord,
	metadata: RequestMetadata,
): Promise<SessionResult> {
	const id = crypto.randomUUID();
	const refreshToken = deps.crypto.createRefreshToken(id);
	await store.createSession(deps.db, {
		id,
		userId: user.id,
		refreshTokenHash: deps.crypto.hashRefreshToken(refreshToken),
		expiresAt: sessionExpiry(deps),
		metadata,
	});
	return sessionResult(deps, user, id, refreshToken);
}

async function mfaChallenge(deps: AuthDeps, user: UserRecord): Promise<MfaChallenge> {
	const id = crypto.randomUUID();
	const token = deps.crypto.createChallengeToken(id);
	const expiresAt = new Date(Date.now() + deps.config.mfaChallengeTtlMinutes * 60_000);
	await store.createChallenge(deps.db, {
		id,
		userId: user.id,
		email: user.email,
		purpose: "mfa_login",
		codeHash: deps.crypto.hashChallengeToken("mfa_login", user.email, token),
		expiresAt,
	});
	return {
		requiresTwoFactor: true,
		challengeToken: token,
		expiresAt: expiresAt.toISOString(),
		methods: ["totp", "recovery_code"],
	};
}

async function tokenChallenge(
	deps: AuthDeps,
	token: string,
	purpose: "magic_link" | "mfa_login",
): Promise<ChallengeRecord> {
	const id = deps.crypto.challengeId(token);
	const challenge = id ? await store.findChallenge(deps.db, id) : null;
	if (
		!challenge ||
		challenge.purpose !== purpose ||
		challenge.consumedAt ||
		challenge.expiresAt <= new Date() ||
		challenge.attempts >= deps.config.otpMaxAttempts ||
		!deps.crypto.verifyChallengeToken(purpose, challenge.email, token, challenge.codeHash)
	) {
		throw purpose === "magic_link" ? invalidMagicLink() : invalidOtp();
	}
	return challenge;
}

async function sessionResult(
	deps: AuthDeps,
	user: UserRecord,
	sessionId: string,
	refreshToken: string,
): Promise<SessionResult> {
	const access = await deps.crypto.signAccessToken(
		{ sub: user.id, sid: sessionId },
		deps.config.jwtAccessExpiresIn,
	);
	return {
		accessToken: access.token,
		accessTokenExpiresAt: access.expiresAt.toISOString(),
		refreshToken,
		user: toPublicUser(user),
	};
}

async function issueCode(
	deps: AuthDeps,
	user: UserRecord,
	purpose: "email_verification" | "password_reset",
): Promise<AuthChallengeResult> {
	const code = deps.crypto.generateOtp();
	await store.createChallenge(deps.db, {
		userId: user.id,
		email: user.email,
		purpose,
		codeHash: deps.crypto.hashOtp(purpose, user.email, code),
		expiresAt: new Date(Date.now() + deps.config.otpTtlMinutes * 60_000),
	});
	if (purpose === "email_verification") await sendVerificationCode(deps.send, user.email, code);
	else await sendPasswordResetCode(deps.send, user.email, code);
	return {
		accepted: true,
		message:
			purpose === "email_verification"
				? "A verification code has been sent."
				: "If an account exists, a password reset code has been sent.",
		...(exposeCodes(deps.config) ? { developmentCode: code } : {}),
	};
}

async function checkCode(
	deps: AuthDeps,
	email: string,
	purpose: ChallengePurpose,
	code: string,
): Promise<ChallengeRecord> {
	const challenge = await store.findLatestChallenge(deps.db, email, purpose);
	if (
		!challenge ||
		challenge.expiresAt <= new Date() ||
		challenge.attempts >= deps.config.otpMaxAttempts
	) {
		throw invalidOtp();
	}
	if (!deps.crypto.verifyOtp(purpose, email, code, challenge.codeHash)) {
		await store.recordChallengeAttempt(deps.db, challenge.id, deps.config.otpMaxAttempts);
		throw invalidOtp();
	}
	return challenge;
}

const sessionExpiry = (deps: AuthDeps) =>
	new Date(Date.now() + deps.config.sessionTtlDays * 86_400_000);
