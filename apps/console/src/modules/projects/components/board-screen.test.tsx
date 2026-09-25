import { createRouter, memoryHistory } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { render } from "@solidjs/web";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider, useWorkspace } from "@/modules/projects/context/workspace-context";
import { Toaster } from "@/ui";

import { BoardScreen } from "./board-screen";
import { NewTaskDialog } from "./new-task-dialog";

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
		description: null,
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

/** The API's failure envelope, which carries the human reason in `message`. */
function fail(message: string, status = 500): Response {
	return new Response(JSON.stringify({ success: false, statusCode: status, message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The keys of the cards currently in one lane, in the order the lane shows them. */
function laneTaskKeys(container: HTMLElement, lane: string): string[] {
	const section = container.querySelector(`section[data-lane="${lane}"]`);
	if (!section) return [];
	return [...section.querySelectorAll("article")].map(
		(card) => card.querySelector("span")?.textContent ?? "",
	);
}

/**
 * Click one entry of a card's "Move to…" menu. happy-dom has no Popover API, so the list is in
 * the DOM and no trigger click is needed to reveal it.
 */
function clickMenuItem(container: HTMLElement, menu: string, item: string): void {
	const list = container.querySelector(`[role="menu"][aria-label="${menu}"]`);
	const button = list
		? [...list.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')].find(
				(candidate) => candidate.textContent?.trim() === item,
			)
		: undefined;
	expect(button, `no "${item}" entry in the ${menu} menu`).toBeDefined();
	button?.click();
}

/** Opens the new-task sheet through the workspace, the way the shell's control does. */
function NewTaskTrigger(): JSX.Element {
	const workspace = useWorkspace();
	return (
		<button type="button" onClick={() => workspace.setNewTaskOpen(true)}>
			New task
		</button>
	);
}

describe("BoardScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let calls: Call[];
	/** The stub's own board, so a re-read after a write returns the move that was accepted. */
	let board: typeof tasks;
	/** Hold the next PATCH open, so a test can watch the board before the write lands. */
	let holdPatch: boolean;
	let releasePatch: () => void;
	let patchFailure: string | null;

	beforeAll(() => {
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
		board = tasks.map((task) => ({ ...task }));
		holdPatch = false;
		releasePatch = () => undefined;
		patchFailure = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				const method = init?.method ?? "GET";
				const body: Record<string, unknown> | undefined =
					typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
				calls.push({ method, url, body });
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (method === "POST" && url.endsWith("/tasks")) {
					const created = {
						...tasks[0],
						key: "TASK-3",
						number: 3,
						title: String(body?.title ?? "New task"),
						status: "backlog",
						position: -1,
					};
					board = [created, ...board];
					return json(created);
				}
				if (method === "PATCH") {
					if (holdPatch) await new Promise<void>((resolve) => (releasePatch = resolve));
					if (patchFailure) return fail(patchFailure);
					const number = Number(url.slice(url.lastIndexOf("/") + 1));
					const moved = board.find((task) => task.number === number);
					if (!moved) return fail("That task does not exist", 404);
					if (typeof body?.status === "string") moved.status = body.status;
					if (typeof body?.position === "number") moved.position = body.position;
					return json(moved);
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json(board);
				return json(null, 404);
			}),
		);

		const Router = createRouter({
			routes: [
				{
					path: "/board/:slug",
					component: () => (
						<>
							<BoardScreen />
							<NewTaskTrigger />
							<NewTaskDialog />
							<Toaster />
						</>
					),
				},
			],
			history: memoryHistory("/board/alpha"),
		});

		container = document.createElement("div");
		document.body.append(container);
		dispose = render(
			() => (
				<AuthProvider>
					<Router>{(route) => <WorkspaceProvider>{route.children}</WorkspaceProvider>}</Router>
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

	it("renders all seven lane headings with correct labels", async () => {
		await settle();

		const headings = container.querySelectorAll("section[id^=lane-] h2");
		expect(headings.length).toBe(7);
		const labels = Array.from(headings).map((h) => h.textContent?.trim());
		expect(labels).toEqual(["Backlog", "Ready", "In progress", "Review", "QA", "Blocked", "Done"]);
	});

	it("shows correct task counts for alpha project in lane headings", async () => {
		await settle();

		const counts = container.querySelectorAll("section[id^=lane-] header [data-count]");
		const countValues = Array.from(counts).map((s) => parseInt(s.textContent || "0", 10));
		expect(countValues).toEqual([1, 1, 0, 0, 0, 0, 0]);
	});

	it("renders seven lane tabs with correct counts on mobile", async () => {
		await settle();

		const tabs = container.querySelectorAll('nav[aria-label="Board lanes"] button');
		expect(tabs.length).toBe(7);
		const tabCounts = Array.from(tabs).map((tab) =>
			parseInt(tab.querySelector("[data-count]")?.textContent || "0", 10),
		);
		expect(tabCounts).toEqual([1, 1, 0, 0, 0, 0, 0]);
		expect(tabs[0].getAttribute("aria-current")).toBe("true");
		expect(tabs[0].getAttribute("aria-controls")).toBe("lane-backlog");
		expect(container.querySelector("section[data-lane]")?.getAttribute("data-lane")).toBe(
			"backlog",
		);
	});

	it("shows 'No tasks' in empty lanes", async () => {
		await settle();

		const emptyMessages = container.querySelectorAll("section[id^=lane-] p");
		const noTasksCount = Array.from(emptyMessages).filter((p) =>
			p.textContent?.includes("No tasks"),
		).length;
		expect(noTasksCount).toBe(5);
	});

	it("groups tasks into one lane per owner", async () => {
		await settle();

		const ownerView = Array.from(
			container.querySelectorAll<HTMLButtonElement>("fieldset button"),
		).find((button) => button.textContent?.trim() === "By owner");
		expect(ownerView).toBeDefined();
		ownerView?.click();
		await settle();

		const lanes = container.querySelectorAll("section[data-lane]");
		const labels = Array.from(lanes).map((lane) => lane.querySelector("h2")?.textContent?.trim());
		const counts = Array.from(lanes).map((lane) =>
			parseInt(lane.querySelector("[data-count]")?.textContent || "0", 10),
		);
		expect(Array.from(lanes).map((lane) => lane.getAttribute("data-lane"))).toEqual([
			"human:Alice",
			"agent:Morgan",
		]);
		expect(labels).toEqual(["Alice", "Morgan"]);
		expect(counts).toEqual([1, 1]);
	});

	it("hides task cards that do not match the query", async () => {
		await settle();

		const input = container.querySelector<HTMLInputElement>('input[placeholder="Filter tasks"]');
		expect(input).not.toBeNull();
		if (!input) return;
		input.value = "second";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();

		const cards = container.querySelectorAll("article");
		expect(cards).toHaveLength(1);
		expect(cards[0].textContent).toContain("Second task ready for work");
		expect(container.textContent).toContain("1 of 2 tasks");
	});

	it("shows the filtered empty state and restores every task", async () => {
		await settle();

		const input = container.querySelector<HTMLInputElement>('input[placeholder="Filter tasks"]');
		expect(input).not.toBeNull();
		if (!input) return;
		input.value = "missing";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();

		expect(container.textContent).toContain("No tasks match these filters");
		expect(container.querySelectorAll("section[data-lane]")).toHaveLength(0);
		const clear = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent?.trim() === "Clear filters",
		);
		expect(clear).toBeDefined();
		clear?.click();
		await settle();

		expect(container.querySelectorAll("section[data-lane]")).toHaveLength(7);
		expect(container.querySelectorAll("article")).toHaveLength(2);
	});

	it("offers the other six stages from a menu outside the card's link", async () => {
		await settle();

		const card = container.querySelector('a[href="/board/alpha/tasks/1"]');
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Move TASK-1"]');
		expect(trigger).not.toBeNull();
		// Opening the menu must not navigate, so it cannot live inside the card's link.
		expect(trigger?.closest("a")).toBeNull();
		expect(card?.contains(trigger ?? null)).toBe(false);

		const items = [
			...(container.querySelectorAll('[role="menu"][aria-label="Move TASK-1"] button') ?? []),
		].map((item) => item.textContent?.trim());
		expect(items).toEqual([
			"Run with agent",
			"Ready",
			"In progress",
			"Review",
			"QA",
			"Blocked",
			"Done",
		]);
	});

	it("moves a card into the target lane as soon as the move is chosen", async () => {
		await settle();
		holdPatch = true;

		clickMenuItem(container, "Move TASK-1", "In progress");
		await settle();

		// Optimistic: the card changes lane before the write has come back.
		expect(laneTaskKeys(container, "backlog")).toEqual([]);
		expect(laneTaskKeys(container, "in_progress")).toEqual(["TASK-1"]);

		releasePatch();
		await settle();

		const patches = calls.filter((call) => call.method === "PATCH");
		expect(patches).toHaveLength(1);
		expect(patches[0].url).toContain("/projects/alpha/tasks/1");
		expect(patches[0].body).toEqual({ status: "in_progress", position: 0 });
		// Once the write lands the overlay is gone: the card stays where the API put it.
		expect(laneTaskKeys(container, "backlog")).toEqual([]);
		expect(laneTaskKeys(container, "in_progress")).toEqual(["TASK-1"]);
	});

	it("puts the card back and says why when the move is rejected", async () => {
		await settle();
		patchFailure = "Stage 'in_progress' is not allowed here";

		clickMenuItem(container, "Move TASK-1", "In progress");
		await settle();

		expect(container.textContent).toContain(
			"Couldn't move TASK-1: Stage 'in_progress' is not allowed here",
		);
		expect(laneTaskKeys(container, "backlog")).toEqual(["TASK-1"]);
		expect(laneTaskKeys(container, "in_progress")).toEqual([]);
	});

	it("toasts after adding a task and, with Add another on, keeps the sheet open", async () => {
		await settle();

		const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent?.trim() === "New task",
		);
		expect(trigger).toBeDefined();
		trigger?.click();
		await settle();

		const input = container.querySelector<HTMLInputElement>('input[aria-label="Task title"]');
		expect(input).not.toBeNull();
		if (!input) return;
		const another = Array.from(
			container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
		).find((box) => box.closest("label")?.textContent?.includes("Add another"));
		expect(another).toBeDefined();
		if (another) {
			another.checked = true;
			another.dispatchEvent(new Event("change", { bubbles: true }));
		}
		input.value = "Write the docs";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();

		const form = input.closest("form");
		expect(form).not.toBeNull();
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(container.textContent).toContain("Added TASK-3");
		const sheet = container.querySelector<HTMLDialogElement>('dialog[aria-label="New task"]');
		expect(sheet?.open).toBe(true);
		expect(input.value).toBe("");

		if (another) {
			another.checked = false;
			another.dispatchEvent(new Event("change", { bubbles: true }));
		}
		input.value = "One more";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();

		expect(sheet?.open).toBe(false);
	});
});
