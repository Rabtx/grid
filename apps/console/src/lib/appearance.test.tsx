import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import {
	APPEARANCE_DEFAULTS,
	appearance,
	applyAppearance,
	canvasColor,
	installScaleShortcuts,
	normalizeAppearance,
	readableInk,
	resetAppearance,
	restoreAppearance,
	updateAppearance,
} from "./appearance";
import { installKeybindings } from "./keybindings";

afterEach(() => {
	resetAppearance();
	// After the reset, which saves the defaults, so each test starts from empty storage.
	localStorage.clear();
});

describe("normalizeAppearance", () => {
	it("keeps a known sidebar style and falls back to the full one", () => {
		expect(normalizeAppearance({ sidebar: "floating" }).sidebar).toBe("floating");
		expect(normalizeAppearance({ sidebar: "hovering" }).sidebar).toBe("full");
	});

	it("fills defaults for missing or invalid input", () => {
		expect(normalizeAppearance(null)).toEqual(APPEARANCE_DEFAULTS);
		expect(normalizeAppearance({ theme: "sepia", hue: "abc", accent: "blue" })).toEqual(
			APPEARANCE_DEFAULTS,
		);
	});

	it("clamps and rounds numbers into range", () => {
		const value = normalizeAppearance({
			hue: 400,
			saturation: -5,
			darkLightness: 12.6,
			uiScale: 1.26,
		});
		expect(value).toMatchObject({
			hue: 360,
			saturation: 0,
			darkLightness: 13,
			uiScale: 1.3,
		});
	});

	it("accepts a hex accent and lowercases it", () => {
		expect(normalizeAppearance({ accent: "#4DA3F5" }).accent).toBe("#4da3f5");
	});
});

describe("readableInk", () => {
	it("picks black on light accents and white on dark ones", () => {
		expect(readableInk("#f59e0b")).toBe("#000000");
		expect(readableInk("#1e3a8a")).toBe("#ffffff");
	});
});

describe("canvasColor", () => {
	it("matches the default canvases and a custom tint", () => {
		expect(canvasColor(APPEARANCE_DEFAULTS, false)).toBe("#ffffff");
		expect(canvasColor(APPEARANCE_DEFAULTS, true)).toBe("#141414");
		expect(canvasColor({ ...APPEARANCE_DEFAULTS, theme: "light" }, true)).toBe("#ffffff");
		expect(canvasColor({ ...APPEARANCE_DEFAULTS, theme: "dark", darkLightness: 0 }, false)).toBe(
			"#000000",
		);
		expect(
			canvasColor({ ...APPEARANCE_DEFAULTS, theme: "dark", hue: 0, saturation: 100 }, false),
		).toBe("#290000");
		// A tint reaches the light canvas too, which is pure white only at 0% saturation.
		expect(
			canvasColor({ ...APPEARANCE_DEFAULTS, theme: "light", hue: 0, saturation: 100 }, false),
		).toBe("#ffebeb");
	});
});

describe("applyAppearance", () => {
	it("writes the variables and classes the tokens read", () => {
		const root = document.createElement("div");
		applyAppearance(
			{ ...APPEARANCE_DEFAULTS, theme: "dark", accent: "#1e3a8a", hue: 200, uiScale: 1.2 },
			root,
		);
		expect(root.style.getPropertyValue("--hue")).toBe("200");
		expect(root.style.getPropertyValue("--ui-scale")).toBe("1.2");
		expect(root.style.getPropertyValue("--user-accent")).toBe("#1e3a8a");
		expect(root.style.getPropertyValue("--user-accent-ink")).toBe("#ffffff");
		expect(root.classList.contains("dark")).toBe(true);
		expect(root.getAttribute("data-density")).toBe("comfortable");
		// Depth is off by default; people opt in from Appearance.
		expect(root.getAttribute("data-depth")).toBe("off");

		applyAppearance({ ...APPEARANCE_DEFAULTS, theme: "system", depth: true }, root);
		expect(root.getAttribute("data-depth")).toBe("on");
		expect(root.style.getPropertyValue("--user-accent")).toBe("");
		expect(root.classList.contains("dark")).toBe(false);
		expect(root.classList.contains("light")).toBe(false);
	});

	it("updates the browser bar colour for the document theme", () => {
		const meta = document.createElement("meta");
		meta.name = "theme-color";
		document.head.append(meta);
		applyAppearance({ ...APPEARANCE_DEFAULTS, theme: "dark", darkLightness: 0 });
		expect(meta.content).toBe("#000000");
		applyAppearance({ ...APPEARANCE_DEFAULTS, theme: "light" });
		expect(meta.content).toBe("#ffffff");
		meta.remove();
	});
});

