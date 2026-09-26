import { sql } from "drizzle-orm";

import type { Database } from "./client";
import * as schema from "./schema";

/** How long a first-run setup link works; every start of a Grid nobody has set up issues a new one. */
export const SETUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** SHA-256 hex: how setup codes and invite tokens are stored. */
export const hashSecret = (secret: string) =>
	new Bun.CryptoHasher("sha256").update(secret).digest("hex");

/** A random URL-safe secret. */
export const randomSecret = (bytes = 24) =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");

/**
 * A fresh setup code for a Grid nobody has signed up to yet, replacing any earlier one; null once
 * someone has. Only the hash is kept, so the code is shown once: in the link the launcher prints.
 */
export async function issueSetupCode(db: Database): Promise<string | null> {
	const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
	if (count > 0) return null;
	const code = randomSecret();
	const values = {
		setupCodeHash: hashSecret(code),
		setupCodeExpiresAt: new Date(Date.now() + SETUP_CODE_TTL_MS),
		updatedAt: new Date(),
	};
	await db
		.insert(schema.instanceSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: schema.instanceSettings.id, set: values });
	return code;
}
