import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [solid(), tailwindcss()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	// Listen on every interface so other devices on the LAN can open the console by IP.
	server: {
		host: true,
		port: 3001,
	},
	preview: {
		host: true,
	},
});