describe("corners, density and the accent", () => {
	it("writes the corner style, the density's heights and one accent for everything", () => {
		const root = document.createElement("div");
		applyAppearance(
			{ ...APPEARANCE_DEFAULTS, corners: "square", density: "spacious", accent: "#e5484d" },
			root,
		);
		expect(root.getAttribute("data-corners")).toBe("square");
		expect(root.getAttribute("data-density")).toBe("spacious");
		expect(root.style.getPropertyValue("--kit-density")).toBe("1.12");
		expect(root.style.getPropertyValue("--signal-accent")).toBe("#e5484d");
		expect(root.style.getPropertyValue("--user-accent")).toBe("#e5484d");
		applyAppearance(APPEARANCE_DEFAULTS, root);
		expect(root.getAttribute("data-corners")).toBe("round");
		expect(root.style.getPropertyValue("--kit-density")).toBe("1");
		expect(root.style.getPropertyValue("--signal-accent")).toBe("");
	});

	it("keeps pill as a corner style and drops one it does not know", () => {
		expect(normalizeAppearance({ corners: "pill" }).corners).toBe("pill");
		expect(normalizeAppearance({ corners: "blob" }).corners).toBe(APPEARANCE_DEFAULTS.corners);
	});
});

describe("persistence", () => {
	it("saves updates and restores them", () => {
		updateAppearance({ hue: 120, accent: "#10b981" });
		expect(JSON.parse(localStorage.getItem("grid.appearance") ?? "{}")).toMatchObject({
			hue: 120,
			accent: "#10b981",
		});
		restoreAppearance();
		flush();
		expect(appearance()).toMatchObject({ hue: 120, accent: "#10b981" });
	});

	it("moves settings saved before the Figma design onto its defaults", () => {
		localStorage.setItem(
			"grid.appearance",
			JSON.stringify({ ...APPEARANCE_DEFAULTS, darkLightness: 9, depth: true, hue: 30 }),
		);
		restoreAppearance();
		flush();
		expect(appearance()).toMatchObject({ darkLightness: 8, depth: false, hue: 30 });
		// Written back once, so the pre-paint script reads the migrated values too.
		expect(JSON.parse(localStorage.getItem("grid.appearance") ?? "{}")).toMatchObject({
			darkLightness: 8,
			depth: false,
			design: 4,
		});
	});

	it("turns depth back off once for settings saved when it was on by default", () => {
		localStorage.setItem(
			"grid.appearance",
			JSON.stringify({ ...APPEARANCE_DEFAULTS, darkLightness: 9, depth: true, design: 2 }),
		);
		restoreAppearance();
		flush();
		// The dark canvas was already chosen under generation 2, so it stays.
		expect(appearance()).toMatchObject({ darkLightness: 9, depth: false });
		expect(JSON.parse(localStorage.getItem("grid.appearance") ?? "{}")).toMatchObject({
			depth: false,
			design: 4,
		});
	});

	it("folds the old roundness, spacing and selection colour into their choices", () => {
		localStorage.setItem(
			"grid.appearance",
			JSON.stringify({
				...APPEARANCE_DEFAULTS,
				design: 3,
				depth: true,
				radius: 0,
				spacing: 0.88,
				accent: null,
				signal: "#8e5cf0",
			}),
		);
		restoreAppearance();
		flush();
		// Generation 3's depth was a real choice, so it stays.
		expect(appearance()).toMatchObject({
			depth: true,
			corners: "square",
			density: "compact",
			accent: "#8e5cf0",
		});
	});

	it("keeps a choice made under the current design", () => {
		updateAppearance({ depth: true, darkLightness: 9 });
		restoreAppearance();
		flush();
		expect(appearance()).toMatchObject({ depth: true, darkLightness: 9 });
	});

	it("migrates the earlier theme and density keys", () => {
		localStorage.setItem("grid.theme", "light");
		localStorage.setItem("grid.density", "compact");
		restoreAppearance();
		flush();
		expect(appearance()).toMatchObject({ theme: "light", density: "compact" });
	});
});

describe("installScaleShortcuts", () => {
	it("zooms with Ctrl + = / - / 0", () => {
		const dispose = installScaleShortcuts();
		const stop = installKeybindings(document);
		// Presses land back to back, as a held shortcut would, before any flush.
		const press = (key: string) =>
			document.body.dispatchEvent(
				new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }),
			);
		const scale = () => {
			flush();
			return appearance().uiScale;
		};
		press("=");
		expect(scale()).toBe(1.1);
		press("-");
		press("-");
		expect(scale()).toBe(0.9);
		press("0");
		expect(scale()).toBe(1);
		dispose();
		press("=");
		expect(scale()).toBe(1);
		stop();
	});
});
