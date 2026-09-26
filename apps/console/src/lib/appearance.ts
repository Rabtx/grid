import { createSignal } from "solid-js";

/**
 * How the console looks on this device: theme, tint, accent, glass and scale. Settings →
 * Appearance edits it; `restoreAppearance()` applies it before the first render. It is stored
 * per device in localStorage — like a browser zoom level, not an account setting.
 */
export type Theme = "system" | "light" | "dark";
export type Density = "compact" | "comfortable" | "spacious";

export type Appearance = {
	theme: Theme;
	/** A `#rrggbb` colour for primary actions, or null for the default ink inversion. */
	accent: string | null;
	/** Tint hue in degrees, 0–360. */
	hue: number;
	/** Tint strength in percent, 0–100; 0 is neutral grey. */
	saturation: number;
	/** Canvas lightness of the dark theme in percent, 0–30; 0 is true black. */
	darkLightness: number;
	/** Opacity of glass surfaces (sidebar, phone top bar), 0.15–1. */
	glassOpacity: number;
	/** Backdrop blur behind glass surfaces in px, 1–64. */
	glassBlur: number;
	/** Interface scale, 0.5–2 in steps of 0.1. */
	uiScale: number;
	density: Density;
};

export const APPEARANCE_DEFAULTS: Appearance = {
	theme: "system",
	accent: null,
	hue: 240,
	saturation: 0,
	darkLightness: 9,
	glassOpacity: 0.85,
	glassBlur: 24,
	uiScale: 1,
	density: "comfortable",
};

export const APPEARANCE_LIMITS = {
	hue: { min: 0, max: 360, step: 1 },
	saturation: { min: 0, max: 100, step: 1 },
	darkLightness: { min: 0, max: 30, step: 1 },
	glassOpacity: { min: 0.15, max: 1, step: 0.01 },
	glassBlur: { min: 1, max: 64, step: 1 },
	uiScale: { min: 0.5, max: 2, step: 0.1 },
} as const;

/** Accent presets offered next to the custom colour picker (null is the default). */
export const ACCENT_PRESETS: readonly (string | null)[] = [
	null,
	"#4da3f5",
	"#8b5cf6",
	"#ec4899",
	"#ef4444",
	"#f59e0b",
	"#10b981",
];

const STORAGE_KEY = "grid.appearance";
// Keys written by the earlier preferences module; read once so a saved choice survives.
const LEGACY_THEME_KEY = "grid.theme";
const LEGACY_DENSITY_KEY = "grid.density";

const HEX_COLOR = /^#[0-9a-f]{6}$/;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
	const number = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.min(max, Math.max(min, number));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
	return options.includes(value as T) ? (value as T) : fallback;
}

/** Coerce anything — stored JSON, a partial update — into a valid, in-range `Appearance`. */
export function normalizeAppearance(input: unknown): Appearance {
	const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
	const d = APPEARANCE_DEFAULTS;
	const l = APPEARANCE_LIMITS;
	const accent = typeof raw.accent === "string" ? raw.accent.toLowerCase() : null;
	return {
		theme: oneOf(raw.theme, ["system", "light", "dark"], d.theme),
		accent: accent && HEX_COLOR.test(accent) ? accent : null,
		hue: Math.round(clamp(raw.hue, l.hue.min, l.hue.max, d.hue)),
		saturation: Math.round(clamp(raw.saturation, l.saturation.min, l.saturation.max, d.saturation)),
		darkLightness: Math.round(
			clamp(raw.darkLightness, l.darkLightness.min, l.darkLightness.max, d.darkLightness),
		),
		glassOpacity:
			Math.round(
				clamp(raw.glassOpacity, l.glassOpacity.min, l.glassOpacity.max, d.glassOpacity) * 100,
			) / 100,
		glassBlur: Math.round(clamp(raw.glassBlur, l.glassBlur.min, l.glassBlur.max, d.glassBlur)),
		uiScale: Math.round(clamp(raw.uiScale, l.uiScale.min, l.uiScale.max, d.uiScale) * 10) / 10,
		density: oneOf(raw.density, ["compact", "comfortable", "spacious"], d.density),
	};
}

/** Black or white, whichever reads better on `hex` (WCAG relative luminance). */
export function readableInk(hex: string): "#000000" | "#ffffff" {
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
	return luminance > 0.179 ? "#000000" : "#ffffff";
}

