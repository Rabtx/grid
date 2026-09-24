/** Modifiers armed from the key bar: they apply to the next key only, then release. */
export type Modifiers = { ctrl: boolean; alt: boolean };

export type Arrow = "up" | "down" | "right" | "left";

const ARROW_FINAL: Record<Arrow, string> = { up: "A", down: "B", right: "C", left: "D" };

// Ctrl with punctuation, as terminals have always encoded it.
const CTRL_SYMBOLS: Record<string, string> = {
	" ": "\x00",
	"@": "\x00",
	"[": "\x1b",
	"\\": "\x1c",
	"]": "\x1d",
	"^": "\x1e",
	_: "\x1f",
	"-": "\x1f",
	"?": "\x7f",
};

/**
 * The bytes for an arrow key. Full-screen programs (vim, less) switch the terminal to
 * "application cursor" mode and expect `ESC O A`; a modifier forces the `ESC [ 1 ; n A` form.
 */
export function arrowSequence(
	arrow: Arrow,
	applicationMode: boolean,
	modifiers: Modifiers,
): string {
	const final = ARROW_FINAL[arrow];
	const code = 1 + (modifiers.alt ? 2 : 0) + (modifiers.ctrl ? 4 : 0);
	if (code > 1) return `\x1b[1;${code}${final}`;
	return applicationMode ? `\x1bO${final}` : `\x1b[${final}`;
}

/**
 * Apply armed modifiers to what the keyboard typed. Ctrl turns a single letter or symbol into its
 * control code (Ctrl+C → ETX); Alt prefixes ESC, the way terminals send Meta. Anything longer than
 * one character (a paste, an IME word) passes through untouched.
 */
export function applyModifiers(data: string, modifiers: Modifiers): string {
	if (!modifiers.ctrl && !modifiers.alt) return data;
	if ([...data].length !== 1) return data;
	let out = data;
	if (modifiers.ctrl) {
		if (/^[a-z]$/i.test(data)) out = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
		else if (data in CTRL_SYMBOLS) out = CTRL_SYMBOLS[data];
	}
	return modifiers.alt ? `\x1b${out}` : out;
}
