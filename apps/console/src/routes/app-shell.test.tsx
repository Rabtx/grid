import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flush } from "solid-js";

import { AuthProvider, LoginForm } from "@/modules/auth";
import { useWorkspace } from "@/modules/projects";

import { AppShell } from "./app-shell";
import { RequireAuth } from "./require-auth";

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
						accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.endsWith("/workspaces")) return json(workspaces);
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

	it("lists every project once and opens the one in the URL at the page you are on", async () => {
		await settle();

		// Project rows are the links that fold open.
		const links = [
			...container.querySelectorAll<HTMLAnchorElement>(
				'nav[aria-label="Navigation"] a[aria-expanded]',
			),
		];
		expect(links.map((link) => link.querySelector(".truncate")?.textContent)).toEqual([
			"Alpha",
			"Beta",
		]);

		// The project in the URL is open, and the page you are on inside it is the current row.
		expect(links.map((link) => link.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
		const current = [
			...container.querySelectorAll<HTMLAnchorElement>(
				'nav[aria-label="Navigation"] a[aria-current="page"]',
			),
		];
		expect(current.map((link) => link.getAttribute("href"))).toEqual(["/board/beta"]);
	});

	it("names the active project in the title bar", async () => {
		await settle();

		expect(appHeader(container)?.querySelector("h1")?.textContent).toBe("Beta");
	});
});

/** The app's own title bar: the first header that is not inside a dialog. */
function appHeader(container: HTMLElement): HTMLElement | undefined {
	return [...container.querySelectorAll("header")].find((header) => !header.closest("dialog"));
}

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
						accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.endsWith("/workspaces")) return json(workspaces);
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
		const header = appHeader(container) as HTMLElement;
		return { header, dispose };
	}

	it("names the board after its project and offers New task there", async () => {
		const { header, dispose } = await mountAt("/board/beta");
		expect(header.textContent).toContain("Beta");
		expect(header.textContent).toContain("New task");
		dispose();
	});

	it("names other screens after themselves and drops the board's action", async () => {
		const { header, dispose } = await mountAt("/terminal");
		expect(header.textContent).toContain("Terminal");
		expect(header.textContent).not.toContain("New task");
		dispose();
	});
});

