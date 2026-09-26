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

afterEach(() => {
	resetAppearance();
	// After the reset, which saves the defaults, so each test starts from empty storage.
	localStorage.clear();
});

describe("normalizeAppearance", () => {
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
			glassOpacity: 0.05,
			glassBlur: 100,
			uiScale: 1.26,
		});
		expect(value).toMatchObject({
			hue: 360,
			saturation: 0,
			darkLightness: 13,
			glassOpacity: 0.15,
			glassBlur: 64,
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
		expect(canvasColor(APPEARANCE_DEFAULTS, false)).toBe("#fdfdfd");
		expect(canvasColor(APPEARANCE_DEFAULTS, true)).toBe("#171717");
		expect(canvasColor({ ...APPEARANCE_DEFAULTS, theme: "light" }, true)).toBe("#fdfdfd");
		expect(canvasColor({ ...APPEARANCE_DEFAULTS, theme: "dark", darkLightness: 0 }, false)).toBe(
			"#000000",
		);
		expect(
			canvasColor({ ...APPEARANCE_DEFAULTS, theme: "dark", hue: 0, saturation: 100 }, false),
		).toBe("#2e0000");
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

		applyAppearance({ ...APPEARANCE_DEFAULTS, theme: "system" }, root);
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
		expect(meta.content).toBe("#fdfdfd");
		meta.remove();
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
		const dispose = installScaleShortcuts(window);
		// Presses land back to back, as a held shortcut would, before any flush.
		const press = (key: string) =>
			window.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true }));
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
	});
});
