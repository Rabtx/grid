import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JSX } from "@solidjs/web";

import { AuthProvider } from "@/modules/auth";
import { placementsStore } from "@/modules/environments";
import { ShellProvider, useShell } from "@/modules/shell";
import { WorkspaceProvider } from "../context/workspace-context";

import { FilesScreen } from "./files-screen";

const project = {
	slug: "alpha",
	name: "Alpha",
	summary: null,
	repoUrl: null,
	status: "active",
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
};
const json = (data: unknown): Response =>
	new Response(JSON.stringify({ success: true, statusCode: 200, data }), {
		headers: { "Content-Type": "application/json" },
	});
const failure = (status: number, message: string): Response =>
	new Response(JSON.stringify({ success: false, statusCode: status, message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
/** The stub's stand-in for the runner's text hash: any stable digest does, it only has to change. */
const hash = (text: string): string => `h${text.length}-${text.charCodeAt(0) || 0}`;
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
/** The editor loads its bundle and mounts CodeMirror, which takes a few more turns. */
async function settleEditor(): Promise<void> {
	for (let i = 0; i < 60; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
		(candidate) =>
			candidate.textContent?.trim() === label || candidate.getAttribute("aria-label") === label,
	);
}
/** Type into the mounted editor the way a keyboard does: the content changes, then an input. */
async function type(container: HTMLElement, text: string): Promise<void> {
	const content = container.querySelector<HTMLElement>(".cm-content");
	expect(content).not.toBeNull();
	if (!content) return;
	content.textContent = text;
	content.dispatchEvent(new Event("input", { bubbles: true }));
	await settle();
}

/** The file as the runner answers with it: its text, and the version a save is based on. */
function content(path: string, text: string): unknown {
	return {
		path,
		name: path.split("/").pop(),
		size: text.length,
		text,
		binary: false,
		tooLarge: false,
		hash: hash(text),
	};
}

/** What the shell draws around the screen: its panel (the tree), tabs and breadcrumb. */
function ShellOutlet(): JSX.Element {
	const shell = useShell();
	return (
		<>
			<nav data-slot="panel">{shell.panel()?.()}</nav>
			<div data-slot="tabs">{shell.tabs()?.()}</div>
		</>
	);
}

describe("FilesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let created: { path: string; name: string; kind: string } | null;
	let calls: string[];
	/** The stub's disk: what the runner would have on disk, and what a save is checked against. */
	let disk: Map<string, string>;
	let saves: { path: string; text: string; base: string }[];

	beforeEach(() => {
		created = null;
		calls = [];
		saves = [];
		disk = new Map([
			["readme.md", "# Alpha\nhello"],
			["notes.md", ""],
		]);
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
				calls.push(url);
				if (url.endsWith("/auth/refresh"))
					return json({
						accessToken: "token",
						accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				if (url.endsWith("/projects")) return json([project]);
				if (url.endsWith("/projects/folders")) return json({ alpha: "/tmp/alpha" });
				if (url.includes("/projects/files/alpha/content")) {
					if (init?.method === "PUT") {
						const body = JSON.parse(String(init.body)) as {
							path: string;
							text: string;
							base: string;
						};
						saves.push(body);
						const onDisk = disk.get(body.path);
						if (onDisk === undefined) return failure(404, "That file is not available");
						// The runner's rule: only a save onto the version that is there now.
						if (body.base !== hash(onDisk))
							return failure(409, "This file changed on disk since you opened it");
						disk.set(body.path, body.text);
						return json(content(body.path, body.text));
					}
					const path = new URL(url).searchParams.get("path") ?? "";
					if (!disk.has(path)) return failure(404, "That file is not available");
					return json(content(path, disk.get(path) ?? ""));
				}
				if (url.includes("/projects/files/alpha")) {
					if (init?.method === "POST") {
						const asked = JSON.parse(String(init.body)) as {
							path: string;
							name: string;
							kind: string;
						};
						// The runner answers with the item's path inside the project.
						created = { ...asked, path: [asked.path, asked.name].filter(Boolean).join("/") };
						return json(created);
					}
					const path = new URL(url).searchParams.get("path") ?? "";
					return json({
						path,
						git:
							new URL(url).searchParams.get("git") === "1"
								? {
										branch: "eta-rounding",
										changes: [{ path: "readme.md", status: "modified", added: 1, removed: 0 }],
										last: {
											"": { author: "Sam", at: "2026-10-01T09:00:00.000Z", subject: "Round ETAs" },
											"readme.md": {
												author: "Sam",
												at: "2026-10-01T09:00:00.000Z",
												subject: "Say hello",
											},
										},
									}
								: null,
						entries:
							path === ""
								? [
										{ name: "src", path: "src", kind: "folder" },
										{ name: "readme.md", path: "readme.md", kind: "file" },
										...(created && created.path === ""
											? [{ name: created.name, path: created.name, kind: created.kind }]
											: []),
									]
								: [],
					});
				}
				return json(null);
			}),
		);
		const Router = createRouter({
			routes: [{ path: "/files/:slug", component: FilesScreen }],
			history: memoryHistory("/files/alpha"),
		});
		container = document.createElement("div");
		document.body.append(container);
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
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	it("rereads the folder from its new machine when a project placement changes", async () => {
		await settle();
		await placementsStore.place("token", "alpha", "remote");
		await settle();
		expect(calls.some((url) => url.includes("/runner/env/remote/projects/files/alpha?"))).toBe(
			true,
		);
	});

	it("opens a nested folder and uses its relative path", async () => {
		await settle();
		expect(container.textContent).toContain("readme.md");
		const folder = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "src",
		);
		folder?.click();
		await settle();
		expect(calls.some((url) => url.endsWith("/projects/files/alpha?path=src"))).toBe(true);
		expect(folder?.getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toContain("Empty");
	});

	it("shows what changed since the last commit, and who last changed each entry", async () => {
		await settle();
		const table = container.querySelector("table");
		expect(table?.textContent).toContain("Say hello");
		const readme = [...(table?.querySelectorAll("tr") ?? [])].find((row) =>
			row.textContent?.includes("readme.md"),
		);
		expect(readme?.textContent).toContain("Modified");
		expect(container.textContent).toContain("1 changed since the last commit");

		const changed = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
			item.textContent?.startsWith("Changed"),
		);
		changed?.click();
		await settle();
		const names = [...(container.querySelector("table")?.querySelectorAll("tbody tr") ?? [])].map(
			(row) => row.querySelector("a")?.textContent?.replace("Modified", "").trim(),
		);
		expect(names).toEqual(["readme.md"]);
	});

	it("opens a file beside the tree with its lines numbered", async () => {
		await settle();
		const file = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
			button.textContent?.trim().startsWith("readme.md"),
		);
		file?.click();
		await settle();
		expect(calls.some((url) => url.endsWith("/projects/files/alpha/content?path=readme.md"))).toBe(
			true,
		);
		expect(file?.getAttribute("aria-current")).toBe("true");
		const rows = [
			...container.querySelectorAll<HTMLElement>("section[aria-label='readme.md'] [data-line]"),
		];
		expect(rows.map((row) => row.dataset.line)).toEqual(["1", "2"]);
		expect(rows.map((row) => row.querySelector("code")?.textContent)).toEqual(["# Alpha", "hello"]);
	});

	it("creates a file in the current directory", async () => {
		await settle();
		const add = container.querySelector<HTMLButtonElement>('button[aria-label="New file"]');
		expect(add).toBeDefined();
		add?.click();
		await settle();
		const input = container.querySelector<HTMLInputElement>('input[placeholder="notes.md"]');
		expect(input).not.toBeNull();
		if (input) {
			input.value = "notes.md";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		input?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settle();
		// The runner answers with the new item's path inside the project, not the folder it went in.
		expect(created).toEqual({ path: "notes.md", name: "notes.md", kind: "file" });
		expect(container.textContent).toContain("notes.md");
	});

	it("opens a file it just created in the editor, ready to be written in", async () => {
		await settle();
		container.querySelector<HTMLButtonElement>('button[aria-label="New file"]')?.click();
		await settle();
		const input = container.querySelector<HTMLInputElement>('input[placeholder="notes.md"]');
		if (input) {
			input.value = "notes.md";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		input?.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		await settleEditor();
		expect(container.querySelector(".cm-content")).not.toBeNull();
	});
});

describe("editing a file", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let calls: string[];
	let saves: { path: string; text: string; base: string }[];
	let disk: Map<string, string>;
	/** How many times the stub has issued a new access token. */
	let renewals: number;

	beforeEach(() => {
		calls = [];
		saves = [];
		renewals = 0;
		disk = new Map([
			["readme.md", "# Alpha\nhello"],
			["notes.md", "one\ntwo\nthree"],
		]);
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
				calls.push(url);
				// Each renewal mints a new string, and the token lives just past the minute the
				// console renews it ahead of, so it is replaced about once a second: often enough
				// that an unsaved draft has to survive the token changing underneath the editor.
				if (url.endsWith("/auth/refresh")) {
					renewals++;
					return json({
						accessToken: `token-${renewals}`,
						accessTokenExpiresAt: new Date(Date.now() + 61_000).toISOString(),
						user: { id: "u1", email: "person@example.com", username: "person" },
					});
				}
				if (url.endsWith("/projects")) return json([project]);
				if (url.endsWith("/projects/folders")) return json({ alpha: "/tmp/alpha" });
				if (url.includes("/projects/files/alpha/content")) {
					if (init?.method === "PUT") {
						const body = JSON.parse(String(init.body)) as (typeof saves)[number];
						saves.push(body);
						const onDisk = disk.get(body.path);
						if (onDisk === undefined) return failure(404, "That file is not available");
						if (body.base !== hash(onDisk))
							return failure(409, "This file changed on disk since you opened it");
						disk.set(body.path, body.text);
						return json(content(body.path, body.text));
					}
					const path = new URL(url).searchParams.get("path") ?? "";
					if (!disk.has(path)) return failure(404, "That file is not available");
					return json(content(path, disk.get(path) ?? ""));
				}
				if (url.includes("/projects/files/alpha"))
					return json({
						path: "",
						entries: [
							{ name: "notes.md", path: "notes.md", kind: "file" },
							{ name: "readme.md", path: "readme.md", kind: "file" },
						],
					});
				return json(null);
			}),
		);
		const Router = createRouter({
			routes: [{ path: "/files/:slug", component: FilesScreen }],
			history: memoryHistory("/files/alpha?file=notes.md"),
		});
		container = document.createElement("div");
		document.body.append(container);
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
	});

	afterEach(() => {
		dispose();
		container.remove();
		vi.unstubAllGlobals();
	});

	/** Reading is the default: the editor is only there once someone asks to edit. */
	it("reads the file first and opens the editor on request", async () => {
		await settle();
		expect(container.querySelector(".cm-content")).toBeNull();
		expect(container.textContent).toContain("one");
		button(container, "Edit")?.click();
		await settleEditor();
		expect(container.querySelector(".cm-content")?.textContent).toContain("one");
	});

	it("saves the edit onto the version it read, and clears the dirty dot", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "one\ntwo\nthree\nfour");
		// The pane and the file's row in the tree both carry the dirty mark.
		expect(container.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
		button(container, "Save")?.click();
		await settle();
		expect(saves).toEqual([
			{ path: "notes.md", text: "one\ntwo\nthree\nfour", base: hash("one\ntwo\nthree") },
		]);
		expect(disk.get("notes.md")).toBe("one\ntwo\nthree\nfour");
		expect(container.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
	});

	it("saves on ctrl/cmd+s, without a button", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "one\ntwo\nthree\nfour");
		// Mod is Ctrl away from a Mac, which is what CodeMirror's Mod-s binds to here.
		container
			.querySelector<HTMLElement>(".cm-content")
			?.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
		await settle();
		expect(saves).toHaveLength(1);
		expect(disk.get("notes.md")).toBe("one\ntwo\nthree\nfour");
	});

	it("shows the changes against the file as it was opened", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "one\nTWO\nthree");
		button(container, "Changes")?.click();
		await settle();
		expect(container.textContent).toContain("TWO");
		expect(container.querySelector("tr[data-kind]")).not.toBeNull();
	});

	it("asks what to do when the file changed on disk, and can take the file from disk", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "mine");
		// Something else — an agent, another tab — writes the file first.
		disk.set("notes.md", "theirs");
		button(container, "Save")?.click();
		await settle();
		expect(container.textContent).toContain("This file changed on disk");
		expect(disk.get("notes.md")).toBe("theirs");
		button(container, "Reload from disk")?.click();
		await settle();
		expect(container.textContent).not.toContain("This file changed on disk");
		expect(container.querySelector(".cm-content")?.textContent).toContain("theirs");
	});

	it("overwrites on purpose, still checked against what is on disk now", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "mine");
		disk.set("notes.md", "theirs");
		button(container, "Save")?.click();
		await settle();
		button(container, "Overwrite")?.click();
		await settle();
		expect(saves).toHaveLength(2);
		expect(saves[1].base).toBe(hash("theirs"));
		expect(disk.get("notes.md")).toBe("mine");
	});

	it("asks before leaving with unsaved changes, and keeps them when cancelled", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "mine");
		button(container, "Close the editor")?.click();
		await settle();
		expect(container.textContent).toContain("Leave without saving?");
		button(container, "Cancel")?.click();
		await settle();
		expect(container.querySelector(".cm-content")?.textContent).toContain("mine");
		button(container, "Close the editor")?.click();
		await settle();
		button(container, "Discard changes")?.click();
		await settle();
		// Back to reading the file, with the save button gone.
		expect(container.textContent).not.toContain("Leave without saving?");
		expect(button(container, "Edit")).toBeDefined();
	});

	it("edits again after a save, based on the version it just saved", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "one\ntwo\nthree\nfour");
		button(container, "Save")?.click();
		await settle();
		button(container, "Close the editor")?.click();
		await settle();
		// The reader shows the saved text, and the next edit starts from it.
		expect(container.textContent).toContain("four");
		button(container, "Edit")?.click();
		await settleEditor();
		expect(container.querySelector(".cm-content")?.textContent).toContain("four");
		await type(container, "one\ntwo\nthree\nfour\nfive");
		button(container, "Save")?.click();
		await settle();
		expect(saves).toHaveLength(2);
		expect(saves[1].base).toBe(hash("one\ntwo\nthree\nfour"));
		expect(container.textContent).not.toContain("This file changed on disk");
		expect(disk.get("notes.md")).toBe("one\ntwo\nthree\nfour\nfive");
	});

	it("asks before opening another file with unsaved changes", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "mine");
		button(container, "readme.md")?.click();
		await settle();
		expect(container.textContent).toContain("Leave without saving?");
		button(container, "Cancel")?.click();
		await settle();
		// Still on the edit, untouched.
		expect(container.querySelector(".cm-content")?.textContent).toContain("mine");
		expect(calls.some((url) => url.endsWith("content?path=readme.md"))).toBe(false);
		button(container, "Back to the folder")?.click();
		await settle();
		expect(container.textContent).toContain("Leave without saving?");
		button(container, "Cancel")?.click();
		await settle();
		button(container, "readme.md")?.click();
		await settle();
		button(container, "Discard changes")?.click();
		await settle();
		expect(calls.some((url) => url.endsWith("content?path=readme.md"))).toBe(true);
		expect(container.querySelector(".cm-content")).toBeNull();
		expect(container.textContent).toContain("hello");
		expect(container.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
		expect(disk.get("notes.md")).toBe("one\ntwo\nthree");
	});

	it("keeps an unsaved draft when the access token is renewed underneath it", async () => {
		await settle();
		button(container, "Edit")?.click();
		await settleEditor();
		await type(container, "unsaved work");
		// Wait out a renewal, as a real session sees every few minutes. A new token is not a new
		// file: the editor has to stay open, and the draft with it.
		const before = renewals;
		for (let i = 0; i < 100 && renewals === before; i++) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		await settle();
		expect(renewals).toBeGreaterThan(before);
		expect(container.querySelector(".cm-content")?.textContent).toContain("unsaved work");
		expect(container.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
		// And it is still the editor's own draft, not what the runner happens to hold.
		expect(container.textContent).not.toContain("one\ntwo\nthree");
	});
});
