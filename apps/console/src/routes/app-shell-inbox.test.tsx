import { createRouter, memoryHistory, type RouteDefinition } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceHistory } from "@/lib/workspace-history";
import { AuthProvider } from "@/modules/auth";

import { AppShell } from "./app-shell";

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const workspaces = [
	{
		id: "w1",
		slug: "demo",
		name: "Demo",
		icon: null,
		color: null,
		role: "owner",
		isDefault: true,
		createdAt: "2026-09-26T00:00:00.000Z",
		updatedAt: "2026-09-26T00:00:00.000Z",
	},
];

async function settle(): Promise<void> {
	for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the shell's inbox", () => {
	let container: HTMLElement;
	let dispose: () => void;
	/** Every runner call the shell made, so the test can see what it asked and what it marked. */
	let calls: { path: string; body: string | null }[];

	beforeEach(() => {
		calls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.includes("/inbox")) {
					const at = new URL(url);
					calls.push({
						path: at.pathname + at.search,
						body: typeof init?.body === "string" ? init.body : null,
					});
					return Response.json({ data: { changed: 1, unread: 0 } });
				}
				if (url.endsWith("/projects")) return json([]);
				if (url.endsWith("/workspaces")) return json(workspaces);
				if (url.includes("/tasks")) return json([]);
				return json(null, 404);
			}),
		);
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		dispose();
		container.remove();
		window.history.replaceState({}, "", "/");
		vi.unstubAllGlobals();
	});

	/** Mounts the whole shell on a page, with the routes the shell links to. */
	function mountAt(path: string, routes: RouteDefinition[]): void {
		const Router = createRouter({ routes, history: memoryHistory(path) });
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
				</AuthProvider>
			),
			container,
		);
	}

	const ROUTES: RouteDefinition[] = [
		{ path: "/chat/:project/:id", component: () => <p>chat</p> },
		{ path: "/pulls/:slug", component: () => <p>pulls</p> },
		{ path: "/board/:slug", component: () => <p>board</p> },
		{ path: "/inbox", component: () => <p>inbox</p> },
	];

	it("marks the thread read when one is opened, and shows the count in the sidebar", async () => {
		mountAt("/chat/grid/s1", ROUTES);
		await settle();

		expect(calls.find((call) => call.path.endsWith("/inbox/read"))?.body).toBe(
			JSON.stringify({ path: "/chat/grid/s1" }),
		);
		// The rail has an Inbox, first among the destinations, named for screen readers and tooltips.
		const entry = container.querySelector<HTMLAnchorElement>('a[href$="/inbox"]');
		expect(entry?.getAttribute("aria-label")).toBe("Inbox");
	});

	it("marks a project's pull requests read when they are opened", async () => {
		mountAt("/pulls/grid", ROUTES);
		await settle();

		expect(calls.find((call) => call.path.endsWith("/inbox/read"))?.body).toBe(
			JSON.stringify({ path: "/pulls/grid" }),
		);
	});

	it("marks nothing on a page that is not waiting on anything", async () => {
		mountAt("/board/grid", ROUTES);
		await settle();

		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))).toEqual([]);
		// The count is still read, for the sidebar to show.
		expect(calls.some((call) => call.path.endsWith("/inbox/unread"))).toBe(true);
	});

	it("marks the same thread read when the address bar names the workspace first", async () => {
		// The address bar reads `/acme/chat/grid/s1`; the router, and so the inbox, deal in
		// `/chat/grid/s1`. The two must not be confused.
		window.history.replaceState({}, "", "/acme/chat/grid/s1");
		const Router = createRouter({ routes: ROUTES, history: workspaceHistory("/acme") });
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
				</AuthProvider>
			),
			container,
		);
		await settle();

		// The page itself opened, which is what says the workspace in the bar is not part of the
		// path the router — and so the inbox — sees.
		expect(container.textContent).toContain("chat");
		expect(calls.find((call) => call.path.endsWith("/inbox/read"))?.body).toBe(
			JSON.stringify({ path: "/chat/grid/s1" }),
		);
	});
});
