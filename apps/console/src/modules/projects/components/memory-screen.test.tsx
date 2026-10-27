import { createRouter, memoryHistory, useLocation } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";

import { MemoryScreen } from "./memory-screen";

vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ slug: "acme", name: "Acme", role: "member" }) }),
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: {
		members: async () => [{ userId: "bo", username: "bo", displayName: "Bo Lind" }],
	},
}));

const entry = (
	id: string,
	kind: string,
	text: string,
	by: Record<string, string>,
	sessionId: string | null = null,
) => ({
	id,
	project: "alpha",
	kind,
	text,
	by,
	sessionId,
	createdAt: "2026-10-27T10:00:00.000Z",
	updatedAt: "2026-10-27T10:00:00.000Z",
	used: kind === "decision" ? 2 : 0,
	usedAt: null,
});

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(status < 400 ? { success: true, statusCode: status, data } : data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const buttonNamed = (root: ParentNode, name: string) =>
	[...root.querySelectorAll<HTMLButtonElement>("button")].filter(
		(item) => item.getAttribute("aria-label") === name || item.textContent?.trim() === name,
	);

function Where(): JSX.Element {
	const location = useLocation();
	return <output data-slot="where">{location.pathname}</output>;
}

function mount(answer: (url: string, init?: RequestInit) => Response | null) {
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
			return answer(url, init) ?? json([]);
		}),
	);
	const Router = createRouter({
		routes: [
			{ path: "/memory/:slug", component: MemoryScreen },
			{ path: "/chat/:slug/:id", component: () => <span>the thread</span> },
		],
		history: memoryHistory("/memory/alpha"),
	});
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => (
			<AuthProvider>
				<Router>
					{(route) => (
						<>
							<Where />
							{route.children}
						</>
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

describe("MemoryScreen", () => {
	let done = () => {};
	afterEach(() => {
		done();
		vi.unstubAllGlobals();
	});

	it("lists what the project kept, by kind and who kept it, and searches it", async () => {
		const mounted = mount((url) => {
			if (url.includes("/memory?project=alpha&q=queue"))
				return json([
					entry(
						"m1",
						"decision",
						"Advisory locks for the job queue.",
						{ kind: "agent", id: "t1", name: "Claude Code" },
						"t1",
					),
				]);
			if (url.includes("/memory?project=alpha"))
				return json([
					entry(
						"m1",
						"decision",
						"Advisory locks for the job queue.",
						{ kind: "agent", id: "t1", name: "Claude Code" },
						"t1",
					),
					entry("m2", "convention", "Money is in cents.", { kind: "person", id: "u1", name: "u1" }),
				]);
			return null;
		});
		done = mounted.done;
		await settle();
		const text = mounted.container.textContent ?? "";
		expect(text).toContain("Advisory locks for the job queue.");
		expect(text).toContain("Claude Code");
		expect(text).toContain("started 2 threads");
		expect(text).toContain("Money is in cents.");
		// Only conventions.
		buttonNamed(mounted.container, "Conventions")[0]?.click();
		await settle();
		expect(mounted.container.textContent).not.toContain("Advisory locks");
		buttonNamed(mounted.container, "All")[0]?.click();
		const search = mounted.container.querySelector<HTMLInputElement>(
			'input[aria-label="Search memory"]',
		);
		if (!search) throw new Error("no search");
		search.value = "queue";
		search.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		expect(mounted.calls.some((call) => call.url.includes("q=queue"))).toBe(true);
		expect(mounted.container.textContent).not.toContain("Money is in cents.");
		// Its thread opens from it.
		buttonNamed(mounted.container, "Thread")[0]?.click();
		await settle();
		expect(mounted.container.querySelector('[data-slot="where"]')?.textContent).toBe(
			"/chat/alpha/t1",
		);
	});

	it("adds one, and says why when it may not remove one", async () => {
		const kept: unknown[] = [];
		const mounted = mount((url, init) => {
			if (url.endsWith("/memory") && init?.method === "POST") {
				kept.push(JSON.parse(String(init.body)));
				return json(
					entry("m3", "fact", "Staging resets nightly.", { kind: "person", id: "u1", name: "u1" }),
					201,
				);
			}
			if (url.endsWith("/memory/m2") && init?.method === "DELETE")
				return json(
					{ message: "Only whoever kept it, or an owner or admin, removes a memory" },
					403,
				);
			if (url.includes("/memory?project=alpha"))
				return json([
					entry("m2", "convention", "Money is in cents.", { kind: "person", id: "bo", name: "bo" }),
				]);
			return null;
		});
		done = mounted.done;
		await settle();
		buttonNamed(mounted.container, "Add")[0]?.click();
		await settle();
		const field = document.querySelector<HTMLTextAreaElement>("dialog[open] textarea");
		if (!field) throw new Error("no field");
		field.value = "Staging resets nightly.";
		field.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		const dialog = document.querySelector("dialog[open]") as HTMLElement;
		buttonNamed(dialog, "Add")[0]?.click();
		await settle();
		expect(kept).toEqual([{ project: "alpha", kind: "decision", text: "Staging resets nightly." }]);
		buttonNamed(mounted.container, "Remove")[0]?.click();
		await settle();
		const confirm = document.querySelector("dialog[open]") as HTMLElement;
		buttonNamed(confirm, "Remove")[0]?.click();
		await settle();
		expect(mounted.container.textContent).toContain("Only whoever kept it");
	});
});
