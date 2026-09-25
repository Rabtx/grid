import 'dotenv/config';

import { randomBytes } from 'node:crypto';

import { hash } from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * First start of a portable Grid: when the database has no users yet, create the owner — a
 * verified account with a generated password, so a fresh Grid (a Codespace, a VPS) can be signed
 * into without an email service. Prints one line of JSON for the launcher; never touches an
 * existing account.
 *
 *   GRID_OWNER_EMAIL=me@example.com bun src/database/owner.ts
 */
async function main(): Promise<void> {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is required');
	const email = (process.env.GRID_OWNER_EMAIL ?? 'owner@grid.local').trim().toLowerCase();
	const client = postgres(url, { max: 1 });
	const db = drizzle(client, { schema });
	try {
		const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
		if (count > 0) {
			console.log(JSON.stringify({ created: false }));
			return;
		}
		const password = randomBytes(12).toString('base64url');
		const [user] = await db
			.insert(schema.users)
			.values({
				email,
				username:
					email
						.split('@')[0]
						.replace(/[^a-z0-9_]/g, '')
						.slice(0, 32) || 'owner',
				passwordHash: await hash(password, 12),
				emailVerifiedAt: new Date(),
				isActive: true,
			})
			.returning();
		if (!user) throw new Error('The owner account was not created');
		await db.insert(schema.userProfiles).values({ userId: user.id, displayName: 'Owner' });
		console.log(JSON.stringify({ created: true, email, password }));
	} finally {
		await client.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
