import { describe, expect, test } from "bun:test";

import { gatewayUrl, readLaunchConfig } from "./config";

describe("launch config", () => {
	test("defaults keep everything inside the checkout", () => {
		const config = readLaunchConfig({}, "/repo");
		expect(config.port).toBe(8080);
		expect(config.dataDir).toBe("/repo/.grid");
		expect(config.projectsDir).toBe("/repo/.grid/projects");
		expect(config.databaseUrl).toBeUndefined();
		expect(gatewayUrl(config, {})).toBe("http://localhost:8080");
	});

	test("a Codespace puts projects in /workspaces and prints its forwarded URL", () => {
		const env = {
			CODESPACES: "true",
			CODESPACE_NAME: "grid-abc",
			GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
			GRID_PORT: "9000",
		};
		const config = readLaunchConfig(env, "/repo");
		expect(config.projectsDir).toBe("/workspaces");
		expect(gatewayUrl(config, env)).toBe("https://grid-abc-9000.app.github.dev");
	});

	test("an empty DATABASE_URL means Grid starts its own Postgres", () => {
		expect(readLaunchConfig({ DATABASE_URL: "" }, "/repo").databaseUrl).toBeUndefined();
	});
});
