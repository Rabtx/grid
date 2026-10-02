import { createSignal } from "solid-js";

/**
 * How the console looks on this device: theme, tint, accent, shape and scale. Settings →
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
	/** Interface scale, 0.5–2 in steps of 0.1. */
	uiScale: number;
	density: Density;
	/** Kit corner roundness, 0–2; 1 is the reference design. */
	radius: number;
	/** Kit control and row heights, 0.85–1.2; touch sizes never drop below 44px. */
	spacing: number;
	/** Kit hairline strength, 0.5–2. */
	lines: number;
	/** Play the grid ignition when a flagship model is picked (desktop, motion allowed). */
	celebrations: boolean;
	/** Lit edges, softer layered shadows and a lifted selection; off keeps the flat look. */
	depth: boolean;
};

export const APPEARANCE_DEFAULTS: Appearance = {
	theme: "system",
	accent: null,
	hue: 240,
	saturation: 0,
	darkLightness: 8,
	uiScale: 1,
	density: "comfortable",
	radius: 1,
	spacing: 1,
	lines: 1,
	celebrations: true,
	depth: false,
};

export const APPEARANCE_LIMITS = {
	hue: { min: 0, max: 360, step: 1 },
	saturation: { min: 0, max: 100, step: 1 },
	darkLightness: { min: 0, max: 30, step: 1 },
	uiScale: { min: 0.5, max: 2, step: 0.1 },
	radius: { min: 0, max: 2, step: 0.05 },
	spacing: { min: 0.85, max: 1.2, step: 0.01 },
	lines: { min: 0.5, max: 2, step: 0.05 },
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
		uiScale: Math.round(clamp(raw.uiScale, l.uiScale.min, l.uiScale.max, d.uiScale) * 10) / 10,
		density: oneOf(raw.density, ["compact", "comfortable", "spacious"], d.density),
		radius: Math.round(clamp(raw.radius, l.radius.min, l.radius.max, d.radius) * 100) / 100,
		spacing: Math.round(clamp(raw.spacing, l.spacing.min, l.spacing.max, d.spacing) * 100) / 100,
		lines: Math.round(clamp(raw.lines, l.lines.min, l.lines.max, d.lines) * 100) / 100,
		celebrations: typeof raw.celebrations === "boolean" ? raw.celebrations : d.celebrations,
		depth: typeof raw.depth === "boolean" ? raw.depth : d.depth,
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
	const lightness = (dark ? value.darkLightness : 100 - value.saturation * 0.04) / 100;
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
	style.setProperty("--ui-scale", String(value.uiScale));
	style.setProperty("--kit-radius-scale", String(value.radius));
	style.setProperty("--kit-density", String(value.spacing));
	style.setProperty("--kit-line-scale", String(value.lines));
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
	root.setAttribute("data-depth", value.depth ? "on" : "off");
	if (root === document.documentElement) syncThemeColor(value);
}

/** The saved appearance, and whether it was saved under an older design generation and needs writing back. */
function readStored(): { value: Appearance; migrated: boolean } {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			const migrated =
				typeof parsed === "object" &&
				parsed !== null &&
				(parsed as Record<string, unknown>).design !== DESIGN_GENERATION;
			return { value: normalizeAppearance(migrateStored(parsed)), migrated };
		}
		return {
			value: normalizeAppearance({
				theme: localStorage.getItem(LEGACY_THEME_KEY),
				density: localStorage.getItem(LEGACY_DENSITY_KEY),
			}),
			migrated: false,
		};
	} catch {
		// Blocked storage, private windows or corrupt JSON: fall back to the defaults.
		return { value: APPEARANCE_DEFAULTS, migrated: false };
	}
}

/**
 * The design generation stored with the settings. Generation 2 is the Figma design system's
 * deeper dark canvas (8%, was 9%); settings saved before it move to the new default. Generation 3
 * puts depth back to off by default: generation 2 had switched it on for everyone and saved that,
 * so a stored `true` from before 3 is not a choice anyone made, and it goes back to off once.
 * Anything else the person chose stays.
 */
const DESIGN_GENERATION = 3;

function migrateStored(input: unknown): unknown {
	if (typeof input !== "object" || input === null) return input;
	const raw = input as Record<string, unknown>;
	if (raw.design === DESIGN_GENERATION) return raw;
	const beforeFigma = raw.design !== 2;
	return {
		...raw,
		darkLightness:
			beforeFigma && raw.darkLightness === 9
				? APPEARANCE_DEFAULTS.darkLightness
				: raw.darkLightness,
		depth: APPEARANCE_DEFAULTS.depth,
	};
}

function writeStored(value: Appearance): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...value, design: DESIGN_GENERATION }));
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

// Settings that switch in one step cross-fade; sliders apply instantly so dragging stays live.
const CROSS_FADE: readonly (keyof Appearance)[] = ["theme", "accent", "depth"];

/** Change some settings: normalise, apply, persist. A theme, accent or depth change cross-fades. */
export function updateAppearance(patch: Partial<Appearance>): void {
	const next = normalizeAppearance({ ...state, ...patch });
	const fades = CROSS_FADE.some((key) => key in patch && patch[key] !== state[key]);
	const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
	if (fades && !calm && typeof document.startViewTransition === "function") {
		document.startViewTransition(() => commit(next, true));
		return;
	}
	commit(next, true);
}

/** Put every appearance setting back to its default. */
export function resetAppearance(): void {
	commit(APPEARANCE_DEFAULTS, true);
}

/** Load the saved appearance and apply it; call once before the first render. */
export function restoreAppearance(): void {
	const stored = readStored();
	// Settings saved under an older design generation are written back once, so the pre-paint script in
	// index.html (which reads them raw) sees the migrated values too.
	commit(stored.value, stored.migrated);
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
