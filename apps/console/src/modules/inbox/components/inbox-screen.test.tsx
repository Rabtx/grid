import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "@solidjs/web";
import { flush } from "solid-js";

import { AuthProvider } from "@/modules/auth";
import { ShellProvider, useShell } from "@/modules/shell";

import { inboxStore } from "../stores/inbox";
import type { InboxItem } from "../types/inbox.types";

import { InboxScreen } from "./inbox-screen";

// One moment for every row that does not name its own, so two rows never sort by which millisecond
// the fixture happened to be built in.
const NOW = new Date().toISOString();
const EARLIER = new Date(Date.parse(NOW) - 60_000).toISOString();

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
	id: "turn_done:s1:2026-09-28T09:00:00.000Z",
	kind: "turn_done",
	project: "grid",
	title: "Fix the login",
	body: "Finished — tap to see what it did.",
	url: "/chat/grid/s1",
	createdAt: NOW,
	readAt: null,
	...over,
});

const items = [
	item(),
	item({
		id: "pull_review:grid:12",
		kind: "pull_review",
		title: "Add the inbox",
		body: "@sam asked for your review",
		url: "/pulls/grid?pr=12",
		createdAt: EARLIER,
		readAt: "2026-09-28T09:05:00.000Z",
	}),
];

/** The runner's answer for one test: what `/inbox` holds, and every call it was given. */
function runner(answer: { items?: InboxItem[]; github?: boolean; fail?: boolean }) {
	const calls: { path: string; body: string | null }[] = [];
	const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = input.toString();
		if (url.includes("/auth/refresh")) {
			return Response.json({
				success: true,
				statusCode: 200,
				data: {
					accessToken: "token",
					accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
					user: { id: "u1", email: "person@example.com", username: "person" },
				},
			});
		}
		if (url.includes("/inbox/read") || url.includes("/inbox/unread")) {
			calls.push({
				path: new URL(url).pathname,
				body: typeof init?.body === "string" ? init.body : null,
			});
			return Response.json({ data: { changed: 1, unread: 0 } });
		}
		if (url.includes("/inbox")) {
			calls.push({ path: new URL(url).pathname + new URL(url).search, body: null });
			if (answer.fail) {
				return Response.json({ message: "The runner is not running." }, { status: 503 });
			}
			const held = answer.items ?? items;
			return Response.json({
				data: {
					items: held,
					unread: held.filter((row) => !row.readAt).length,
					github: answer.github ?? false,
				},
			});
		}
		return Response.json({ success: true, statusCode: 200, data: null });
	});
	vi.stubGlobal("fetch", fetch);
	return calls;
}

/** The shell's top bar as the screen fills it: the breadcrumb step, the actions, the subtitle. */
function Bar(): JSX.Element {
	const shell = useShell();
	return (
		<header>
			<h2>Inbox</h2>
			<span data-crumb>{shell.crumb()?.()}</span>
			<span data-subtitle>{shell.subtitle()?.()}</span>
			{shell.actions()?.()}
		</header>
	);
}

