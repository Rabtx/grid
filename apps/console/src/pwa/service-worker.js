/*
 * The console's service worker. The `serviceWorker()` plugin in vite.config.ts fills in the build
 * id and the precache list below, so every deploy is a new worker with its own cache.
 *
 * - The app shell (index.html, entry JS and static dependencies, CSS, icons, manifest) is
 *   precached at install. Lazy route assets enter the cache when visited.
 * - Page navigations go to the network first and fall back to the cached shell offline; the
 *   router then renders the right screen from the URL.
 * - Hashed assets are served from the cache first — their names change whenever they change.
 * - API and terminal calls (/api/…, /uploads/…, /runner/…) are never cached: they must be live.
 * - Pushes from the runner (an agent finished or needs approval while nobody was looking) show as
 *   notifications; tapping one opens that chat, in the open window when there is one.
 */
const BUILD_ID = "__BUILD_ID__";
const CACHE = `grid-shell-${BUILD_ID}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith("grid-shell-") && key !== CACHE)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

// The page asks the waiting worker to take over once the person chooses to reload.
self.addEventListener("message", (event) => {
	if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (["/api/", "/uploads/", "/runner/"].some((prefix) => url.pathname.startsWith(prefix))) return;

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(() =>
				caches.match("/index.html").then((shell) => shell ?? Response.error()),
			),
		);
		return;
	}

	event.respondWith(
		caches.match(request).then(
			(cached) =>
				cached ??
				fetch(request).then((response) => {
					if (response.ok && url.pathname.startsWith("/assets/")) {
						const copy = response.clone();
						void caches.open(CACHE).then((cache) => cache.put(request, copy));
					}
					return response;
				}),
		),
	);
});

self.addEventListener("push", (event) => {
	let message = {};
	try {
		message = event.data?.json() ?? {};
	} catch {
		// Not ours, or not JSON: still show something rather than drop it silently.
	}
	event.waitUntil(
		self.registration.showNotification(message.title || "Grid", {
			body: message.body || "",
			// One notification per chat: a newer one replaces the last, and still alerts.
			tag: message.tag,
			renotify: Boolean(message.tag),
			icon: "/brand/app-icon-192.png",
			badge: "/brand/grid-mark-96.png",
			data: { url: message.url || "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
			const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
			if (!open) return self.clients.openWindow(url);
			const focused = await open.focus();
			return focused.navigate(url).catch(() => focused);
		}),
	);
});
