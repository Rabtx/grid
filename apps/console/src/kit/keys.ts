/** Whether this device names its command key ⌘ (Apple) or Ctrl. */
function isApple(): boolean {
	return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/**
 * A shortcut as the keys to press on this device: "Mod K" is ⌘ K on a Mac and Ctrl K elsewhere;
 * single letters read as capitals ("g t" is G then T).
 */
export function shortcutKeys(shortcut: string): string[] {
	return shortcut
		.split(" ")
		.filter(Boolean)
		.map((key) =>
			key === "Mod" ? (isApple() ? "⌘" : "Ctrl") : key.length === 1 ? key.toUpperCase() : key,
		);
}
