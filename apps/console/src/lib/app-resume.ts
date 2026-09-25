/**
 * Calls back whenever the app is likely to have been asleep: it came back to the foreground, was
 * restored from the back-forward cache, was unfrozen, or the network returned. Phones pause a
 * backgrounded page and silently kill its sockets, so this is when a live link should check itself.
 */
export function onAppResume(callback: () => void): () => void {
	const onVisible = () => {
		if (document.visibilityState === "visible") callback();
	};
	const onPageShow = (event: PageTransitionEvent) => {
		if (event.persisted) callback();
	};
	document.addEventListener("visibilitychange", onVisible);
	// Page Lifecycle: Chromium fires this on the document when a frozen page runs again.
	document.addEventListener("resume", callback);
	window.addEventListener("pageshow", onPageShow);
	window.addEventListener("online", callback);
	return () => {
		document.removeEventListener("visibilitychange", onVisible);
		document.removeEventListener("resume", callback);
		window.removeEventListener("pageshow", onPageShow);
		window.removeEventListener("online", callback);
	};
}
