import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects";
import { ShellProvider, useShell } from "@/modules/shell";

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
const commit = (
	sha: string,
	subject: string,
	author: string,
	agent: string | null,
	tags: string[] = [],
) => ({ sha, subject, at: "2026-09-27T09:00:00Z", author, agent, tags });
const history = {
	base: "main",
	ahead: 2,
	behind: 1,
	baseTip: commit("m1", "Update setup steps", "bo", null),
	commits: [
		commit("c2", "Add the form", "ana", "claude"),
		commit("c1", "Add the route", "ana", null),
	],
	mergeBase: commit("b0", "Release 0.8.2", "bo", null, ["v0.8.2"]),
};
const review = {
	viewer: "person",
	pullId: "PR_12",
	viewed: [],
	threads: [
		{
			id: "T1",
			resolved: true,
			outdated: false,
			path: "src/login.ts",
			line: 2,
			side: "RIGHT",
			comments: [
				{ author: "codex", agent: "codex", body: "Export it.", at: "2026-09-27T10:00:00Z" },
			],
		},
	],
	reviews: [{ author: "codex", agent: "codex", state: "APPROVED" }],
};
const diff = [
	{
		path: "src/login.ts",
		patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+export const c = 4;\n",
		added: 2,
		removed: 1,
	},
];

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(status < 400 ? { success: true, statusCode: status, data } : data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const buttonNamed = (root: ParentNode, name: string) =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(item) => item.getAttribute("aria-label") === name || item.textContent?.trim() === name,
	);

