import { checkRunnerHealth } from "@/lib/runner-health";

/**
 * PWA background resilience and keepalive:
 * 1. Acquires a Web Lock ("grid_keepalive", shared mode) which signals active background
 *    coordination to the browser engine, preventing or delaying background process/timer freeze.
 * 2. Listens to visibilitychange, pageshow, and online to immediately re-verify runner health
 *    and trigger fast socket reconnection when the user returns to the app.
 */
export function initPwaKeepalive(): () => void {
	if (typeof window === "undefined") return () => {};

	let releaseLock: (() => void) | undefined;

	// Web Locks API: holding a shared lock prevents Chromium / WebKit PWA process freeze
	if ("locks" in navigator && typeof navigator.locks?.request === "function") {
		void navigator.locks
			.request("grid_keepalive", { mode: "shared" }, () => {
				return new Promise<void>((resolve) => {
					releaseLock = resolve;
				});
			})
			.catch(() => {
				// Web locks not supported or refused
			});
	}

	let lastVisibleAt = Date.now();

	const onVisibility = () => {
		if (document.visibilityState === "visible") {
			const elapsed = Date.now() - lastVisibleAt;
			if (elapsed > 15_000) {
				void checkRunnerHealth();
			}
		} else {
			lastVisibleAt = Date.now();
		}
	};

	const onPageShow = (e: PageTransitionEvent) => {
		if (e.persisted) {
			void checkRunnerHealth();
		}
	};

	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("pageshow", onPageShow);

	return () => {
		releaseLock?.();
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("pageshow", onPageShow);
	};
}
