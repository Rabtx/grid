import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { draftsStore } from "@/modules/chat/stores/drafts";
import { WorkspaceProvider } from "../context/workspace-context";
import type { Task, TaskStatus } from "../types/project.types";

import { TaskCard } from "./task-card";

const projects = [{ slug: "alpha", name: "Alpha" }].map((project) => ({
	...project,
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
}));

const sampleTask: Task = {
	key: "TASK-42",
	number: 42,
	title: "Implement neural search engine",
	description: "Connect to vector index and rank embeddings.",
	status: "backlog",
	owner: { kind: "agent", name: "Atlas" },
	branch: "agent/search/vector-index",
	position: 0,
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ success: status < 400, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("TaskCard", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let movedStatus: TaskStatus | null;

	beforeEach(() => {
		movedStatus = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh")) {
					return json({
						accessToken: "token",
						accessTokenExpiresAt: "2026-09-23T01:00:00.000Z",
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json(projects);
				if (url.includes("/tasks")) return json([sampleTask]);
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

	function mount(task: Task = sampleTask): void {
		const Router = createRouter({
			routes: [
				{
					path: "/board/:slug",
					component: () => (
						<TaskCard
							task={task}
							onMove={(status) => {
								movedStatus = status;
							}}
						/>
					),
				},
				{
					path: "/chat/:project",
					component: () => <div data-testid="chat-screen">Chat Screen</div>,
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
	}

	it("renders task key, title, owner, and branch", async () => {
		mount();
		await settle();

		expect(container.textContent).toContain("TASK-42");
		expect(container.textContent).toContain("Implement neural search engine");
		expect(container.textContent).toContain("Atlas");
		expect(container.textContent).toContain("agent/search/vector-index");
	});

	it("presents 'Run with agent' in the card's action menu", async () => {
		mount();
		await settle();

		const menuItems = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].map((b) => b.textContent?.trim());

		expect(menuItems[0]).toBe("Run with agent");
		expect(menuItems).toContain("Run with agent");
	});

	it("seeds the draft and navigates to the chat thread when 'Run with agent' is selected", async () => {
		mount();
		await settle();

		const runItem = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].find((b) => b.textContent?.trim() === "Run with agent");

		expect(runItem).toBeDefined();
		runItem?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe(
			"Implement neural search engine\n\nConnect to vector index and rank embeddings.\n\nWork on branch agent/search/vector-index",
		);
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
		expect(movedStatus).toBeNull();
	});

	it("seeds draft with title only when task has no description and no branch", async () => {
		const minimalTask: Task = {
			...sampleTask,
			key: "TASK-43",
			number: 43,
			title: "Minimal task title",
			description: null,
			branch: null,
		};
		mount(minimalTask);
		await settle();

		const runItem = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].find((b) => b.textContent?.trim() === "Run with agent");

		runItem?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe("Minimal task title");
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
	});

	it("seeds draft with title and branch when task has no description", async () => {
		const branchTask: Task = {
			...sampleTask,
			key: "TASK-44",
			number: 44,
			title: "Task with branch only",
			description: null,
			branch: "agent/web/branch-test",
		};
		mount(branchTask);
		await settle();

		const runItem = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].find((b) => b.textContent?.trim() === "Run with agent");

		runItem?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe(
			"Task with branch only\n\nWork on branch agent/web/branch-test",
		);
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
	});

	it("seeds draft with title and description when task has no branch", async () => {
		const descTask: Task = {
			...sampleTask,
			key: "TASK-45",
			number: 45,
			title: "Task with description only",
			description: "Only markdown description here.",
			branch: null,
		};
		mount(descTask);
		await settle();

		const runItem = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].find((b) => b.textContent?.trim() === "Run with agent");

		runItem?.click();
		await settle();

		expect(draftsStore.take("alpha")).toBe(
			"Task with description only\n\nOnly markdown description here.",
		);
		expect(container.querySelector('[data-testid="chat-screen"]')).not.toBeNull();
	});

	it("moves stage when a stage item is selected without setting a draft", async () => {
		mount();
		await settle();

		const readyItem = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
		].find((b) => b.textContent?.trim() === "Ready");

		expect(readyItem).toBeDefined();
		readyItem?.click();
		await settle();

		expect(movedStatus).toBe("ready");
		expect(draftsStore.take("alpha")).toBeUndefined();
	});
});
