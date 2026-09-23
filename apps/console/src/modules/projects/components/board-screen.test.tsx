import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "@/modules/projects/context/workspace-context";

import { BoardScreen } from "./board-screen";

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

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("BoardScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;

	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				console.log("FETCH:", url);
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json(tasks);
				return json(null, 404);
			}),
		);

		const Router = createRouter({
			routes: [{ path: "/board/:slug", component: () => <BoardScreen /> }],
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
});