/** The actual canvas colour, for the status/browser bar surrounding the page. */
export function canvasColor(value: Appearance, prefersDark: boolean): string {
	const dark = value.theme === "dark" || (value.theme === "system" && prefersDark);
	const lightness = (dark ? value.darkLightness : 99.2) / 100;
	const saturation = value.saturation / 100;
	const amount = saturation * Math.min(lightness, 1 - lightness);
	const channel = (offset: number) => {
		const key = (offset + value.hue / 30) % 12;
		return Math.round(255 * (lightness - amount * Math.max(-1, Math.min(key - 3, 9 - key, 1))));
	};
	return `#${[0, 8, 4].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

function syncThemeColor(value: Appearance): void {
	const color = canvasColor(
		value,
		window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
	);
	document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
		meta.content = color;
	});
}

/** Write an appearance onto the document root as the variables and classes the tokens read. */
export function applyAppearance(
	value: Appearance,
	root: HTMLElement = document.documentElement,
): void {
	const style = root.style;
	style.setProperty("--hue", String(value.hue));
	style.setProperty("--saturation", `${value.saturation}%`);
	style.setProperty("--dark-lightness", `${value.darkLightness}%`);
	style.setProperty("--glass-opacity", String(value.glassOpacity));
	style.setProperty("--glass-blur", `${value.glassBlur}px`);
	style.setProperty("--ui-scale", String(value.uiScale));
	if (value.accent) {
		style.setProperty("--user-accent", value.accent);
		style.setProperty("--user-accent-ink", readableInk(value.accent));
	} else {
		style.removeProperty("--user-accent");
		style.removeProperty("--user-accent-ink");
	}
	root.classList.toggle("dark", value.theme === "dark");
	root.classList.toggle("light", value.theme === "light");
	root.setAttribute("data-density", value.density);
	if (root === document.documentElement) syncThemeColor(value);
}

function readStored(): Appearance {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return normalizeAppearance(JSON.parse(raw));
		return normalizeAppearance({
			theme: localStorage.getItem(LEGACY_THEME_KEY),
			density: localStorage.getItem(LEGACY_DENSITY_KEY),
		});
	} catch {
		// Blocked storage, private windows or corrupt JSON: fall back to the defaults.
		return APPEARANCE_DEFAULTS;
	}
}

function writeStored(value: Appearance): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// Storage can be blocked or full; the change still applies for this visit.
	}
}

// `state` is the source of truth; the signal only lets the settings screen react. Solid 2
// batches signal writes until the next microtask, so reading the signal right after a write
// would still see the previous value — two quick zoom presses would compute from a stale scale.
let state: Appearance = APPEARANCE_DEFAULTS;
let watchingSystemTheme = false;
const [current, setCurrent] = createSignal<Appearance>(APPEARANCE_DEFAULTS);

/** The appearance in effect, reactive for the settings screen. */
export const appearance = current;

function commit(next: Appearance, persist: boolean): void {
	state = next;
	setCurrent(next);
	applyAppearance(next);
	if (persist) writeStored(next);
}

/** Change some settings: normalise, apply, persist. */
export function updateAppearance(patch: Partial<Appearance>): void {
	commit(normalizeAppearance({ ...state, ...patch }), true);
}

/** Put every appearance setting back to its default. */
export function resetAppearance(): void {
	commit(APPEARANCE_DEFAULTS, true);
}

/** Load the saved appearance and apply it; call once before the first render. */
export function restoreAppearance(): void {
	commit(readStored(), false);
	if (window.matchMedia && !watchingSystemTheme) {
		window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
			if (state.theme === "system") syncThemeColor(state);
		});
		watchingSystemTheme = true;
	}
}

/**
 * Ctrl/⌘ with `=` or `+`, `-` and `0` zoom the interface, as in the settings screen. Returns a
 * function that removes the listener.
 */
export function installScaleShortcuts(target: Window = window): () => void {
	const step = APPEARANCE_LIMITS.uiScale.step;
	function onKeyDown(event: KeyboardEvent): void {
		if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
		const scale = state.uiScale;
		if (event.key === "=" || event.key === "+") updateAppearance({ uiScale: scale + step });
		else if (event.key === "-") updateAppearance({ uiScale: scale - step });
		else if (event.key === "0") updateAppearance({ uiScale: APPEARANCE_DEFAULTS.uiScale });
		else return;
		event.preventDefault();
	}
	target.addEventListener("keydown", onKeyDown);
	return () => target.removeEventListener("keydown", onKeyDown);
}
