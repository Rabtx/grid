import { describe, expect, it } from "bun:test";

import { createConfig } from "./config";
import { parseEnv } from "./env";

const config = (env: Record<string, string>) =>
	createConfig(parseEnv({ NODE_ENV: "test", ...env }));

describe("where the API sends people", () => {
	it("is the console, by default and for passkeys", () => {
		const defaults = config({});
		expect(defaults.consoleUrl).toBe("http://localhost:3001");
		expect(defaults.webAuthnOrigins).toEqual(["http://localhost:3001"]);
		expect(defaults.corsOrigin).not.toContain(":3000");
	});

	it("takes CONSOLE_URL, then WEB_APP_URL from before it was renamed", () => {
		expect(config({ CONSOLE_URL: "https://grid.example.com/" }).consoleUrl).toBe(
			"https://grid.example.com",
		);
		expect(config({ WEB_APP_URL: "https://old.example.com" }).consoleUrl).toBe(
			"https://old.example.com",
		);
		expect(
			config({ CONSOLE_URL: "https://grid.example.com", WEB_APP_URL: "https://old.example.com" })
				.consoleUrl,
		).toBe("https://grid.example.com");
	});
});
