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
		owner: { kind: "agent", name: "Codex" },
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

	it("renders seven stage tabs with correct counts on mobile", async () => {
		await settle();

		const tabs = container.querySelectorAll('nav[aria-label="Stages"] button');
		expect(tabs.length).toBe(7);
		const tabCounts = Array.from(tabs).map((tab) =>
			parseInt(tab.querySelector("[data-count]")?.textContent || "0", 10),
		);
		expect(tabCounts).toEqual([1, 1, 0, 0, 0, 0, 0]);
		// Backlog is the first lane, so it starts as the current stage.
		expect(tabs[0].getAttribute("aria-current")).toBe("true");
		expect(tabs[0].getAttribute("aria-controls")).toBe("lane-backlog");
	});

	it("shows 'No tasks' in empty lanes", async () => {
		await settle();

		const emptyMessages = container.querySelectorAll("section[id^=lane-] p");
		const noTasksCount = Array.from(emptyMessages).filter((p) =>
			p.textContent?.includes("No tasks"),
		).length;
		expect(noTasksCount).toBe(5);
	});
});
