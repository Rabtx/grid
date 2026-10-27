import { defineConfig, devices } from "@playwright/test";

import { PORTS } from "./e2e/ports";

/**
 * End-to-end tests of the console against the real API and runner (`e2e/stack.ts`), with a
 * stand-in agent that answers the same way every run. The tests share one Grid and run in order.
 */
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://localhost:${PORTS.console}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	webServer: [
		{
			command: "bun e2e/stack.ts api",
			url: `http://localhost:${PORTS.api}/api/v1/health`,
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "bun e2e/stack.ts runner",
			url: `http://localhost:${PORTS.runner}/health`,
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: `bunx vite --port ${PORTS.console} --strictPort`,
			url: `http://localhost:${PORTS.console}`,
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				GRID_API_PROXY: `http://localhost:${PORTS.api}`,
				GRID_RUNNER_PROXY: `http://localhost:${PORTS.runner}`,
			},
		},
	],
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
