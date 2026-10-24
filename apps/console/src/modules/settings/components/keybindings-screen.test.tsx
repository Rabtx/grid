import { createRouter, memoryHistory } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindings, resetAllBindings } from "@/lib/keybindings";
import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";
import { ShellProvider, useShell } from "@/modules/shell";
import { WorkspacesProvider } from "@/modules/workspaces";

import { KeybindingsScreen } from "./keybindings-screen";

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

describe("KeybindingsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		resetAllBindings();
		localStorage.clear();
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
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
			routes: [{ path: "/settings/keybindings", component: KeybindingsScreen }],
			history: memoryHistory("/settings/keybindings"),
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
		resetAllBindings();
		localStorage.clear();
	});

	const recorder = (name: string) =>
		container.querySelector<HTMLButtonElement>(`button[aria-label="Change keys for ${name}"]`);
	const press = (init: KeyboardEventInit) =>
		window.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
		);

	it("lists every group with each command's keys", async () => {
		await settle();
		const text = container.textContent ?? "";
		for (const group of ["General", "Navigation", "Tabs", "Chat", "View", "Lists"])
			expect(text).toContain(group);
		expect(recorder("Close tab")).not.toBeNull();
	});

	it("records a chord, moves a taken key, and restores the default", async () => {
		await settle();
		recorder("Close tab")?.click();
		await settle();
		expect(container.textContent).toContain("Press keys…");
		press({ key: "k", code: "KeyK", ctrlKey: true });
		await settle();
		expect(bindings("tab.close")).toEqual(["mod+k"]);
		expect(bindings("palette.toggle")).toEqual([]);

		container
			.querySelector<HTMLButtonElement>(
				'button[aria-label="Restore the default keys for Close tab"]',
			)
			?.click();
		await settle();
		expect(bindings("tab.close")).toEqual(["alt+w"]);
	});

	it("records two plain keys in turn as a sequence, and Escape gives up", async () => {
		await settle();
		recorder("Go to board")?.click();
		await settle();
		press({ key: "Escape" });
		await settle();
		expect(bindings("go.board")).toEqual(["g b"]);

		recorder("Go to board")?.click();
		await settle();
		press({ key: "x" });
		press({ key: "b" });
		await settle();
		expect(bindings("go.board")).toEqual(["x b"]);
	});
});
