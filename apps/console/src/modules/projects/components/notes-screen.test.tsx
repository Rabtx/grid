import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { render } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import { ShellProvider, useShell } from "@/modules/shell";
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
const base = {
	source: null,
	threadId: null,
	pinned: false,
	shared: false,
	icon: null,
	agents: null,
	author: { name: "Sam" },
	editor: { name: "Sam" },
	createdAt: "2026-09-24T00:00:00.000Z",
} satisfies Partial<Note>;
const answer: Note = {
	...base,
	id: "n1",
	body: "Use Hono for the API",
	source: "Claude in Plan the API",
	threadId: "t1",
	updatedAt: "2026-09-24T00:00:00.000Z",
};
const rules: Note = {
	...base,
	id: "n2",
	body: "# ETA rules\n\nETAs must match the app. See `src/jobs/eta.ts`.\n\n## Rounding\n\n- [x] Round to 5 minutes\n- [ ] Never show 0 min",
	pinned: true,
	shared: true,
	icon: "rules",
	agents: null,
	updatedAt: "2026-09-25T00:00:00.000Z",
};
const release: Note = {
	...base,
	id: "n3",
	body: "# Release checklist\n\n- [x] Changelog\n- [ ] Tag it\n- [ ] Announce",
	updatedAt: "2026-09-23T00:00:00.000Z",
};
const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify({ success: true, statusCode: status, data }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
function button(root: ParentNode, label: string): HTMLButtonElement | undefined {
	return [...root.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) =>
			candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label,
	);
}

/** What the shell draws around the screen: the panel and its actions, the top bar's slots. */
function ShellOutlet(): JSX.Element {
	const shell = useShell();
	const location = useLocation();
	return (
		<>
			<div data-slot="panel-actions">{shell.panelActions()?.()}</div>
			<nav data-slot="panel">{shell.panel()?.()}</nav>
			<div data-slot="crumb">{shell.crumb()?.()}</div>
			<div data-slot="actions">{shell.actions()?.()}</div>
			<output data-slot="where">{location.pathname + location.search}</output>
		</>
	);
}