/** What the shell draws around the screen: the panel, the top bar's slots, and where it is. */
function ShellOutlet(): JSX.Element {
	const shell = useShell();
	const location = useLocation();
	return (
		<>
			<nav data-slot="panel">{shell.panel()?.()}</nav>
			<div data-slot="crumb">{shell.crumb()?.()}</div>
			<div data-slot="actions">{shell.actions()?.()}</div>
			<output data-slot="where">{location.pathname + location.search}</output>
		</>
	);
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
			if (url.includes("/chat/sessions") && init?.method !== "POST") return json([]);
			return answer(url, init) ?? json(null);
		}),
	);
	const Router = createRouter({
		routes: [
			{ path: "/pulls/:slug/:number?/:view?", component: PullsScreen },
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
				<Router>
					{(route) => (
						<WorkspaceProvider>
							<ShellProvider>
								<ShellOutlet />
								{route.children}
							</ShellProvider>
						</WorkspaceProvider>
					)}
				</Router>
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

	const panel = (root: HTMLElement) => root.querySelector('[data-slot="panel"]') as HTMLElement;
	const where = (root: HTMLElement) => root.querySelector('[data-slot="where"]')?.textContent ?? "";

	it("lists what waits on your review, then the rest open, in the panel", async () => {
		const other = { ...summary, number: 13, title: "Bump vite", checks: "pending", branch: "deps" };
		const view = mount("/pulls/alpha", (url) => {
			if (url.includes("filter=review")) return json([summary]);
			if (url.includes("/github/pulls/alpha?filter=open")) return json([summary, other]);
			return null;
		});
		done = view.done;
		await settle();
		const text = panel(view.container).textContent ?? "";
		expect(text).toContain("Needs your review");
		expect(text).toContain("Add login");
		expect(text).toContain("#12 · checks failing");
		expect(text).toContain("#13 · checks running");
		expect(panel(view.container).querySelector('a[href="/pulls/alpha/12"]')).not.toBeNull();
	});

	it("lists merged pull requests in the panel when the Merged filter is selected", async () => {
		const merged = {
			...summary,
			number: 10,
			title: "Merged PR feature",
			checks: "none" as const,
			branch: "feat-merged",
		};
		const view = mount("/pulls/alpha?state=merged", (url) => {
			if (url.includes("state=merged")) return json([merged]);
			return null;
		});
		done = view.done;
		await settle();
		const text = panel(view.container).textContent ?? "";
		expect(text).toContain("Merged");
		expect(text).toContain("Merged PR feature");
		expect(panel(view.container).querySelector('a[href="/pulls/alpha/10"]')).not.toBeNull();
	});

	it("shows the error and never an empty state when listing merged pull requests fails", async () => {
		const view = mount("/pulls/alpha?state=merged", (url) => {
			if (url.includes("state=merged")) return json({ message: "GitHub said no" }, 502);
			return null;
		});
		done = view.done;
		await settle();
		expect(view.container.textContent).toContain("GitHub said no");
		expect(view.container.textContent).not.toContain("Nothing merged yet");
		expect(panel(view.container).textContent).not.toContain("No merged pull requests.");
	});

	it("indicates more pull requests exist and allows loading more beyond 100", async () => {
		const items = Array.from({ length: 100 }, (_, i) => ({
			...summary,
			number: 100 - i,
			title: `Pull request #${100 - i}`,
			checks: "none" as const,
		}));
		const view = mount("/pulls/alpha?state=merged", (url) => {
			if (url.includes("state=merged")) return json(items);
			return null;
		});
		done = view.done;
		await settle();
		const text = panel(view.container).textContent ?? "";
		expect(text).toContain("Showing latest 100 pull requests. More exist on GitHub.");
		const loadMoreBtn = buttonNamed(panel(view.container), "Load more");
		expect(loadMoreBtn).toBeDefined();
		loadMoreBtn?.click();
		await settle();
		expect(view.calls.some((call) => call.url.includes("limit=200"))).toBe(true);
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

	it("takes a link from before to the pull request's own address", async () => {
		const view = mount("/pulls/alpha?pr=12", (url) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/github/pulls/alpha/12")) return json(detail);
			return null;
		});
		done = view.done;
		await settle();
		expect(where(view.container)).toBe("/pulls/alpha/12");
	});

	it("reads one as a document and merges it after asking", async () => {
		const view = mount("/pulls/alpha/12", (url, init) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/12/merge") && init?.method === "POST")
				return new Response(null, { status: 204 });
			if (url.endsWith("/12/history")) return json(history);
			if (url.endsWith("/12/review")) return json(review);
			if (url.endsWith("/github/pulls/alpha/12")) return json(detail);
			return null;
		});
		done = view.done;
		await settle();
		const text = view.container.textContent ?? "";
		expect(text).toContain("login → main");
		expect(text).toContain("1 of 1 check failing");
		expect(text).toContain("Approved by Codex");
		expect(text).toContain("No conflicts");
		expect(view.container.innerHTML).toContain("<strong>login</strong>");
		expect(text).toContain("2 ahead of main · 1 behind");
		expect(text).toContain("Add the form");
		expect(text).toContain("v0.8.2");
		expect(text).toContain("Codex approved");
		expect(text).toContain("Squash 2 commits into main, then delete login");

		buttonNamed(view.container, "Squash and merge")?.click();
		await settle();
		// Nothing is merged until the dialog is confirmed.
		expect(view.calls.some((call) => call.url.endsWith("/12/merge"))).toBe(false);
		const confirm = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find(
			(item) => item.textContent?.trim() === "Squash and merge",
		);
		confirm?.click();
		await settle();
		const sent = view.calls.find((call) => call.url.endsWith("/12/merge"));
		expect(sent?.init?.body).toBe(JSON.stringify({ method: "squash", deleteBranch: true }));
	});

	it("renders pull request descriptions with allowed inline HTML and sanitises XSS", async () => {
		const prWithHtml = {
			...detail,
			body: [
				"## Summary",
				"<details>",
				"<summary>Preview details</summary>",
				'<img src="https://example.com/demo.png" alt="demo" onerror="alert(1)">',
				"<br>",
				"<!-- comment -->",
				'<script>alert("xss")</script>',
				'<a href="javascript:alert(2)">unsafe</a>',
				"</details>",
			].join("\n"),
		};
		const view = mount("/pulls/alpha/12", (url) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/12/history")) return json(history);
			if (url.endsWith("/12/review")) return json(review);
			if (url.endsWith("/github/pulls/alpha/12")) return json(prWithHtml);
			return null;
		});
		done = view.done;
		await settle();
		const prose = view.container.querySelector(".chat-prose")?.innerHTML ?? "";
		expect(prose).toContain("<details");
		expect(prose).toContain("<summary>Preview details</summary>");
		expect(prose).toContain('<img src="https://example.com/demo.png" alt="demo">');
		expect(prose).toContain("<br>");
		expect(prose).not.toContain("onerror");
		expect(prose).not.toContain("<script");
		expect(prose).not.toContain('alert("xss")');
		expect(prose).not.toContain('href="javascript:');
		expect(prose).not.toContain("<!--");
	});

	it("reviews the changes: threads under their lines, a comment on a line, then the verdict", async () => {
		const view = mount("/pulls/alpha/12/changes", (url, init) => {
			if (url.includes("/github/pulls/alpha?filter")) return json([summary]);
			if (url.endsWith("/12/diff")) return json(diff);
			if (url.endsWith("/12/review") && init?.method === "POST")
				return new Response(null, { status: 204 });
			if (url.endsWith("/12/review")) return json(review);
			if (url.endsWith("/github/pulls/alpha/12")) return json(detail);
			return null;
		});
		done = view.done;
		await settle();
		const text = view.container.textContent ?? "";
		expect(text).toContain("src/login.ts");
		expect(text).toContain("Export it.");
		expect(text).toContain("Resolved");
		expect(text).toContain("0 of 1 file viewed");

		buttonNamed(view.container, "Comment on line 3")?.click();
		await settle();
		const box = view.container.querySelector<HTMLTextAreaElement>(
			'textarea[aria-label="Your comment"]',
		);
		expect(box).not.toBeNull();
		if (box) {
			box.value = "Keep it private";
			box.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		buttonNamed(view.container, "Comment")?.click();
		await settle();
		expect(view.container.textContent).toContain("1 draft comment");

		buttonNamed(view.container, "Request changes")?.click();
		await settle();
		buttonNamed(view.container, "Submit review")?.click();
		await settle();
		const sent = view.calls.find(
			(call) => call.url.endsWith("/12/review") && call.init?.method === "POST",
		);
		expect(JSON.parse(String(sent?.init?.body))).toEqual({
			event: "REQUEST_CHANGES",
			body: "",
			comments: [{ path: "src/login.ts", line: 3, side: "RIGHT", body: "Keep it private" }],
		});
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
		const view = mount("/pulls/alpha/12", (url, init) => {
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

		// From the pull request's menu.
		buttonNamed(view.container, "Pull request")?.click();
		await settle();
		const fix = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
			(item) => item.textContent?.includes("Fix with an agent"),
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

		const start = [...(sheet?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((item) =>
			item.textContent?.includes("Start thread"),
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
