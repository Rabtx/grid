import type { ITheme } from "@xterm/xterm";

// ANSI palettes tuned for the console's near-black and near-white canvases.
const ANSI_DARK = {
	black: "#1d2428",
	red: "#f87171",
	green: "#4ade80",
	yellow: "#fbbf24",
	blue: "#60a5fa",
	magenta: "#c084fc",
	cyan: "#22d3ee",
	white: "#e8eef2",
	brightBlack: "#64748b",
	brightRed: "#fca5a5",
	brightGreen: "#86efac",
	brightYellow: "#fde68a",
	brightBlue: "#93c5fd",
	brightMagenta: "#d8b4fe",
	brightCyan: "#67e8f9",
	brightWhite: "#f8fafc",
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

/** The terminal's colours, taken from the console's live tokens so it follows Appearance. */
export function terminalTheme(): ITheme {
	const background = resolveColor("var(--canvas)", "#171717");
	const light = isLight(background);
	const foreground = resolveColor("var(--ink)", light ? "#2e2e2e" : "#ebebeb");
	return {
		background,
		foreground,
		cursor: resolveColor("var(--user-accent, var(--ink))", foreground),
		cursorAccent: background,
		selectionBackground: light ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.22)",
		selectionInactiveBackground: light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)",
		...(light ? ANSI_LIGHT : ANSI_DARK),
	};
}

export function monoFontFamily(): string {
	const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
	return family || "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
}
