import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

import type { AppConfig } from "../../config/config";
import { conflict, serviceUnavailable, unauthorized } from "../../http/errors";
import { isSignupOpen, signupClosed } from "../instance/instance";
import {
	createFederatedUser,
	findUserByEmail,
	findUserById,
	type UserRecord,
} from "../users/users";

const { authIdentities } = schema;

/** Google's signing keys, fetched and cached by jose (replaces google-auth-library). */
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

type Deps = { db: Database; config: AppConfig; googleKeys?: JWTVerifyGetKey };

export type GoogleProfile = {
	subject: string;
	email: string;
	name: string | null;
	picture: string | null;
};

const invalidCredential = () =>
	unauthorized({
		code: "GOOGLE_CREDENTIAL_INVALID",
		message: "Google sign-in could not be verified.",
	});

/** A Google ID token for this app, with a verified email: the checks Google's library made. */
export async function verifyGoogleCredential(
	deps: Deps,
	credential: string,
): Promise<GoogleProfile> {
	const audience = deps.config.googleClientId;
	if (!audience) {
		throw serviceUnavailable({
			code: "GOOGLE_AUTH_NOT_CONFIGURED",
			message: "Google sign-in is not configured.",
		});
	}
	try {
		const { payload } = await jwtVerify(credential, deps.googleKeys ?? GOOGLE_KEYS, {
			audience,
			issuer: GOOGLE_ISSUERS,
			algorithms: ["RS256"],
		});
		if (
			typeof payload.sub !== "string" ||
			typeof payload.email !== "string" ||
			payload.email_verified !== true
		) {
			throw new Error("Google identity is incomplete");
		}
		return {
			subject: payload.sub,
			email: payload.email.toLowerCase(),
			name: typeof payload.name === "string" ? payload.name : null,
			picture: typeof payload.picture === "string" ? payload.picture : null,
		};
	} catch {
		throw invalidCredential();
	}
}

async function findIdentity(db: Database, subject: string) {
	const [identity] = await db
		.select()
		.from(authIdentities)
		.where(and(eq(authIdentities.provider, "google"), eq(authIdentities.providerUserId, subject)))
		.limit(1);
	return identity ?? null;
}

const linkIdentity = (db: Database, userId: string, profile: GoogleProfile) =>
	db.insert(authIdentities).values({
		userId,
		provider: "google",
		providerUserId: profile.subject,
		email: profile.email,
	});

/**
 * The account a Google sign-in belongs to: the linked one, or a new one when the email is not
 * taken. An account that already has that email must connect Google itself first.
 */
export async function authenticateGoogle(deps: Deps, credential: string): Promise<UserRecord> {
	const profile = await verifyGoogleCredential(deps, credential);
	const identity = await findIdentity(deps.db, profile.subject);
	if (identity) {
		const user = await findUserById(deps.db, identity.userId);
		if (!user?.isActive) throw invalidCredential();
		return user;
	}
	if (await findUserByEmail(deps.db, profile.email)) {
		throw conflict({
			code: "SOCIAL_ACCOUNT_LINK_REQUIRED",
			message: "Sign in with your existing method, then connect Google in account security.",
		});
	}
	if (!(await isSignupOpen(deps.db))) throw signupClosed();
	const user = await createFederatedUser(deps.db, {
		email: profile.email,
		displayName: profile.name,
		avatarUrl: profile.picture,
	});
	await linkIdentity(deps.db, user.id, profile);
	return user;
}

export async function linkGoogle(deps: Deps, userId: string, credential: string) {
	const profile = await verifyGoogleCredential(deps, credential);
	const user = await findUserById(deps.db, userId);
	if (!user || user.email !== profile.email) {
		throw conflict({
			code: "SOCIAL_EMAIL_MISMATCH",
			message: "The Google account email must match your account email.",
		});
	}
	const existing = await findIdentity(deps.db, profile.subject);
	if (existing && existing.userId !== userId) {
		throw conflict({
			code: "SOCIAL_IDENTITY_IN_USE",
			message: "This Google account is already connected.",
		});
	}
	if (!existing) await linkIdentity(deps.db, userId, profile);
	return { linked: true as const };
}

export async function googleStatus(db: Database, userId: string) {
	const [identity] = await db
		.select({ id: authIdentities.id })
		.from(authIdentities)
		.where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, "google")))
		.limit(1);
	return { googleLinked: Boolean(identity) };
}