describe("NotesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let notes: Note[];
	let posted: unknown;
	let patches: { id: string; body: unknown }[];

	function mount(path: string): void {
		const Router = createRouter({
			routes: [{ path: "/notes/:slug/:note?", component: NotesScreen }],
			history: memoryHistory(path),
		});
		dispose = render(
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
	}

	const panel = () => container.querySelector<HTMLElement>('[data-slot="panel"]') as HTMLElement;
	const where = () => container.querySelector('[data-slot="where"]')?.textContent ?? "";

	beforeEach(() => {
		notes = [answer, rules, release];
		posted = null;
		patches = [];
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
						const note: Note = {
							...base,
							id: "n9",
							body: (posted as { body: string }).body,
							updatedAt: "2026-09-26T00:00:00.000Z",
						};
						notes = [note, ...notes];
						return json(note, 201);
					}
					return json(notes);
				}
				const one = url.match(/\/projects\/beta\/notes\/(\w+)$/);
				if (one && init?.method === "PATCH") {
					const body = JSON.parse(String(init.body)) as Partial<Note>;
					patches.push({ id: one[1], body });
					notes = notes.map((note) =>
						note.id === one[1]
							? {
									...note,
									...body,
									updatedAt: body.body ? "2026-09-27T00:00:00.000Z" : note.updatedAt,
								}
							: note,
					);
					return json(notes.find((note) => note.id === one[1]));
				}
				if (url.includes("/chat/sessions")) return json([]);
				return json(null);
			}),
		);
		container = document.createElement("div");
		document.body.append(container);
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	it("lists pinned notes first, then the rest by when they changed, with what each holds", async () => {
		mount("/notes/beta");
		await settle();
		const groups = [...panel().querySelectorAll("h3")].map((heading) => heading.textContent);
		expect(groups).toEqual(["Pinned", "Recent"]);
		const rows = [...panel().querySelectorAll<HTMLAnchorElement>("a[href^='/notes/beta/']")];
		expect(rows.map((row) => row.textContent)).toEqual([
			expect.stringContaining("ETA rules"),
			expect.stringContaining("Use Hono for the API"),
			expect.stringContaining("Release checklist"),
		]);
		// A checklist reads as its progress; a note that opens with words, as its words.
		expect(rows[2]?.textContent).toContain("1 of 3 done");
		expect(rows[0]?.textContent).toContain("ETAs must match the app.");
		// A note given to agents says so.
		expect(rows[0]?.textContent).toContain("Shared with agents");
		expect(rows[1]?.textContent).not.toContain("Shared with agents");
		expect(rows[0]?.getAttribute("href")).toBe("/notes/beta/n2");
	});

	it("reads a note as a document: its title, tasks to tick, files as chips, and its thread", async () => {
		mount("/notes/beta/n2");
		await settle();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe(
			"ETA rules",
		);
		expect(container.textContent).toContain("Sam · edited");
		expect(container.textContent).toContain("Context for agents in Beta");
		expect(
			container.querySelector('a[href="/files/beta?file=src%2Fjobs%2Feta.ts"]')?.textContent,
		).toBe("eta.ts");
		const open = container.querySelector<HTMLInputElement>('input[aria-label="Never show 0 min"]');
		expect(open?.checked).toBe(false);
		open?.click();
		await settle();
		expect(patches).toEqual([
			{
				id: "n2",
				body: {
					body: "# ETA rules\n\nETAs must match the app. See `src/jobs/eta.ts`.\n\n## Rounding\n\n- [x] Round to 5 minutes\n- [x] Never show 0 min",
				},
			},
		]);
		expect(
			container.querySelector<HTMLInputElement>('input[aria-label="Never show 0 min"]')?.checked,
		).toBe(true);

		// A note saved from a chat links back to it.
		const back = container.querySelector<HTMLAnchorElement>('a[href="/notes/beta/n1"]');
		back?.click();
		await settle();
		expect(container.querySelector('a[href="/chat/beta/t1"]')?.textContent).toContain(
			"Claude in Plan the API",
		);
	});

	it("pins a note and shares it with agents from the top bar, without counting that as an edit", async () => {
		mount("/notes/beta/n3");
		await settle();
		const actions = container.querySelector<HTMLElement>('[data-slot="actions"]') as HTMLElement;
		// The chip opens who the note goes to; sharing is its first choice.
		button(actions, "Shared with agents")?.click();
		await settle();
		const share = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
			(item) => item.textContent?.includes("Share with agents"),
		);
		share?.click();
		await settle();
		button(actions, "Pin to the top")?.click();
		await settle();
		expect(patches).toEqual([
			{ id: "n3", body: { shared: true } },
			{ id: "n3", body: { pinned: true } },
		]);
		expect(button(actions, "Shared with agents")?.textContent?.includes("Shared with agents")).toBe(
			true,
		);
		expect(button(actions, "Unpin")?.getAttribute("aria-pressed")).toBe("true");
		expect([...panel().querySelectorAll("h3")][0]?.textContent).toBe("Pinned");
	});

	it("writes a new note from its title and text, then shows it at its own address", async () => {
		mount("/notes/beta");
		await settle();
		const actions = container.querySelector('[data-slot="panel-actions"]') as HTMLElement;
		button(actions, "New note")?.click();
		await settle();
		expect(where()).toBe("/notes/beta/new");
		const title = container.querySelector<HTMLInputElement>('input[aria-label="Title"]');
		if (title) {
			title.value = "Keep Postgres";
			title.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		const box = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note"]');
		expect(box).not.toBeNull();
		if (box) {
			box.value = "Jobs queue in Postgres.";
			box.dispatchEvent(new Event("input", { bubbles: true }));
			await settle();
			// Escape ends writing, and what was written is saved straight away.
			box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		}
		await settle();
		expect(posted).toEqual({ body: "# Keep Postgres\n\nJobs queue in Postgres." });
		expect(where()).toBe("/notes/beta/n9");
		const rows = [...panel().querySelectorAll<HTMLAnchorElement>("a[href^='/notes/beta/']")];
		expect(rows.find((row) => row.getAttribute("aria-current") === "page")?.textContent).toContain(
			"Keep Postgres",
		);
		expect(container.textContent).toContain("Jobs queue in Postgres.");

		// Another note, then back: the new one opens again, not the one before it.
		panel().querySelector<HTMLAnchorElement>('a[href="/notes/beta/n1"]')?.click();
		await settle();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe(
			"Use Hono for the API",
		);
		panel().querySelector<HTMLAnchorElement>('a[href="/notes/beta/n9"]')?.click();
		await settle();
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe(
			"Keep Postgres",
		);
	});

	it("opens a note from a link made before notes had their own address", async () => {
		mount("/notes/beta?note=n3");
		await settle();
		expect(where()).toBe("/notes/beta/n3");
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe(
			"Release checklist",
		);
	});

	it("finds notes by their words", async () => {
		mount("/notes/beta");
		await settle();
		const actions = container.querySelector('[data-slot="panel-actions"]') as HTMLElement;
		button(actions, "Search notes")?.click();
		await settle();
		const field = panel().querySelector<HTMLInputElement>('input[aria-label="Search notes"]');
		if (field) {
			field.value = "postgres hono";
			field.dispatchEvent(new Event("input", { bubbles: true }));
			await settle();
			expect(panel().textContent).toContain("No notes match.");
			field.value = "hono";
			field.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		const rows = [...panel().querySelectorAll("a[href^='/notes/beta/']")];
		expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/notes/beta/n1"]);
	});
});
