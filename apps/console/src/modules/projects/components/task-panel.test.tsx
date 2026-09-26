import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { WorkspaceProvider } from "../context/workspace-context";

import { BoardScreen } from "./board-screen";
import { TaskPanel } from "./task-panel";

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

const tasks = [
	{
		key: "TASK-1",
		number: 1,
		title: "First task in backlog",
		description: "Draft the empty state.",
		status: "backlog",
		owner: { kind: "human", name: "Alice" },
		branch: "feature/first-task",
		position: 0,
		createdAt: "2026-09-23T00:00:00.000Z",
		updatedAt: "2026-09-23T00:00:00.000Z",
	},
	{
		key: "TASK-2",
		number: 2,
		title: "Second task ready for work",
		description: null,
		status: "ready",
		owner: { kind: "agent", name: "Morgan" },
		branch: "feature/second-task",
		position: 1,
		createdAt: "2026-09-23T00:00:00.000Z",
		updatedAt: "2026-09-23T00:00:00.000Z",
	},
];

type Call = { method: string; url: string; body: Record<string, unknown> | undefined };

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function dialogs(container: HTMLElement): HTMLDialogElement[] {
	return [...container.querySelectorAll<HTMLDialogElement>("dialog")];
}

describe("TaskPanel", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let calls: Call[];

	beforeAll(() => {
		// happy-dom lacks the modal dialog API the panel's sheets need.
		if (!HTMLDialogElement.prototype.showModal) {
			HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
				this.open = true;
			});
		}
		if (!HTMLDialogElement.prototype.close) {
			HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
				this.open = false;
			});
		}
	});

	beforeEach(() => {
		calls = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				const method = init?.method ?? "GET";
				calls.push({
					method,
					url,
					body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
				});
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.includes("/projects/alpha/tasks/1")) {
					if (method === "PATCH") return json({ ...tasks[0], status: "review" });
					if (method === "DELETE") return new Response(null, { status: 204 });
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json(tasks);
				return json(null, 404);
			}),
		);
	});

	afterEach(() => {
		dispose?.();
		container?.remove();
		draftsStore.take("alpha");
		vi.unstubAllGlobals();
	});

	/** The board plus the panel, mounted the way `BoardRoute` mounts them. */
	function mount(path: string): void {
		const Router = createRouter({
			routes: [
				{ path: "/board/:slug", component: () => <BoardScreen /> },
				{ path: "/board/:slug/tasks/:number", component: () => <BoardScreen /> },
				{ path: "/chat/:project", component: () => <div data-testid="chat-screen">Chat</div> },
			],
			history: memoryHistory(path),
		});

		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>
						{(route) => (
							<WorkspaceProvider>
								{route.children}
								<TaskPanel />
							</WorkspaceProvider>
						)}
					</Router>
				</AuthProvider>
			),
			container,
		);
	}

	it("opens the task named in the URL with its fields editable", async () => {
		mount("/board/alpha/tasks/1");
		await settle();

		// The card on the board behind the panel links to the same task URL.
		expect(container.querySelector('a[href="/board/alpha/tasks/1"]')).not.toBeNull();

		const title = container.querySelector<HTMLInputElement>('input[aria-label="Task title"]');
		expect(title?.value).toBe("First task in backlog");
		expect(dialogs(container)[0]?.open).toBe(true);

		const status = container.querySelector<HTMLSelectElement>('select[aria-label="Status"]');
		expect(status?.value).toBe("backlog");
		expect(status?.querySelectorAll("option").length).toBe(7);

		const branch = container.querySelector<HTMLInputElement>('input[aria-label="Branch"]');
		expect(branch?.value).toBe("feature/first-task");

		const owner = container.querySelector<HTMLInputElement>('input[aria-label="Owner name"]');
		expect(owner?.value).toBe("Alice");

		const description = container.querySelector<HTMLTextAreaElement>("textarea");
		expect(description?.value).toBe("Draft the empty state.");
	});

	it("sends only the changed field when the status changes", async () => {
		mount("/board/alpha/tasks/1");
		await settle();

		const status = container.querySelector<HTMLSelectElement>('select[aria-label="Status"]');
		expect(status).not.toBeNull();
		if (!status) return;
		status.value = "review";
		status.dispatchEvent(new Event("change", { bubbles: true }));
		await settle();

		const patches = calls.filter((call) => call.method === "PATCH");
		expect(patches.length).toBe(1);
		expect(patches[0].url).toContain("/projects/alpha/tasks/1");
		expect(patches[0].body).toEqual({ status: "review" });
	});

	it("deletes the task only after the confirmation, then closes the panel", async () => {
		mount("/board/alpha/tasks/1");
		await settle();

		const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Delete task"]');
		expect(remove).not.toBeNull();
		if (!remove) return;
		remove.click();
		await settle();

		expect(container.textContent).toContain("Delete TASK-1?");
		expect(container.textContent).toContain("This can't be undone.");
		expect(calls.some((call) => call.method === "DELETE")).toBe(false);

		const confirm = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Delete task",
		);
		expect(confirm).toBeDefined();
		confirm?.click();
		await settle();

		const deletes = calls.filter((call) => call.method === "DELETE");
		expect(deletes.length).toBe(1);
		expect(deletes[0].url).toContain("/projects/alpha/tasks/1");
		expect(dialogs(container).some((dialog) => dialog.open)).toBe(false);
	});

	it("says the task is missing when the number matches nothing", async () => {
		mount("/board/alpha/tasks/99");
		await settle();

		expect(container.textContent).toContain("Task not found");
		const back = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Back to the board",
		);
		expect(back).toBeDefined();
	});

	it("offers 'Run with agent', seeds the draft with description and branch, and navigates to the chat thread", async () => {
		mount("/board/alpha/tasks/1");
		await settle();

		const panel = dialogs(container)[0];
		const runButton = [...panel.querySelectorAll<HTMLButtonElement>("header button")].find(
			(button) => button.textContent?.trim() === "Run with agent",
		);
		expect(runButton).toBeDefined();
		expect(runButton?.getAttribute("title")).toBe("Run with agent");

		runButton?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe(
			"TASK-1: First task in backlog\n\nDraft the empty state.\n\nWork on branch feature/first-task",
		);
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
	});

	it("seeds the draft for a task without description when running with agent", async () => {
		mount("/board/alpha/tasks/2");
		await settle();

		const panel = dialogs(container)[0];
		const runButton = [...panel.querySelectorAll<HTMLButtonElement>("header button")].find(
			(button) => button.textContent?.trim() === "Run with agent",
		);
		expect(runButton).toBeDefined();

		runButton?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe(
			"TASK-2: Second task ready for work\n\nWork on branch feature/second-task",
		);
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
	});
});
