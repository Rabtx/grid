import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
	plugins: [solid()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		projects: [
			{
				extends: true,
				test: {
					name: "client",
					environment: "happy-dom",
					include: ["src/**/*.test.tsx"],
				},
			},
			{
				extends: true,
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.test.ts"],
				},
			},
		],
	},
});
