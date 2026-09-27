import { fileURLToPath } from "node:url";

import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [solid()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	test: {
		// Two projects rather than per-file environments: the environment decides which Solid
		// build Vite resolves, so component tests need the browser build end to end.
		// `include` lives only in the projects — a root one would be merged into both.
		projects: [
			{
				extends: true,
				test: {
					name: "dom",
					environment: "happy-dom",
					include: ["src/**/*.test.tsx"],
					setupFiles: ["src/kit/test-setup.ts"],
				},
			},
			{
				extends: true,
				test: { name: "logic", environment: "node", include: ["src/**/*.test.ts"] },
			},
		],
	},
});
