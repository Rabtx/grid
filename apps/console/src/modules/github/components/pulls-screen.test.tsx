import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { PullsScreen } from "./pulls-screen";

const project = {
	slug: "alpha",
	name: "Alpha",
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
};
const summary = {
	number: 12,
	title: "Add login",
	author: "ana",
	branch: "login",
	base: "main",
	draft: false,
	review: "APPROVED",
	checks: "failing",
	labels: ["ui"],
	additions: 10,
	deletions: 2,
	updatedAt: "2026-09-27T10:00:00Z",
	url: "https://github.com/acme/app/pull/12",
};
const detail = {
	...summary,
	body: "Adds **login**.",
	state: "OPEN",
	mergeable: "MERGEABLE",
	checkList: [{ name: "lint", workflow: "CI", state: "failure", url: "https://ci/1" }],
	conversation: [{ author: "bo", body: "Nice", at: "2026-09-27T10:01:00Z" }],
	files: [{ path: "src/login.ts", additions: 10, deletions: 2 }],
	createdAt: "2026-09-27T09:00:00Z",
};

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(status < 400 ? { success: true, statusCode: status, data } : data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(path: string, answer: (url: string, init?: RequestInit) => Response | null) {
	const calls: { url: string; init?: RequestInit }[] = [];
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
			calls.push({ url, init });
			if (url.endsWith("/auth/refresh"))
				return json({
					accessToken: "token",
					accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
					user: { id: "u1", email: "person@example.com", username: "person" },
				});
			if (url.endsWith("/projects")) return json([project]);
			if (url.endsWith("/projects/folders")) return json({ alpha: "/tmp/alpha" });
			return answer(url, init) ?? json(null);
		}),
	);
	const Router = createRouter({
		routes: [{ path: "/pulls/:slug", component: PullsScreen }],
		history: memoryHistory(path),
	});
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => (
			<AuthProvider>
				<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
			</AuthProvider>
		),
		container,
	);
	return {
		container,
		calls,
		done: () => {
			dispose();
			container.remove();
		},
	};
}

describe("PullsScreen", () => {
	let done = () => {};
	afterEach(() => {
		done();
		vi.unstubAllGlobals();
	});

	it("lists the project's open pull requests", async () => {
		const view = mount("/pulls/alpha", (url) =>
			url.includes("/github/pulls/alpha?filter=open") ? json([summary]) : null,
		);
		done = view.done;
		await settle();
		expect(view.container.textContent).toContain("Add login");
		expect(view.container.textContent).toContain("#12 · login · @ana");
	});

	it("asks to connect GitHub when it is not connected", async () => {
		const view = mount("/pulls/alpha", (url) =>
			url.includes("/github/pulls/alpha") ? json({ message: "Connect GitHub first" }, 409) : null,
		);
		done = view.done;
		await settle();
		expect(view.container.textContent).toContain("Connect GitHub");
		expect(view.container.querySelector('a[href$="/settings/connectors"]')).not.toBeNull();
	});

	it("opens one with where it stands, and merges it after asking", async () => {
		const view = mount("/pulls/alpha?pr=12", (url, init) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/github/pulls/alpha/12/merge") && init?.method === "POST")
				return new Response(null, { status: 204 });
			if (url.endsWith("/github/pulls/alpha/12")) return json(detail);
			return null;
		});
		done = view.done;
		await settle();
		const text = view.container.textContent ?? "";
		expect(text).toContain("Approved");
		expect(text).toContain("Checks fail");
		expect(text).toContain("login → main");
		expect(view.container.innerHTML).toContain("<strong>login</strong>");
		expect(text).toContain("@bo");

		const merge = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Merge",
		);
		merge?.click();
		await settle();
		const squash = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Squash and merge",
		);
		squash?.click();
		await settle();
		// Nothing is merged until the dialog is confirmed.
		expect(view.calls.some((call) => call.url.endsWith("/12/merge"))).toBe(false);
		const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find(
			(button) => button.textContent?.trim() === "Squash and merge",
		);
		confirm?.click();
		await settle();
		const sent = view.calls.find((call) => call.url.endsWith("/12/merge"));
		expect(sent?.init?.body).toBe(JSON.stringify({ method: "squash" }));
	});
});
