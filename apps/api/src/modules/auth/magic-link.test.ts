import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type DatabaseInstance, schema } from "@grid/db";

import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { authCrypto } from "./crypto";
import * as flows from "./flows";

/** Magic-link sign-in against a database of its own (PGlite in memory). */
describe("signing in with an emailed link", () => {
	let instance: DatabaseInstance;
	const config = createConfig(parseEnv({ NODE_ENV: "test" }));
	const sent: string[] = [];
	let deps: Parameters<typeof flows.requestMagicLink>[0];
	const meta = { ipAddress: null, userAgent: "test" };
	let n = 0;

	beforeAll(async () => {
		instance = createDatabase(":memory:", { server: true });
		await instance.ready;
		await instance.migrate();
		deps = {
			db: instance.db,
			config,
			crypto: authCrypto(config),
			send: async (message: { html?: string; text?: string }) => {
				sent.push(message.text ?? message.html ?? "");
			},
		} as unknown as Parameters<typeof flows.requestMagicLink>[0];
		// Starting PGlite and migrating takes over Bun's 5 second default on a CI runner.
	}, 60_000);
	afterAll(async () => {
		await instance.close();
	});

	async function account(withAuthenticator = false): Promise<string> {
		const email = `link-${++n}@grid.test`;
		const [user] = await instance.db
			.insert(schema.users)
			.values({ email, username: `link-${n}`, emailVerifiedAt: new Date() })
			.returning();
		if (withAuthenticator && user)
			await instance.db
				.insert(schema.totpFactors)
				.values({ userId: user.id, secretEncrypted: "test", isEnabled: true });
		return email;
	}

	async function link(email: string): Promise<string> {
		const requested = (await flows.requestMagicLink(deps, { email })) as {
			developmentToken?: string;
		};
		expect(requested.developmentToken).toBeDefined();
		return requested.developmentToken ?? "";
	}

	it("signs in once, and the email points at the console", async () => {
		const email = await account();
		const token = await link(email);
		expect(sent.at(-1)).toContain(`${config.consoleUrl}/magic-link?token=`);
		const session = await flows.consumeMagicLink(deps, token, meta);
		expect("accessToken" in session).toBe(true);
		await expect(flows.consumeMagicLink(deps, token, meta)).rejects.toThrow();
	});

	it("still asks an account with an authenticator for its code", async () => {
		const email = await account(true);
		const result = await flows.consumeMagicLink(deps, await link(email), meta);
		expect(result).toMatchObject({ requiresTwoFactor: true });
		expect("accessToken" in result).toBe(false);
	});
});
