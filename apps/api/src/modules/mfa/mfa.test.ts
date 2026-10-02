import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type Database, schema } from "@grid/db";
import { eq } from "drizzle-orm";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { ApiError } from "../../http/errors";
import { encryptSecret, generateRecoveryCode, hashRecoveryCode } from "../auth/secrets";
import { beginTotpSetup, disableTotp, mfaStatus, verifyLoginCode } from "./mfa";
import { generateTotpSecret, totpCode } from "./totp";

/** Needs a database (the dev one): skipped without DATABASE_URL, e.g. `bun run test` in CI. */
const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("two-factor setup", () => {
	const tag = Math.random().toString(36).slice(2, 8);
	// A test value for a key the API only uses to encrypt and hash, not a secret.
	const tokenSecret = "mfa-test-token-secret-value-000000";
	let db: Database;
	let close: () => Promise<void>;
	const accountIds: string[] = [];
	const deps = () => ({
		db,
		config: createConfig(
			parseEnv({
				NODE_ENV: "test",
				DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unused",
				AUTH_TOKEN_SECRET: tokenSecret,
				APP_NAME: "Grid",
			}),
		),
	});

	beforeAll(async () => {
		const instance = createDatabase(process.env.DATABASE_URL ?? "", { max: 2 });
		db = instance.db;
		close = instance.close;
	});

	afterAll(async () => {
		for (const id of accountIds) {
			await db.delete(schema.totpRecoveryCodes).where(eq(schema.totpRecoveryCodes.userId, id));
			await db.delete(schema.totpFactors).where(eq(schema.totpFactors.userId, id));
			await db.delete(schema.users).where(eq(schema.users.id, id));
		}
		await close();
	});

	async function account() {
		const id = crypto.randomUUID();
		accountIds.push(id);
		await db
			.insert(schema.users)
			.values({ id, email: `mfa-${tag}-${id}@grid.test`, username: `mfa-${tag}-${id}` });
		return id;
	}

	/** A factor that is on, as it is once the person has confirmed a first code. */
	async function enabledFactor(userId: string): Promise<string> {
		const secret = generateTotpSecret();
		await db.insert(schema.totpFactors).values({
			userId,
			secretEncrypted: await encryptSecret(tokenSecret, secret),
			isEnabled: true,
			verifiedAt: new Date(),
		});
		await db
			.insert(schema.totpRecoveryCodes)
			.values({ userId, codeHash: hashRecoveryCode(tokenSecret, generateRecoveryCode()) });
		return secret;
	}

	it("refuses to set 2FA up again while it is on, and keeps the factor working", async () => {
		const userId = await account();
		const secret = await enabledFactor(userId);
		expect((await mfaStatus(deps(), userId)).totpEnabled).toBe(true);

		// Enrolling again used to run an upsert that cleared isEnabled and replaced the stored
		// secret: the account was left with no second factor whether or not the new one was ever
		// confirmed, and the old secret and its recovery codes were gone with it.
		const refused = await beginTotpSetup(deps(), userId).then(
			() => null,
			(cause: unknown) => cause,
		);
		expect(refused).toBeInstanceOf(ApiError);
		expect((refused as ApiError).status).toBe(409);
		expect((refused as ApiError).code).toBe("MFA_ALREADY_ENABLED");

		expect(await mfaStatus(deps(), userId)).toEqual({
			totpEnabled: true,
			recoveryCodesRemaining: 1,
		});
		// The secret that was on is the one still stored, so its codes are still the second factor.
		expect(await verifyLoginCode(deps(), userId, totpCode(secret))).toBe(true);
	});

	it("replaces a pending secret, since nothing depends on it yet", async () => {
		const userId = await account();
		await db.insert(schema.totpFactors).values({ userId, secretEncrypted: "pending" });

		const started = await beginTotpSetup(deps(), userId);
		expect(started.secret).toMatch(/^[A-Z2-7]+$/);
		expect(started.uri).toContain(started.secret);
		expect(await mfaStatus(deps(), userId)).toEqual({
			totpEnabled: false,
			recoveryCodesRemaining: 0,
		});
	});

	it("turns 2FA off only with a code that works", async () => {
		const userId = await account();
		const secret = await enabledFactor(userId);
		await expect(disableTotp(deps(), userId, "000000")).rejects.toThrow();
		expect((await mfaStatus(deps(), userId)).totpEnabled).toBe(true);
		await disableTotp(deps(), userId, totpCode(secret));
		expect((await mfaStatus(deps(), userId)).totpEnabled).toBe(false);
	});
});
