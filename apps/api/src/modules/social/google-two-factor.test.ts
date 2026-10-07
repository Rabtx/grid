import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type DatabaseInstance, schema } from "@grid/db";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { authCrypto } from "../auth/crypto";
import * as flows from "../auth/flows";
import { authenticateGoogle, linkGoogle } from "./google";

const CLIENT_ID = "grid-test.apps.googleusercontent.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" };

/** An ID token shaped like Google's, signed with the test key. */
const idToken = (email: string) =>
	new SignJWT({ email, email_verified: true, name: "Person" })
		.setProtectedHeader({ alg: "RS256", kid: "test" })
		.setSubject(`google-${email}`)
		.setAudience(CLIENT_ID)
		.setIssuer("https://accounts.google.com")
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(privateKey);

/** Google sign-in against a database of its own (PGlite in memory). */
describe("signing in with Google", () => {
	let instance: DatabaseInstance;
	const config = createConfig(parseEnv({ NODE_ENV: "test", GOOGLE_CLIENT_ID: CLIENT_ID }));
	const meta = { ipAddress: null, userAgent: "test" };
	let deps: Parameters<typeof authenticateGoogle>[0] & Parameters<typeof flows.signInAs>[0];

	beforeAll(async () => {
		instance = createDatabase(":memory:", { server: true });
		await instance.ready;
		await instance.migrate();
		deps = {
			db: instance.db,
			config,
			crypto: authCrypto(config),
			send: async () => {},
			googleKeys: createLocalJWKSet({ keys: [jwk] }),
		} as unknown as typeof deps;
		// Starting PGlite and migrating takes over Bun's 5 second default on a CI runner.
	}, 60_000);
	afterAll(async () => {
		await instance.close();
	});

	/** An account that has connected Google (sign-up is by invite, so it exists first). */
	async function linked(email: string, withAuthenticator = false) {
		const [user] = await instance.db
			.insert(schema.users)
			.values({ email, username: email.split("@")[0] ?? email, emailVerifiedAt: new Date() })
			.returning();
		const id = user?.id ?? "";
		await linkGoogle(deps, id, await idToken(email));
		if (withAuthenticator)
			await instance.db
				.insert(schema.totpFactors)
				.values({ userId: id, secretEncrypted: "test", isEnabled: true });
		return id;
	}

	it("gives a session to an account without an authenticator", async () => {
		await linked("plain@grid.test");
		const user = await authenticateGoogle(deps, await idToken("plain@grid.test"));
		const result = await flows.signInAs(deps, user, meta);
		expect("accessToken" in result).toBe(true);
	});

	it("still asks an account with an authenticator for its code", async () => {
		const id = await linked("guarded@grid.test", true);
		const again = await authenticateGoogle(deps, await idToken("guarded@grid.test"));
		expect(again.id).toBe(id);
		const result = await flows.signInAs(deps, again, meta);
		expect(result).toMatchObject({ requiresTwoFactor: true });
		expect("accessToken" in result).toBe(false);
		const sessions = await instance.db
			.select()
			.from(schema.sessions)
			.where(eq(schema.sessions.userId, id));
		expect(sessions).toHaveLength(0);
	});
});
