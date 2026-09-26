import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import {
	type AuthenticationResponseJSON,
	type AuthenticatorTransport,
	generateAuthenticationOptions,
	generateRegistrationOptions,
	type RegistrationResponseJSON,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { AppConfig } from "../../config/config";
import { badRequest, unauthorized } from "../../http/errors";
import type { AuthCrypto } from "../auth/crypto";
import * as store from "../auth/store";
import { findUserByEmail, findUserById, type UserRecord } from "../users/users";

const { passkeys, webauthnAuthenticationChallenges: signInChallenges } = schema;

type Deps = { db: Database; config: AppConfig; crypto: AuthCrypto };
type PasskeyRecord = typeof passkeys.$inferSelect;

const invalidPasskey = () =>
	unauthorized({
		code: "PASSKEY_INVALID",
		message: "Passkey authentication could not be completed",
	});

const challengeExpiry = (deps: Deps) =>
	new Date(Date.now() + deps.config.mfaChallengeTtlMinutes * 60_000);

const listForUser = (db: Database, userId: string) =>
	db.select().from(passkeys).where(eq(passkeys.userId, userId)).orderBy(desc(passkeys.createdAt));

function view(passkey: PasskeyRecord) {
	return {
		id: passkey.id,
		name: passkey.name,
		deviceType: passkey.deviceType,
		backedUp: passkey.backedUp,
		lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
		createdAt: passkey.createdAt.toISOString(),
	};
}

export async function listPasskeys(deps: Deps, userId: string) {
	return (await listForUser(deps.db, userId)).map(view);
}

/** Options for adding a passkey to the signed-in account; the challenge is kept hashed. */
export async function beginRegistration(deps: Deps, userId: string) {
	const user = await findUserById(deps.db, userId);
	if (!user?.isActive) throw invalidPasskey();
	const existing = await listForUser(deps.db, userId);
	const options = await generateRegistrationOptions({
		rpName: deps.config.appName,
		rpID: deps.config.webAuthnRpId,
		userID: new TextEncoder().encode(user.id),
		userName: user.email,
		userDisplayName: user.username,
		attestationType: "none",
		excludeCredentials: existing.map((passkey) => ({
			id: passkey.credentialId,
			transports: passkey.transports as AuthenticatorTransport[],
		})),
		authenticatorSelection: { residentKey: "required", userVerification: "required" },
		preferredAuthenticatorType: "localDevice",
	});
	const challenge = await store.createChallenge(deps.db, {
		userId,
		email: user.email,
		purpose: "webauthn_registration",
		codeHash: deps.crypto.hashOtp("webauthn_registration", user.email, options.challenge),
		expiresAt: challengeExpiry(deps),
	});
	return { challengeId: challenge.id, options };
}

export async function finishRegistration(
	deps: Deps,
	input: { userId: string; challengeId: string; name: string; response: RegistrationResponseJSON },
) {
	const user = await findUserById(deps.db, input.userId);
	const challenge = await store.findChallenge(deps.db, input.challengeId);
	if (
		!challenge ||
		challenge.userId !== input.userId ||
		challenge.purpose !== "webauthn_registration" ||
		challenge.consumedAt ||
		challenge.expiresAt <= new Date()
	) {
		throw invalidPasskey();
	}
	if (!user) throw invalidPasskey();
	const verification = await verifyRegistrationResponse({
		response: input.response,
		expectedChallenge: (value) =>
			deps.crypto.verifyOtp("webauthn_registration", user.email, value, challenge.codeHash),
		expectedOrigin: deps.config.webAuthnOrigins,
		expectedRPID: deps.config.webAuthnRpId,
		requireUserVerification: true,
	}).catch(() => {
		throw invalidPasskey();
	});
	if (!verification.verified) throw invalidPasskey();
	if (!(await store.consumeChallenge(deps.db, challenge.id))) throw invalidPasskey();
	const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
	const [passkey] = await deps.db
		.insert(passkeys)
		.values({
			userId: input.userId,
			credentialId: credential.id,
			publicKey: Buffer.from(credential.publicKey).toString("base64url"),
			counter: credential.counter,
			transports: input.response.response.transports ?? credential.transports ?? [],
			deviceType: credentialDeviceType,
			backedUp: credentialBackedUp,
			name: input.name.trim().slice(0, 100) || "Passkey",
		})
		.returning();
	if (!passkey) throw new Error("Passkey insert did not return a record");
	return view(passkey);
}

/** Options for signing in: for one account's passkeys, or (no email) any discoverable one. */
export async function beginAuthentication(deps: Deps, email?: string) {
	const user = email ? await findUserByEmail(deps.db, email) : null;
	if (email && !user?.isActive) throw invalidPasskey();
	const owned = user ? await listForUser(deps.db, user.id) : [];
	if (user && owned.length === 0) throw invalidPasskey();
	const options = await generateAuthenticationOptions({
		rpID: deps.config.webAuthnRpId,
		...(user
			? {
					allowCredentials: owned.map((passkey) => ({
						id: passkey.credentialId,
						transports: passkey.transports as AuthenticatorTransport[],
					})),
				}
			: {}),
		userVerification: "required",
	});
	const [challenge] = await deps.db
		.insert(signInChallenges)
		.values({
			userId: user?.id ?? null,
			challengeHash: deps.crypto.hashOtp(
				"webauthn_authentication",
				user?.id ?? "discoverable",
				options.challenge,
			),
			expiresAt: challengeExpiry(deps),
		})
		.returning();
	if (!challenge) throw new Error("WebAuthn authentication challenge insert failed");
	return { challengeId: challenge.id, options };
}

/** The account a verified passkey sign-in belongs to. */
export async function finishAuthentication(
	deps: Deps,
	input: { challengeId: string; response: AuthenticationResponseJSON },
): Promise<UserRecord> {
	const [challenge] = await deps.db
		.select()
		.from(signInChallenges)
		.where(eq(signInChallenges.id, input.challengeId))
		.limit(1);
	if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date())
		throw invalidPasskey();
	const [passkey] = await deps.db
		.select()
		.from(passkeys)
		.where(eq(passkeys.credentialId, String(input.response.id)))
		.limit(1);
	if (!passkey || (challenge.userId && passkey.userId !== challenge.userId)) throw invalidPasskey();
	const user = await findUserById(deps.db, passkey.userId);
	if (!user?.isActive) throw invalidPasskey();
	const owner = challenge.userId ?? "discoverable";
	const verification = await verifyAuthenticationResponse({
		response: input.response,
		expectedChallenge: (value) =>
			deps.crypto.verifyOtp("webauthn_authentication", owner, value, challenge.challengeHash),
		expectedOrigin: deps.config.webAuthnOrigins,
		expectedRPID: deps.config.webAuthnRpId,
		requireUserVerification: true,
		credential: {
			id: passkey.credentialId,
			publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
			counter: passkey.counter,
			transports: passkey.transports as AuthenticatorTransport[],
		},
	}).catch(() => {
		throw invalidPasskey();
	});
	if (!verification.verified) throw invalidPasskey();
	const consumed = await deps.db
		.update(signInChallenges)
		.set({ consumedAt: new Date() })
		.where(and(eq(signInChallenges.id, challenge.id), isNull(signInChallenges.consumedAt)))
		.returning({ id: signInChallenges.id });
	if (consumed.length === 0) throw invalidPasskey();
	await deps.db
		.update(passkeys)
		.set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
		.where(eq(passkeys.id, passkey.id));
	return user;
}

export async function removePasskey(deps: Deps, userId: string, passkeyId: string) {
	const deleted = await deps.db
		.delete(passkeys)
		.where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
		.returning({ id: passkeys.id });
	if (deleted.length === 0) {
		throw badRequest({ code: "PASSKEY_NOT_FOUND", message: "Passkey not found" });
	}
	return { deleted: true as const };
}
