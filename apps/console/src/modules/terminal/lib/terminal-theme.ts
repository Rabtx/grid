import type { ITheme } from "@xterm/xterm";

// ANSI palettes tuned for the console's near-black and near-white canvases.
const ANSI_DARK = {
	// Softer than the classic set: colour still says what it means, without shouting.
	black: "#2a2f35",
	red: "#e8838a",
	green: "#8fcf9b",
	yellow: "#e6c384",
	blue: "#82aaf0",
	magenta: "#c3a0f0",
	cyan: "#7fcfd9",
	white: "#d7dce2",
	brightBlack: "#6b7380",
	brightRed: "#f0a3a8",
	brightGreen: "#ade0b6",
	brightYellow: "#f0d6a3",
	brightBlue: "#a6c2f5",
	brightMagenta: "#d6bcf5",
	brightCyan: "#a3dfe6",
	brightWhite: "#f2f4f7",
};

const ANSI_LIGHT = {
	black: "#383a42",
	red: "#e45649",
	green: "#50a14f",
	yellow: "#c18401",
	blue: "#4078f2",
	magenta: "#a626a4",
	cyan: "#0184bc",
	white: "#fafafa",
	brightBlack: "#7c8591",
	brightRed: "#df6b60",
	brightGreen: "#68b567",
	brightYellow: "#d19a2f",
	brightBlue: "#5c89f5",
	brightMagenta: "#b54bb3",
	brightCyan: "#1f9cc9",
	brightWhite: "#ffffff",
};

/**
 * Resolve a CSS colour expression to `#rrggbb`. The tokens are `oklch(…)` with custom-property
 * parts, which xterm cannot parse, so the browser paints one pixel and we read it back.
 */
function resolveColor(expression: string, fallback: string): string {
	const probe = document.createElement("span");
	probe.style.color = expression;
	probe.style.display = "none";
	document.body.append(probe);
	const computed = getComputedStyle(probe).color;
	probe.remove();

	const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
	if (!computed || !context) return fallback;
	context.fillStyle = fallback;
	context.fillStyle = computed;
	context.fillRect(0, 0, 1, 1);
	const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
	return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance of `#rrggbb`, enough to tell a light canvas from a dark one. */
function isLight(hex: string): boolean {
	const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/**
 * The terminal's colours: dark whatever the theme, as Figma's terminal is (the kit's terminal
 * tokens), with the cursor in the person's accent.
 */
export function terminalTheme(): ITheme {
	const background = resolveColor("var(--kit-terminal-bg)", "#161616");
	const light = isLight(background);
	const foreground = resolveColor("var(--kit-terminal-fg)", light ? "#2e2e2e" : "#d4d4d4");
	return {
		background,
		foreground,
		cursor: resolveColor("var(--user-accent, var(--ink))", foreground),
		cursorAccent: background,
		selectionBackground: light ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.18)",
		selectionInactiveBackground: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)",
		...(light ? ANSI_LIGHT : ANSI_DARK),
	};
}

export function monoFontFamily(): string {
	const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
	return family || "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
}
