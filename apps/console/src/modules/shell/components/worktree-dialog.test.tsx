import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/modules/auth";
import type { ChatSession } from "@/modules/chat/types/chat.types";

import { WorktreeDialog } from "./worktree-dialog";

const session: ChatSession = {
	id: "abcdef12-0000",
	project: "shop",
	provider: "claude",
	title: "Fix the cart",
	cwd: "/p/.grid-worktrees/shop/chat-abcdef12",
	model: null,
	mode: null,
	effort: null,
	worktree: {
		repo: "/p/shop",
		path: "/p/.grid-worktrees/shop/chat-abcdef12",
		branch: "grid/chat-abcdef12",
		base: "main",
		origin: "/p/shop",
	},
	createdAt: "2026-09-27T10:00:00Z",
	updatedAt: "2026-09-27T10:00:00Z",
};

const json = (data: unknown): Response =>
	new Response(JSON.stringify({ success: true, statusCode: 200, data }), {
		headers: { "Content-Type": "application/json" },
	});
async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(status: { changed: number; unpushed: number }) {
	const calls: { url: string; body?: string }[] = [];
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
			calls.push({ url, body: init?.body ? String(init.body) : undefined });
			if (url.endsWith("/auth/refresh"))
				return json({
					accessToken: "token",
					accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
					user: { id: "u1", email: "person@example.com", username: "person" },
				});
			if (url.endsWith("/worktree/discard")) return new Response(null, { status: 204 });
			if (url.endsWith("/worktree"))
				return json({
					branch: "grid/chat-abcdef12",
					base: "main",
					path: session.cwd,
					exists: true,
					...status,
				});
			return json(null);
		}),
	);
	const onClose = vi.fn();
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(
		() => (
			<AuthProvider>
				<WorktreeDialog session={session} onClose={onClose} />
			</AuthProvider>
		),
		container,
	);
	const button = (label: string) =>
		[...document.querySelectorAll<HTMLButtonElement>("dialog button")].find(
			(item) => item.textContent?.trim() === label,
		);
	return { calls, onClose, button, done: () => (dispose(), container.remove()) };
}

describe("WorktreeDialog", () => {
	let done = () => {};
	afterEach(() => {
		done();
		vi.unstubAllGlobals();
	});

	it("keeps the branch by default and says its commits are kept", async () => {
		const view = mount({ changed: 0, unpushed: 2 });
		done = view.done;
		await settle();
		expect(document.body.textContent).toContain("2 commits not pushed or merged");
		expect(view.button("Delete branch and 2 commits")).toBeDefined();
		view.button("Remove, keep branch")?.click();
		await settle();
		const sent = view.calls.find((call) => call.url.endsWith("/worktree/discard"));
		expect(sent?.body).toBe(JSON.stringify({ deleteBranch: false }));
		expect(view.onClose).toHaveBeenCalled();
	});

	it("only offers to throw away uncommitted changes by name", async () => {
		const view = mount({ changed: 3, unpushed: 0 });
		done = view.done;
		await settle();
		expect(document.body.textContent).toContain("3 files changed and not committed");
		expect(view.button("Remove, keep branch")).toBeUndefined();
		view.button("Throw away 3 changes")?.click();
		await settle();
		const sent = view.calls.find((call) => call.url.endsWith("/worktree/discard"));
		expect(sent?.body).toBe(JSON.stringify({ deleteBranch: false, force: true }));
	});
});
