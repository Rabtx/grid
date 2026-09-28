/**
 * The unread count on the installed app's icon, as native apps show it: set while something waits
 * in the Inbox, cleared at zero. Only where the platform has app badges (installed on Android and
 * desktop Chrome, and iPhone home-screen apps with notifications allowed); a no-op elsewhere.
 */
export function showAppBadge(count: number): void {
	const nav = navigator as Navigator & {
		setAppBadge?: (count?: number) => Promise<void>;
		clearAppBadge?: () => Promise<void>;
	};
	if (!nav.setAppBadge || !nav.clearAppBadge) return;
	const done = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge();
	// A browser can refuse (no permission, not installed); the badge is a nicety, not the state.
	done.catch(() => undefined);
}