describe("login polish", () => {
	let container: HTMLElement;
	let dispose: (() => void) | undefined;
	const session = () => ({
		accessToken: "token",
		accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
		user: { id: "u1", email: "person@example.com", username: "person" },
	});
	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
	});
	afterEach(() => {
		dispose?.();
		container.remove();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	function mount(path: string, refresh: () => Promise<Response> = async () => json(null, 401)) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) =>
				input.toString().endsWith("/auth/refresh") ? refresh() : json(session()),
			),
		);
		function Location() {
			const location = useLocation();
			return (
				<output data-location>
					{location.pathname}
					{location.search}
				</output>
			);
		}
		const Router = createRouter({
			history: memoryHistory(path),
			routes: [
				{ path: "/login", component: LoginForm },
				{
					path: "*",
					component: () => (
						<RequireAuth>
							<p>Protected content</p>
						</RequireAuth>
					),
				},
			],
		});
		dispose = render(
			() => (
				<AuthProvider>
					<Router>
						{(route) => (
							<>
								<Location />
								{route.children}
							</>
						)}
					</Router>
				</AuthProvider>
			),
			container,
		);
		flush();
	}
	function location() {
		return container.querySelector("[data-location]")?.textContent;
	}
	async function signIn() {
		const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
		const password = container.querySelector<HTMLInputElement>(
			'input[autocomplete="current-password"]',
		)!;
		email.value = "person@example.com";
		email.dispatchEvent(new Event("input", { bubbles: true }));
		password.value = "password";
		password.dispatchEvent(new Event("input", { bubbles: true }));
		container.querySelector("form")!.requestSubmit();
		await settle();
	}
	it.each(["/board/alpha/tasks/7?filter=ready", "/terminal/abc?view=full"])(
		"returns to %s after sign-in",
		async (path) => {
			mount(path);
			await settle();
			expect(location()).toBe(`/login?next=${encodeURIComponent(path)}`);
			await signIn();
			expect(location()).toBe(path);
			expect(container.textContent).toContain("Protected content");
		},
	);
	it.each([
		"https://outside.example",
		"//outside.example",
		"/\\outside.example",
		"/\t/outside.example",
		"relative",
	])("rejects unsafe next %s", async (next) => {
		mount(`/login?next=${encodeURIComponent(next)}`);
		await settle();
		await signIn();
		expect(location()).toBe("/");
	});
	it("redirects a restored session to next", async () => {
		mount("/login?next=%2Fterminal%2Fabc%3Fview%3Dfull", async () => json(session()));
		await settle();
		expect(location()).toBe("/terminal/abc?view=full");
	});
	it("toggles password visibility without submitting or losing autocomplete", async () => {
		mount("/login");
		await settle();
		const input = container.querySelector<HTMLInputElement>(
			'input[autocomplete="current-password"]',
		)!;
		const toggle = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Show password"]',
		)!;
		expect(input.type).toBe("password");
		toggle.click();
		flush();
		expect(input.type).toBe("text");
		expect(toggle.getAttribute("aria-label")).toBe("Hide password");
		expect(toggle.getAttribute("aria-pressed")).toBe("true");
		expect(input.autocomplete).toBe("current-password");
		toggle.click();
		flush();
		expect(input.type).toBe("password");
		expect(location()).toBe("/login");
	});
	it("delays the loading mark by 300 ms and removes it when ready", async () => {
		vi.useFakeTimers();
		let finish!: (response: Response) => void;
		mount(
			"/board/alpha",
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		await vi.advanceTimersByTimeAsync(299);
		expect(container.querySelector('output[aria-label="Checking your session"]')).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		flush();
		expect(
			container.querySelector('output[aria-label="Checking your session"] img')?.className,
		).toContain("motion-safe:animate-pulse");
		finish(json(session()));
		await vi.advanceTimersByTimeAsync(0);
		flush();
		expect(container.querySelector('output[aria-label="Checking your session"]')).toBeNull();
		expect(container.textContent).toContain("Protected content");
	});
	it("never flashes the loading mark for a fast session check", async () => {
		vi.useFakeTimers();
		mount("/board/alpha", async () => json(session()));
		await vi.advanceTimersByTimeAsync(300);
		flush();
		expect(container.querySelector('output[aria-label="Checking your session"]')).toBeNull();
		expect(container.textContent).toContain("Protected content");
	});
});

describe("AppShell opening for someone signed in last time", () => {
	afterEach(() => {
		document.body.replaceChildren();
		localStorage.clear();
		vi.unstubAllGlobals();
	});

	it("draws the signed-in shell, workspace and all, while the session is still being confirmed", async () => {
		localStorage.setItem(
			"grid.session.user",
			JSON.stringify({ id: "u1", email: "person@example.com", username: "person" }),
		);
		// The session check never answers here: this is the moment before it does.
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise<Response>(() => {})),
		);
		function NeedsWorkspace() {
			const workspace = useWorkspace();
			return <p>workspace {workspace.projects().length}</p>;
		}
		const Router = createRouter({
			routes: [
				{
					path: "/board/:slug",
					component: () => (
						<RequireAuth>
							<NeedsWorkspace />
						</RequireAuth>
					),
				},
			],
			history: memoryHistory("/board/alpha"),
		});
		const container = document.createElement("div");
		document.body.append(container);
		const errors: unknown[] = [];
		const onError = (event: ErrorEvent) => errors.push(event.error);
		window.addEventListener("error", onError);
		const dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <AppShell>{route.children}</AppShell>}</Router>
				</AuthProvider>
			),
			container,
		);
		await settle();
		flush();
		window.removeEventListener("error", onError);

		expect(errors).toEqual([]);
		expect(container.querySelector('nav[aria-label="Navigation"]')).not.toBeNull();
		expect(container.textContent).toContain("workspace");
		dispose();
	});
});
