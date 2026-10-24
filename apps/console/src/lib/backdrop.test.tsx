import { flush } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { applyAppearance, APPEARANCE_DEFAULTS, normalizeAppearance } from "./appearance";
import { applyBackdropImage, hasBackdropImage } from "./backdrop";

describe("background image", () => {
	it("keeps its settings in range", () => {
		const value = normalizeAppearance({ backdrop: "app", backdropOpacity: 5, backdropBlur: 99 });
		expect(value).toMatchObject({ backdrop: "app", backdropOpacity: 30, backdropBlur: 40 });
		expect(normalizeAppearance({ backdrop: "everywhere" }).backdrop).toBe("sidebar");
	});

	it("tells the stylesheet where it goes and how see-through the interface is", () => {
		const root = document.createElement("div");
		applyAppearance(
			{ ...APPEARANCE_DEFAULTS, backdrop: "app", backdropOpacity: 60, backdropBlur: 12 },
			root,
		);
		expect(root.getAttribute("data-backdrop")).toBe("app");
		expect(root.style.getPropertyValue("--backdrop-opacity")).toBe("60%");
		expect(root.style.getPropertyValue("--backdrop-blur")).toBe("12px");
	});

	it("is on only while there is an image", () => {
		const root = document.createElement("div");
		URL.createObjectURL = vi.fn(() => "blob:test");
		URL.revokeObjectURL = vi.fn();
		applyBackdropImage(new Blob(["x"], { type: "image/png" }), root);
		expect(root.getAttribute("data-backdrop-image")).toBe("on");
		expect(root.style.getPropertyValue("--backdrop-image")).toBe('url("blob:test")');
		flush();
		expect(hasBackdropImage()).toBe(true);
		applyBackdropImage(null, root);
		expect(root.getAttribute("data-backdrop-image")).toBe("off");
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
	});
});
