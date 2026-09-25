import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "../context/workspace-context";

import { FilesScreen } from "./files-screen";

const project = {
	slug: "alpha",
	name: "Alpha",
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
};
const json = (data: unknown): Response =>
	new Response(JSON.stringify({ success: true, statusCode: 200, data }), {
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("FilesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let created: { path: string; name: string; kind: string } | null;
	let calls: string[];

	beforeEach(() => {
		created = null;
		calls = [];
		if (!HTMLDialogElement.prototype.showModal)
			HTMLDialogElement.prototype.showModal = function () {
				this.open = true;
			};
		if (!HTMLDialogElement.prototype.close)
			HTMLDialogElement.prototype.close = function () {
				this.open = false;
			};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				calls.push(url);
				if (url.endsWith("/auth/refresh"))
					return json({
						accessToken: "token",
						accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				if (url.endsWith("/projects")) return json([project]);
				if (url.endsWith("/projects/folders")) return json({ alpha: "/tmp/alpha" });
				if (url.includes("/projects/files/alpha")) {
					if (init?.method === "POST") {
						created = JSON.parse(String(init.body)) as typeof created;
						return json(created);
					}
					const path = new URL(url).searchParams.get("path") ?? "";
					return json({
						path,
						entries:
							path === ""
								? [
										{ name: "src", path: "src", kind: "folder" },
										{ name: "readme.md", path: "readme.md", kind: "file" },
										...(created && created.path === ""
											? [{ name: created.name, path: created.name, kind: created.kind }]
											: []),
									]
								: [],
					});
				}
				return json(null);
			}),
		);
		const Router = createRouter({
			routes: [{ path: "/files/:slug", component: FilesScreen }],
			history: memoryHistory("/files/alpha"),
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
	});

	it("opens a nested folder and uses its relative path", async () => {
		await settle();
		expect(container.textContent).toContain("readme.md");
		const folder = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "src",
		);
		folder?.click();
		await settle();
		expect(calls.some((url) => url.endsWith("/projects/files/alpha?path=src"))).toBe(true);
		expect(container.textContent).toContain("This folder is empty");
	});

	it("creates a file in the current directory", async () => {
		await settle();
		const add = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "File",
		);
		expect(add).toBeDefined();
		add?.click();
		await settle();
		const input = container.querySelector<HTMLInputElement>('input[placeholder="notes.md"]');
		expect(input).not.toBeNull();
		if (input) {
			input.value = "notes.md";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
		await settle();
		expect(created).toEqual({ path: "", name: "notes.md", kind: "file" });
		expect(container.textContent).toContain("notes.md");
	});
});
