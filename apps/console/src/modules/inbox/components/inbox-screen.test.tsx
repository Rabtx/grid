import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "@solidjs/web";
import { flush } from "solid-js";

import { AuthProvider } from "@/modules/auth";

import { inboxStore } from "../stores/inbox";
import type { InboxItem } from "../types/inbox.types";

import { InboxScreen } from "./inbox-screen";

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
	id: "turn_done:s1:2026-09-28T09:00:00.000Z",
	kind: "turn_done",
	project: "grid",
	title: "Fix the login",
	body: "Finished — tap to see what it did.",
	url: "/chat/grid/s1",
	createdAt: new Date().toISOString(),
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
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	/** Mounts the page at `/inbox`, with `/chat/…` and `/pulls/…` to land on after a tap. */
	function mount(): void {
		const Router = createRouter({
			routes: [
				{ path: "/inbox", component: InboxScreen },
				{ path: "/chat/:project/:id", component: Where },
				{ path: "/pulls/:slug", component: Where },
			],
			history: memoryHistory("/inbox"),
		});
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => route.children}</Router>
				</AuthProvider>
			),
			container,
		);
	}

	// A list row is the one button with a truncated title; the header's own buttons are not.
	const rows = () =>
		[...container.querySelectorAll("button")].filter((button) => button.querySelector(".truncate"));
	const titles = () => rows().map((row) => row.querySelector(".truncate")?.textContent ?? "");

	it("lists what is waiting across projects, marking the unread ones", async () => {
		runner({ github: true });
		mount();
		await settle();

		expect(titles()).toEqual(["Fix the login", "Add the inbox"]);
		// Each row says which project it is from, and what is waiting.
		expect(rows()[0]?.textContent).toContain("grid · Finished");
		expect(container.querySelector("header h2")?.textContent).toBe("Inbox");
		expect(container.querySelector("header")?.textContent).toContain("1 waiting");
		// Only the unread row carries the dot.
		expect(container.querySelectorAll('[aria-label="Unread"]')).toHaveLength(1);
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
		mount();
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
			(button) => button.textContent === "Mark all read",
		);
		expect(all).toBeTruthy();
		all?.click();
		await settle();

		expect(calls.filter((call) => call.path.endsWith("/inbox/read"))[0]?.body).toBe("{}");
		expect(
			[...container.querySelectorAll("button")].some(
				(button) => button.textContent === "Mark all read",
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
		expect(container.querySelector("header")?.textContent).toContain("Nothing waiting");
	});

	it("shows what went wrong, and offers another go", async () => {
		runner({ fail: true });
		mount();
		await settle();

		expect(container.textContent).toContain("The runner is not running.");
		expect(
			[...container.querySelectorAll("button")].some((b) => b.textContent === "Try again"),
		).toBe(true);
	});
});
