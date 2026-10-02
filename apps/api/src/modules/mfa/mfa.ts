import type { Database } from "@grid/db";
import { schema } from "@grid/db";
import { and, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";

import type { AppConfig } from "../../config/config";
import { badRequest, conflict, unauthorized } from "../../http/errors";
import {
	decryptSecret,
	encryptSecret,
	generateRecoveryCode,
	hashRecoveryCode,
} from "../auth/secrets";
import { currentUser } from "../users/users";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";

const { totpFactors, totpRecoveryCodes } = schema;

type Deps = { db: Database; config: AppConfig };

const invalidCode = () =>
	unauthorized({
		code: "MFA_CODE_INVALID",
		message: "The authentication code is invalid or expired",
	});

async function factor(db: Database, userId: string) {
	const [row] = await db.select().from(totpFactors).where(eq(totpFactors.userId, userId)).limit(1);
	return row ?? null;
}

async function unusedRecoveryCodes(db: Database, userId: string): Promise<number> {
	const rows = await db
		.select({ id: totpRecoveryCodes.id })
		.from(totpRecoveryCodes)
		.where(and(eq(totpRecoveryCodes.userId, userId), isNull(totpRecoveryCodes.usedAt)));
	return rows.length;
}

export async function mfaStatus(deps: Deps, userId: string) {
	const current = await factor(deps.db, userId);
	return {
		totpEnabled: current?.isEnabled ?? false,
		recoveryCodesRemaining: current?.isEnabled ? await unusedRecoveryCodes(deps.db, userId) : 0,
	};
}

/** Start 2FA setup: a new secret (kept encrypted, not yet on), its URI and a QR code. */
export async function beginTotpSetup(deps: Deps, userId: string) {
	const user = await currentUser(deps.db, userId);
	// Enrolling again replaces the pending secret below. It must never replace a factor that is
	// already on: the upsert would clear isEnabled and leave the account with no second factor
	// until (and unless) the new one is confirmed. Turning 2FA off means proving a code first.
	if ((await factor(deps.db, userId))?.isEnabled)
		throw conflict({
			code: "MFA_ALREADY_ENABLED",
			message: "Two-factor authentication is already on: turn it off before setting it up again",
		});
	const secret = generateTotpSecret();
	const uri = totpUri({ issuer: deps.config.appName, label: user.email, secret });
	const secretEncrypted = await encryptSecret(deps.config.authTokenSecret, secret);
	await deps.db
		.insert(totpFactors)
		.values({ userId, secretEncrypted })
		.onConflictDoUpdate({
			target: totpFactors.userId,
			set: { secretEncrypted, isEnabled: false, verifiedAt: null, updatedAt: new Date() },
		});
	return { secret, uri, qrCodeDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 1 }) };
}

/** Turn 2FA on with a first valid code; the ten recovery codes are shown once. */
export async function confirmTotpSetup(deps: Deps, userId: string, code: string) {
	const current = await factor(deps.db, userId);
	if (!current || current.isEnabled) {
		throw badRequest({
			code: "MFA_SETUP_NOT_STARTED",
			message: "Start two-factor setup before confirming it",
		});
	}
	const secret = await decryptSecret(deps.config.authTokenSecret, current.secretEncrypted);
	if (!verifyTotp(secret, code)) throw invalidCode();
	const recoveryCodes = Array.from({ length: 10 }, generateRecoveryCode);
	await deps.db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(totpFactors)
			.set({ isEnabled: true, verifiedAt: now, updatedAt: now })
			.where(eq(totpFactors.userId, userId));
		await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
		await tx.insert(totpRecoveryCodes).values(
			recoveryCodes.map((recovery) => ({
				userId,
				codeHash: hashRecoveryCode(deps.config.authTokenSecret, recovery),
			})),
		);
	});
	return { enabled: true as const, recoveryCodes };
}

export async function disableTotp(deps: Deps, userId: string, code: string) {
	if (!(await verifyLoginCode(deps, userId, code))) throw invalidCode();
	await deps.db.transaction(async (tx) => {
		await tx.delete(totpRecoveryCodes).where(eq(totpRecoveryCodes.userId, userId));
		await tx.delete(totpFactors).where(eq(totpFactors.userId, userId));
	});
	return { enabled: false as const };
}

/** A sign-in second factor: a current code, or an unused recovery code (used up). */
export async function verifyLoginCode(deps: Deps, userId: string, code: string): Promise<boolean> {
	const current = await factor(deps.db, userId);
	if (!current?.isEnabled) return false;
	if (/^\d{6}$/.test(code)) {
		return verifyTotp(
			await decryptSecret(deps.config.authTokenSecret, current.secretEncrypted),
			code,
		);
	}
	const [used] = await deps.db
		.update(totpRecoveryCodes)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(totpRecoveryCodes.userId, userId),
				eq(totpRecoveryCodes.codeHash, hashRecoveryCode(deps.config.authTokenSecret, code)),
				isNull(totpRecoveryCodes.usedAt),
			),
		)
		.returning({ id: totpRecoveryCodes.id });
	return Boolean(used);
}
