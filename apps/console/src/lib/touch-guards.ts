/**
 * Keeps phones from zooming the app like a web page. The viewport already says no pinch zoom, and
 * the CSS turns off double-tap zoom, but Safari on iPhone ignores the viewport's say and zooms on
 * a pinch anyway; its own gesture events are the only way to stop that. Grid's interface scale
 * (Settings → Appearance) is how to make things bigger. Returns a cleanup.
 */
export function installTouchGuards(): () => void {
	const stop = (event: Event) => event.preventDefault();
	document.addEventListener("gesturestart", stop, { passive: false });
	document.addEventListener("gesturechange", stop, { passive: false });
	return () => {
		document.removeEventListener("gesturestart", stop);
		document.removeEventListener("gesturechange", stop);
	};
}
