import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";

import { AppShell } from "./app-shell";

const projects = [
	{ slug: "alpha", name: "Alpha" },
	{ slug: "beta", name: "Beta" },
].map((project) => ({
	...project,
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
}));

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AppShell", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
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
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json([]);
				return json(null, 404);
			}),
		);

		const Router = createRouter({
			routes: [{ path: "/board/:slug", component: () => <p>board</p> }],
			history: memoryHistory("/board/beta"),
		});

		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
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

	it("lists every project and marks the one in the URL as current", async () => {
		await settle();

		// The list renders twice — phone drawer and desktop sidebar — from one shared component.
		const links = [
			...container.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Projects"] a'),
		];
		expect(links.map((link) => link.querySelector(".truncate")?.textContent)).toEqual([
			"Alpha",
			"Beta",
			"Alpha",
			"Beta",
		]);

		const current = links.filter((link) => link.getAttribute("aria-current") === "page");
		expect(current.map((link) => link.getAttribute("href"))).toEqual([
			"/board/beta",
			"/board/beta",
		]);
	});

	it("shows the signed-in email and the active project in the top bar", async () => {
		await settle();

		expect(container.textContent).toContain("person@example.com");
		expect(container.querySelector("header p")?.textContent).toBe("Beta");
	});
});

describe("AppShell top bar", () => {
	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	async function mountAt(path: string): Promise<{ header: HTMLElement; dispose: () => void }> {
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
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json([]);
				return json(null, 404);
			}),
		);
		const Router = createRouter({
			routes: [
				{ path: "/board/:slug", component: () => <p>board</p> },
				{ path: "/terminal", component: () => <p>terminal</p> },
			],
			history: memoryHistory(path),
		});
		const container = document.createElement("div");
		document.body.append(container);
		const dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
				</AuthProvider>
			),
			container,
		);
		await settle();
		const header = container.querySelector("header.glass") as HTMLElement;
		return { header, dispose };
	}

	it("names the board after its project and offers New task there", async () => {
		const { header, dispose } = await mountAt("/board/beta");
		expect(header.textContent).toContain("Beta");
		expect(header.querySelector('button[aria-label="New task"]')).not.toBeNull();
		dispose();
	});

	it("names other screens after themselves and drops the board's action", async () => {
		const { header, dispose } = await mountAt("/terminal");
		expect(header.textContent).toContain("Terminal");
		expect(header.querySelector('button[aria-label="New task"]')).toBeNull();
		dispose();
	});
});
