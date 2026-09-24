import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppearance } from "@/lib/appearance";
import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { AppearanceScreen } from "./appearance-screen";

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AppearanceScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		resetAppearance();
		localStorage.clear();
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json([]);
				return json(null, 404);
			}),
		);

		const Router = createRouter({
			routes: [{ path: "/settings/appearance", component: AppearanceScreen }],
			history: memoryHistory("/settings/appearance"),
		});

		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
				</AuthProvider>
			),
			container,
		);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
		resetAppearance();
		localStorage.clear();
	});

	it("renders the four groups and the device note", async () => {
		await settle();

		const text = container.textContent ?? "";
		expect(text).toContain("Appearance");
		expect(text).toContain("Theme");
		expect(text).toContain("Colour");
		expect(text).toContain("Translucency");
		expect(text).toContain("Layout");
		expect(text).toContain("These settings are saved on this device.");
	});

	it("applies a hue change to the document root as it happens", async () => {
		await settle();

		const hue = container.querySelector<HTMLInputElement>('input[aria-label="Hue"]');
		expect(hue).not.toBeNull();
		if (hue) {
			hue.value = "120";
			hue.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();

		expect(document.documentElement.style.getPropertyValue("--hue")).toBe("120");
	});

	it("sets the accent from a preset swatch", async () => {
		await settle();

		const swatch = container.querySelector<HTMLButtonElement>('button[aria-label="#4da3f5"]');
		expect(swatch).not.toBeNull();
		swatch?.click();
		await settle();

		expect(document.documentElement.style.getPropertyValue("--user-accent")).toBe("#4da3f5");
		expect(swatch?.getAttribute("aria-pressed")).toBe("true");
	});

	it("switches to the dark theme", async () => {
		await settle();

		const dark = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Dark",
		);
		expect(dark).toBeDefined();
		dark?.click();
		await settle();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("restores the defaults from the header button", async () => {
		await settle();

		const hue = container.querySelector<HTMLInputElement>('input[aria-label="Hue"]');
		if (hue) {
			hue.value = "120";
			hue.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		expect(document.documentElement.style.getPropertyValue("--hue")).toBe("120");

		const restore = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Restore defaults"),
		);
		expect(restore).toBeDefined();
		restore?.click();
		await settle();

		expect(document.documentElement.style.getPropertyValue("--hue")).toBe("240");
	});
});
