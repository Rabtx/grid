import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

const API_TARGET = process.env.GRID_API_PROXY ?? "http://localhost:4000";
const RUNNER_TARGET = process.env.GRID_RUNNER_PROXY ?? "http://localhost:4100";

/**
 * Hostnames Vite accepts besides localhost and IPs: any Tailscale MagicDNS name, so a phone can
 * open the console over `tailscale serve` HTTPS, and GitHub Codespaces' forwarded ports. Add more
 * (a VPS's domain, say) with GRID_ALLOWED_HOSTS (comma-separated).
 */
const allowedHosts = [
	".ts.net",
	".app.github.dev",
	...(process.env.GRID_ALLOWED_HOSTS?.split(",") ?? []),
];

/**
 * The console calls the API on its own origin (`/api/…`) and this forwards it, in dev and in
 * `vite preview`. One origin means no CORS, and it keeps working behind HTTPS tunnels (a phone
 * on Tailscale, say) where a separate `http://…:4000` would be blocked as mixed content.
 * The API's CSRF check only trusts known console origins, and a tunnel's hostname isn't one of
 * them — so the forwarded request presents the console's canonical dev origin instead.
 */
const apiProxy: Record<string, ProxyOptions> = {
	...Object.fromEntries(
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
	),
	// The runner (terminals) listens on loopback only; the console reaches it here, WebSocket
	// included. Its sockets authenticate with the access token, not with cookies or the origin.
	"/runner": {
		target: RUNNER_TARGET,
		ws: true,
		rewrite: (path) => path.replace(/^\/runner/, ""),
	},
};

/**
 * Emit `sw.js` from `src/pwa/service-worker.js` at build time, filling in the files to precache
 * and a build id derived from their contents, so changed shell content installs a fresh cache.
 */
function serviceWorker(): Plugin {
	const source = fileURLToPath(new URL("./src/pwa/service-worker.js", import.meta.url));
	const index = fileURLToPath(new URL("./index.html", import.meta.url));
	const publicDir = fileURLToPath(new URL("./public", import.meta.url));
	return {
		name: "grid-service-worker",
		apply: "build",
		generateBundle(_options, bundle) {
			const shell = new Set<string>();
			const include = (file: string): void => {
				const item = bundle[file];
				if (!item || shell.has(file)) return;
				shell.add(file);
				if (item.type === "chunk") {
					item.imports.forEach(include);
					item.viteMetadata?.importedCss.forEach(include);
				}
			};
			for (const [file, item] of Object.entries(bundle)) {
				if (item.type === "chunk" && item.isEntry) include(file);
			}
			const brand = readdirSync(`${publicDir}/brand`).map((file) => `/brand/${file}`);
			const precache = [
				"/index.html",
				"/manifest.webmanifest",
				...brand,
				...[...shell].map((file) => `/${file}`),
			].sort();
			const hash = createHash("sha256").update(precache.join("\n"));
			hash.update(readFileSync(index));
			hash.update(readFileSync(source));
			hash.update(readFileSync(`${publicDir}/manifest.webmanifest`));
			for (const file of brand) hash.update(readFileSync(`${publicDir}${file}`));
			for (const file of shell) {
				const item = bundle[file];
				if (item?.type === "chunk") hash.update(item.code);
				else if (item?.type === "asset") hash.update(item.source);
			}
			const buildId = hash.digest("hex").slice(0, 12);
			// The icon cache is keyed to the icon set, not the build: it survives deploys and is
			// replaced only when the icons are.
			const theme = `${publicDir}/file-icons/theme.json`;
			const iconsId = existsSync(theme)
				? createHash("sha256").update(readFileSync(theme)).digest("hex").slice(0, 12)
				: "none";
			this.emitFile({
				type: "asset",
				fileName: "sw.js",
				source: readFileSync(source, "utf8")
					.replaceAll("__BUILD_ID__", buildId)
					.replaceAll("__ICONS_ID__", iconsId)
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
