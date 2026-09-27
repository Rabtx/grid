import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";

import { GitControl, type WorkPlace } from "./git-control";

const json = (data: unknown): Response =>
	new Response(JSON.stringify({ success: true, statusCode: 200, data }), {
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
	HTMLElement.prototype.showPopover ??= vi.fn();
	HTMLElement.prototype.hidePopover ??= vi.fn();
});

function mount(withPlace: boolean) {
	const calls: { url: string; body?: string }[] = [];
	let branch = "main";
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = input.toString();
			calls.push({ url, body: init?.body ? String(init.body) : undefined });
			if (url.endsWith("/auth/refresh"))
				return json({
					accessToken: "token",
					accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
					user: { id: "u1", email: "person@example.com", username: "person" },
				});
			if (url.includes("/fs/git/checkout")) {
				branch = (JSON.parse(String(init?.body)) as { branch: string }).branch;
				return json({
					repo: true,
					branch,
					branches: [branch, "main"],
					changed: 0,
					worktree: false,
				});
			}
			if (url.includes("/fs/git"))
				return json({
					repo: true,
					branch,
					branches: ["main", "feature/cart"],
					changed: 2,
					worktree: false,
				});
			return json(null);
		}),
	);
	const [place, setPlace] = createSignal<WorkPlace>({ worktree: false, branch: "" });
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => (
			<AuthProvider>
				<GitControl
					folder="/p/shop"
					scope=""
					{...(withPlace ? { place: place(), onPlace: setPlace } : {})}
				/>
			</AuthProvider>
		),
		container,
	);
	const button = (text: string) =>
		[...document.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
			item.textContent?.includes(text),
		);
	const open = async () => {
		container.querySelector<HTMLButtonElement>("button")?.click();
		await settle();
	};
	return { container, calls, place, button, open, done: () => (dispose(), container.remove()) };
}

describe("GitControl", () => {
	let done = () => {};
	afterEach(() => {
		done();
		vi.unstubAllGlobals();
	});

	it("shows the branch and its changes, and switches or creates a branch", async () => {
		const view = mount(false);
		done = view.done;
		await settle();
		expect(view.container.textContent).toContain("main");
		expect(view.container.textContent).toContain("±2");
		await view.open();
		view.button("feature/cart")?.click();
		await settle();
		expect(view.calls.find((call) => call.url.includes("/fs/git/checkout"))?.body).toBe(
			JSON.stringify({ path: "/p/shop", branch: "feature/cart", create: false }),
		);

		// Choosing closes it; it opens again to search.
		await view.open();
		const search = document.querySelector<HTMLInputElement>(
			'input[aria-label="Find or create a branch"]',
		);
		if (!search) throw new Error("no search");
		search.value = "fix/login";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		view.button("Create fix/login")?.click();
		await settle();
		expect(view.calls.at(-1)?.body).toBe(
			JSON.stringify({ path: "/p/shop", branch: "fix/login", create: true }),
		);
	});

	it("offers a new worktree before the first message, on a branch you name", async () => {
		const view = mount(true);
		done = view.done;
		await settle();
		await view.open();
		view.button("New worktree")?.click();
		await settle();
		expect(view.place()).toEqual({ worktree: true, branch: "" });
		const name = document.querySelector<HTMLInputElement>('input[aria-label="New branch"]');
		if (!name) throw new Error("no branch field");
		name.value = "feature/search";
		name.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		expect(view.place()).toEqual({ worktree: true, branch: "feature/search" });
		// Nothing is checked out: the worktree is made when the message is sent.
		expect(view.calls.some((call) => call.url.includes("/fs/git/checkout"))).toBe(false);
	});
});
