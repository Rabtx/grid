import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

const API_TARGET = process.env.GRID_API_PROXY ?? "http://localhost:4000";

/**
 * Hostnames Vite accepts besides localhost and IPs: any Tailscale MagicDNS name, so a phone can
 * open the console over `tailscale serve` HTTPS. Add more with GRID_ALLOWED_HOSTS (comma-separated).
 */
const allowedHosts = [".ts.net", ...(process.env.GRID_ALLOWED_HOSTS?.split(",") ?? [])];

/**
 * The console calls the API on its own origin (`/api/…`) and this forwards it, in dev and in
 * `vite preview`. One origin means no CORS, and it keeps working behind HTTPS tunnels (a phone
 * on Tailscale, say) where a separate `http://…:4000` would be blocked as mixed content.
 * The API's CSRF check only trusts known console origins, and a tunnel's hostname isn't one of
 * them — so the forwarded request presents the console's canonical dev origin instead.
 */
const apiProxy: Record<string, ProxyOptions> = Object.fromEntries(
	["/api", "/uploads"].map((path) => [
		path,
		{
			target: API_TARGET,
			changeOrigin: true,
			configure: (proxy) => {
				proxy.on("proxyReq", (request) => {
					if (request.getHeader("origin")) request.setHeader("origin", "http://localhost:3001");
				});
			},
		},
	]),
);

/**
 * Emit `sw.js` from `src/pwa/service-worker.js` at build time, filling in the files to precache
 * and a build id derived from them, so each deploy installs a fresh worker and cache.
 */
function serviceWorker(): Plugin {
	const source = fileURLToPath(new URL("./src/pwa/service-worker.js", import.meta.url));
	const publicDir = fileURLToPath(new URL("./public", import.meta.url));
	return {
		name: "grid-service-worker",
		apply: "build",
		generateBundle(_options, bundle) {
			const built = Object.keys(bundle)
				.filter((file) => /\.(js|css)$/.test(file))
				.map((file) => `/${file}`);
			const brand = readdirSync(`${publicDir}/brand`).map((file) => `/brand/${file}`);
			const precache = ["/index.html", "/manifest.webmanifest", ...brand, ...built].sort();
			const buildId = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
			this.emitFile({
				type: "asset",
				fileName: "sw.js",
				source: readFileSync(source, "utf8")
					.replaceAll("__BUILD_ID__", buildId)
					.replaceAll("__PRECACHE__", JSON.stringify(precache)),
			});
		},
	};
}

export default defineConfig({
	plugins: [solid(), tailwindcss(), serviceWorker()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	// Listen on every interface so other devices on the LAN can open the console by IP.
	server: {
		host: true,
		port: 3001,
		allowedHosts,
		proxy: apiProxy,
	},
	preview: {
		host: true,
		allowedHosts,
		proxy: apiProxy,
	},
});