/** Where the router ended up, so a test can see the row took the person there. */
function Where(): JSX.Element {
	return <p>{useLocation().pathname}</p>;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("InboxScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		// A phone: rows open where they live. Desktop rows pick the one shown beside the list.
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	/** Mounts the page at `/inbox`, with `/chat/…` and `/pulls/…` to land on after a tap. */
	function mount(path = "/inbox"): void {
		const Router = createRouter({
			routes: [
				{ path: "/inbox", component: InboxScreen },
				{ path: "/chat/:project/:id", component: Where },
				{ path: "/pulls/:slug", component: Where },
			],
			history: memoryHistory(path),
		});
		dispose = render(
			() => (
				<AuthProvider>
					<Router>
						{(route) => (
							<ShellProvider>
								<Bar />
								{route.children}
							</ShellProvider>
						)}
					</Router>
				</AuthProvider>
			),
			container,
		);
	}

	// A list row is a button with a truncated title in its first line.
	const rows = () =>
		[...container.querySelectorAll("section button")].filter((button) =>
			button.querySelector(".truncate"),
		) as HTMLButtonElement[];
	const titles = () => rows().map((row) => row.querySelector(".truncate")?.textContent ?? "");

	it("opens on what needs you, and lists everything under All activity", async () => {
		runner({ github: true });
		mount();
		await settle();

		// Needs you: only the unread row, grouped by day, saying which project and what is waiting.
		expect(titles()).toEqual(["Fix the login"]);
		expect(rows()[0]?.textContent).toContain("grid");
		expect(rows()[0]?.textContent).toContain("Finished");
		expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Today");
		expect(container.querySelector("[data-crumb]")?.textContent).toBe("Needs you");
		expect(container.querySelector("[data-subtitle]")?.textContent).toBe("1 needs you");
		expect(
			[...container.querySelectorAll(".sr-only")].filter((el) => el.textContent === "Unread"),
		).toHaveLength(1);
		dispose();

		mount("/inbox?view=all");
		await settle();
		expect(titles()).toEqual(["Fix the login", "Add the inbox"]);
		expect(container.querySelector("[data-crumb]")?.textContent).toBe("All activity");
	});

	it("marks the item read and follows it when a row is tapped", async () => {
		const calls = runner({});
		mount();
		await settle();

		rows()[0]?.click();
		await settle();

		// Everything waiting about that thread is dealt with, not only the row tapped.
		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))[0]?.body).toBe(
			JSON.stringify({ path: "/chat/grid/s1" }),
		);
		expect(container.textContent).toContain("/chat/grid/s1");
		// The count the sidebar shows has come down with it.
		expect(inboxStore.unread()).toBe(0);
	});

	it("marks a pull request's own page read, query and all", async () => {
		const calls = runner({});
		mount("/inbox?view=all");
		await settle();

		rows()[1]?.click();
		await settle();

		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))[0]?.body).toBe(
			JSON.stringify({ path: "/pulls/grid" }),
		);
		expect(container.textContent).toContain("/pulls/grid");
	});

	it("marks everything read when asked, and offers it only while something is unread", async () => {
		const calls = runner({});
		mount();
		await settle();

		const all = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Mark all done",
		);
		expect(all).toBeTruthy();
		all?.click();
		await settle();

		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))[0]?.body).toBe("{}");
		expect(
			[...container.querySelectorAll("button")].some(
				(button) => button.textContent === "Mark all done",
			),
		).toBe(false);
	});

	it("asks GitHub again only when Refresh is pressed", async () => {
		const calls = runner({});
		mount();
		await settle();
		expect(calls.filter((call) => call.path.endsWith("/inbox"))).toHaveLength(1);

		const refresh = container.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]');
		refresh?.click();
		await settle();
		expect(calls.filter((call) => call.path.endsWith("/inbox?refresh=1"))).toHaveLength(1);
	});

	it("says so when nothing is waiting, and when GitHub is not connected", async () => {
		runner({ items: [] });
		mount();
		await settle();

		expect(container.textContent).toContain("Nothing is waiting on you");
		expect(container.textContent).toContain("Connect GitHub");
		expect(container.querySelector("[data-subtitle]")?.textContent).toBe("Nothing waiting");
	});

	it("shows the picked item beside the list on desktop, and E marks it done", async () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query.includes("min-width"),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		const calls = runner({});
		mount("/inbox?view=all");
		await settle();

		rows()[1]?.click();
		await settle();
		// Picking a row shows it, and stays on the Inbox.
		expect(rows()[1]?.getAttribute("aria-current")).toBe("true");
		expect(container.querySelector("article h2")?.textContent).toBe("Add the inbox");
		expect(container.querySelector("article")?.textContent).toContain("Open pull request");
		expect(container.textContent).not.toContain("/pulls/grid");

		// The first row is unread; E deals with that one item without leaving.
		rows()[0]?.click();
		await settle();
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
		await settle();
		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))[0]?.body).toBe(
			JSON.stringify({ id: "turn_done:s1:2026-09-28T09:00:00.000Z" }),
		);
		expect(container.querySelector("article h2")?.textContent).toBe("Fix the login");
	});

	it("moves to the next item when one is done in Needs you, and J and K step through", async () => {
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query.includes("min-width"),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		const three = [
			item({ id: "a", title: "First", url: "/chat/grid/a" }),
			item({ id: "b", title: "Second", url: "/chat/grid/b", createdAt: EARLIER }),
			item({
				id: "c",
				title: "Third",
				url: "/chat/grid/c",
				createdAt: new Date(Date.parse(EARLIER) - 60_000).toISOString(),
			}),
		];
		const calls = runner({ items: three });
		mount();
		await settle();
		const key = (name: string) =>
			document.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
		const shownTitle = () => container.querySelector("article h2")?.textContent;

		expect(shownTitle()).toBe("First");
		key("j");
		await settle();
		expect(shownTitle()).toBe("Second");
		key("e");
		await settle();
		// Second is done and gone from Needs you; the one after it is on show, not the top one.
		expect(titles()).toEqual(["First", "Third"]);
		expect(shownTitle()).toBe("Third");
		expect(calls.filter((call) => call.path.endsWith("/inbox/read")).map((c) => c.body)).toEqual([
			JSON.stringify({ id: "b" }),
		]);
		key("k");
		await settle();
		expect(shownTitle()).toBe("First");
	});

	it("keeps Refresh and Mark all done within reach on phones, and filters by project", async () => {
		runner({});
		mount("/inbox?view=all&project=grid");
		await settle();

		const phoneButtons = [...container.querySelectorAll("button")].map((b) => b.textContent);
		expect(phoneButtons).toContain("Mark all done");
		expect(container.querySelectorAll('button[aria-label="Refresh"]').length).toBeGreaterThan(0);
		// The project filter is shown and can be cleared.
		expect(container.querySelector("[data-subtitle]")?.textContent).toContain("grid");
		expect(phoneButtons).toContain("grid");
	});

	it("shows what went wrong, and offers another go", async () => {
		runner({ fail: true });
		mount();
		await settle();

		expect(container.textContent).toContain("The runner is not running.");
		// A failed read knows nothing about what is waiting, so it does not claim nothing is.
		expect(container.textContent).not.toContain("Nothing is waiting on you");
		expect(container.textContent).not.toContain("Connect GitHub");
		expect(
			[...container.querySelectorAll("button")].some((b) => b.textContent === "Try again"),
		).toBe(true);
	});
});
