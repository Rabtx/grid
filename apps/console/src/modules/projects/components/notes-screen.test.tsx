import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { WorkspaceProvider } from "../context/workspace-context";
import type { Note } from "../types/project.types";

import { NotesScreen } from "./notes-screen";

const project = {
	slug: "beta",
	name: "Beta",
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
};
const saved: Note = {
	id: "n1",
	body: "Use Hono for the API",
	source: "Claude in Plan the API",
	threadId: "t1",
	createdAt: "2026-09-24T00:00:00.000Z",
	updatedAt: "2026-09-24T00:00:00.000Z",
};
const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify({ success: true, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("NotesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let notes: Note[];
	let posted: unknown;

	beforeEach(() => {
		notes = [saved];
		posted = null;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = input.toString();
				if (url.endsWith("/auth/refresh"))
					return json({
						accessToken: "token",
						accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				if (url.endsWith("/projects")) return json([project]);
				if (url.endsWith("/projects/beta/notes")) {
					if (init?.method === "POST") {
						posted = JSON.parse(String(init.body));
						const note = {
							...saved,
							id: "n2",
							body: (posted as { body: string }).body,
							source: null,
							threadId: null,
							createdAt: "2026-09-25T00:00:00.000Z",
						};
						notes = [note, ...notes];
						return json(note, 201);
					}
					return json(notes);
				}
				return json(null);
			}),
		);
		const Router = createRouter({
			routes: [{ path: "/notes/:slug", component: NotesScreen }],
			history: memoryHistory("/notes/beta"),
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

	it("lists the project's notes with where they came from and a link back to the chat", async () => {
		await settle();
		expect(container.textContent).toContain("Use Hono for the API");
		expect(container.textContent).toContain("Claude in Plan the API");
		expect(container.querySelector('a[href="/chat/beta/t1"]')).not.toBeNull();
	});

	it("writes a new note and shows it first", async () => {
		await settle();
		[...container.querySelectorAll<HTMLButtonElement>("button")]
			.find((button) => button.textContent?.trim() === "Note")
			?.click();
		await settle();
		const box = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="New note"]');
		expect(box).not.toBeNull();
		if (box) {
			box.value = "Keep Postgres";
			box.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
		await settle();
		expect(posted).toEqual({ body: "Keep Postgres" });
		const items = [...container.querySelectorAll("li")].map((item) => item.textContent ?? "");
		expect(items[0]).toContain("Keep Postgres");
		expect(items[1]).toContain("Use Hono for the API");
	});
});
