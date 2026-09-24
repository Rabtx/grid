import { createSignal } from "solid-js";

/**
 * Registers the service worker (production builds only — in dev it would fight hot reload) and
 * exposes whether a new version is waiting. The new worker never takes over mid-session on its
 * own: the person chooses to reload, so an open form or panel is never swept away.
 */
const [updateReady, setUpdateReady] = createSignal(false);
let waiting: ServiceWorker | null = null;
// Set only when the person asks for the update. The first install also changes the controller
// (the worker claims the page), and that must not reload a page someone is typing into.
let reloadRequested = false;

/** True once a newer build is installed and waiting for a reload. */
export { updateReady };

export function registerServiceWorker(): void {
	if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.then((registration) => {
				const offer = (worker: ServiceWorker | null) => {
					// Only an update, not the very first install, needs a reload to take effect.
					if (!worker || !navigator.serviceWorker.controller) return;
					waiting = worker;
					setUpdateReady(true);
				};
				offer(registration.waiting);
				registration.addEventListener("updatefound", () => {
					const installing = registration.installing;
					installing?.addEventListener("statechange", () => {
						if (installing.state === "installed") offer(installing);
					});
				});
			})
			.catch((error: unknown) => {
				console.error("Service worker registration failed", error);
			});

		// Reload once the requested update has taken control, so the page runs the matching build.
		navigator.serviceWorker.addEventListener("controllerchange", () => {
			if (!reloadRequested) return;
			reloadRequested = false;
			window.location.reload();
		});
	});
}

/** Switch to the waiting version; the page reloads when the new worker takes control. */
export function applyUpdate(): void {
	if (!waiting) return;
	reloadRequested = true;
	waiting.postMessage("skip-waiting");
}
