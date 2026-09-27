import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";

import { PullsScreen } from "./pulls-screen";

const provider = {
	id: "codex",
	name: "Codex",
	available: true,
	models: [{ id: "gpt-5", name: "GPT-5" }],
	modes: [],
	settings: { enabled: true, model: "gpt-5" },
};

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
			// The pull request shows the threads on its branch, so its project's list is read.
			if (url.includes("/chat/sessions") && init?.method !== "POST") return json([]);
			return answer(url, init) ?? json(null);
		}),
	);
	const Router = createRouter({
		routes: [
			{ path: "/pulls/:slug", component: PullsScreen },
			// Where a started fix thread lands.
			{ path: "/chat/:slug/:id", component: () => <span>the chat screen</span> },
		],
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

	it("starts a thread in a worktree on the pull request's branch when asked to fix it", async () => {
		const session = {
			id: "s1",
			project: "alpha",
			provider: "codex",
			title: "Fix #12",
			cwd: "/tmp/alpha/.grid-worktrees/app/login",
			model: "gpt-5",
			mode: null,
			effort: null,
			worktree: {
				repo: "/tmp/alpha",
				path: "/tmp/alpha/.grid-worktrees/app/login",
				branch: "login",
				base: null,
				origin: "/tmp/alpha",
			},
			createdAt: "2026-09-28T10:00:00Z",
			updatedAt: "2026-09-28T10:00:00Z",
		};
		const view = mount("/pulls/alpha?pr=12", (url, init) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/github/pulls/alpha/12")) return json(detail);
			if (url.endsWith("/chat/providers")) return json([provider]);
			if (url.endsWith("/chat/sessions") && init?.method === "POST") return json(session);
			if (url.endsWith("/github/pulls/alpha/12/fix")) {
				// The runner rewrites the message from what is included.
				const { include } = JSON.parse(String(init?.body)) as {
					include: { checks: boolean; comments: boolean };
				};
				return json({
					branch: "login",
					message: `Fix pull request #12 (comments: ${include.comments})`,
				});
			}
			return null;
		});
		done = view.done;
		await settle();

		const fix = [...view.container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.includes("Fix with an agent"),
		);
		expect(fix).toBeTruthy();
		// Nothing is read from the runner until the sheet is opened.
		expect(view.calls.some((call) => call.url.endsWith("/12/fix"))).toBe(false);
		fix?.click();
		await settle();

		const sheet = document.querySelector<HTMLDialogElement>(
			'dialog[aria-label="Fix with an agent"]',
		);
		expect(sheet?.open).toBe(true);
		expect(sheet?.textContent).toContain("login");
		expect(sheet?.textContent).toContain("Failing checks");
		expect(sheet?.querySelector("textarea")?.value).toContain("Fix pull request #12");
		expect(view.calls.find((call) => call.url.endsWith("/12/fix"))?.init?.body).toBe(
			JSON.stringify({ include: { checks: true, comments: true, description: true } }),
		);

		// Turning an include off asks the runner again, and redraws the message from it.
		const comments = sheet?.querySelector<HTMLButtonElement>(
			'button[aria-label="Review comments"]',
		);
		comments?.click();
		await settle();
		expect(view.calls.filter((call) => call.url.endsWith("/12/fix")).length).toBe(2);
		expect(sheet?.querySelector("textarea")?.value).toContain("comments: false");

		const start = [...(sheet?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) =>
			button.textContent?.includes("Start thread"),
		);
		expect(start?.disabled).toBe(false);
		start?.click();
		await settle();

		const created = view.calls.find(
			(call) => call.url.endsWith("/chat/sessions") && call.init?.method === "POST",
		);
		expect(JSON.parse(String(created?.init?.body))).toMatchObject({
			project: "alpha",
			provider: "codex",
			cwd: "/tmp/alpha",
			model: "gpt-5",
			worktree: true,
			branch: "login",
			existing: true,
			pull: 12,
		});
		// And the screen moves to the new thread.
		expect(view.container.textContent).toContain("the chat screen");
	});
});
