import { createRouter, memoryHistory } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppearance } from "@/lib/appearance";
import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";
import { ShellProvider, useShell } from "@/modules/shell";
import { WorkspacesProvider } from "@/modules/workspaces";

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

/** The top bar's actions, where the page puts its menu. */
function ShellActions(): JSX.Element {
	const shell = useShell();
	return <div data-slot="actions">{shell.actions()?.()}</div>;
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
					<Router>
						{(route) => (
							<WorkspacesProvider>
								<WorkspaceProvider>
									<ShellProvider>
										<ShellActions />
										{route.children}
									</ShellProvider>
								</WorkspaceProvider>
							</WorkspacesProvider>
						)}
					</Router>
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

	it("renders its groups, the shape controls and the device note", async () => {
		await settle();

		const text = container.textContent ?? "";
		expect(text).toContain("Appearance");
		for (const group of ["Theme", "Accent", "Text & layout", "Motion & sound", "Colour", "Shape"])
			expect(text).toContain(group);
		for (const name of ["Hue", "Saturation", "Corner roundness", "Spacing", "Line strength"])
			expect(container.querySelector(`input[aria-label="${name}"]`), name).not.toBeNull();
		expect(text).toContain("Make Grid feel like yours. Changes apply on this device.");
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

	it("reshapes the whole kit from the corner roundness slider", async () => {
		await settle();

		const radius = container.querySelector<HTMLInputElement>(
			'input[aria-label="Corner roundness"]',
		);
		expect(radius).not.toBeNull();
		if (radius) {
			radius.value = "0";
			radius.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();

		expect(document.documentElement.style.getPropertyValue("--kit-radius-scale")).toBe("0");
	});

	it("sets the accent and the button colour from their swatches", async () => {
		await settle();

		const violet = container.querySelector<HTMLButtonElement>('button[aria-label="Violet"]');
		violet?.click();
		await settle();
		expect(document.documentElement.style.getPropertyValue("--signal-accent")).toBe("#8e5cf0");
		expect(violet?.getAttribute("aria-pressed")).toBe("true");

		const pink = container.querySelector<HTMLButtonElement>('button[aria-label="Pink"]');
		pink?.click();
		await settle();
		expect(document.documentElement.style.getPropertyValue("--user-accent")).toBe("#ec4899");
	});

	it("labels the rail and slows motion when asked", async () => {
		await settle();

		container.querySelector<HTMLButtonElement>('button[aria-label="Rail labels"]')?.click();
		container.querySelector<HTMLButtonElement>('button[aria-label="Reduce motion"]')?.click();
		await settle();
		expect(document.documentElement.getAttribute("data-rail-labels")).toBe("on");
		expect(document.documentElement.getAttribute("data-motion")).toBe("reduced");
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

	it("restores the defaults from the page's menu", async () => {
		await settle();

		const hue = container.querySelector<HTMLInputElement>('input[aria-label="Hue"]');
		if (hue) {
			hue.value = "120";
			hue.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		expect(document.documentElement.style.getPropertyValue("--hue")).toBe("120");

		container.querySelector<HTMLButtonElement>('button[aria-label="Appearance"]')?.click();
		await settle();
		[...document.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent?.trim() === "Restore defaults")
			?.click();
		await settle();

		expect(document.documentElement.style.getPropertyValue("--hue")).toBe("240");
	});
});
