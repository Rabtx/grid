/** The terminal text size, shared by the Terminal screen and a thread's split view. */
export const FONT_SIZE_KEY = "grid.terminal.fontSize";
export const FONT_SIZES = { min: 9, max: 22 } as const;

export function initialFontSize(): number {
	try {
		const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
		if (saved >= FONT_SIZES.min && saved <= FONT_SIZES.max) return saved;
	} catch {
		// Storage can be unavailable (private mode); the default is fine.
	}
	return matchMedia("(pointer: coarse)").matches ? 12 : 13;
}
