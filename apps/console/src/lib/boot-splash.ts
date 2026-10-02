/**
 * Whether the static splash in index.html was on screen when the app started: the page was
 * opening rather than navigating. Read once, before main.tsx removes it.
 */
export const bootSplashShown =
	typeof document !== "undefined" && document.getElementById("boot") !== null;
