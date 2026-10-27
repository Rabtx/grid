import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runnerCall } from "@/lib/runner-client";

import { ReviewsDialog } from "./reviews-dialog";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/environments", () => ({ placementsStore: { scopeOf: () => "" } }));
vi.mock("@/modules/environments/stores/placements", () => ({
	placementsStore: { scopeOf: () => "" },
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	offeredProviders: <T,>(list: T[]) => list,
	providersStore: {
		load: vi.fn(async () => {}),
		providers: () => [
			{ id: "claude", name: "Claude Code", available: true, models: [], modes: [] },
			{ id: "codex", name: "Codex", available: true, models: [], modes: [] },
		],
	},
}));
vi.mock("@/lib/runner-client", () => ({ runnerCall: vi.fn() }));

const review = (patch: Record<string, unknown>) => ({
	id: "r1",
	repo: "acme/web",
	number: 7,
	title: "Charge cards",
	head: "abc1234def",
	status: "posted",
	sessionId: "t1",
	commentUrl: "https://github.com/acme/web/pull/7#c1",
	error: null,
	at: "2026-10-27T10:00:00.000Z",
	manual: false,
	...patch,
});

async function settle(): Promise<void> {
	for (let i = 0; i < 15; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}
const button = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("dialog[open] button")].find(
		(item) => item.getAttribute("aria-label") === name || item.textContent?.trim() === name,
	);

function mount(canManage: boolean) {
	if (!HTMLDialogElement.prototype.showModal)
		HTMLDialogElement.prototype.showModal = function () {
			this.open = true;
		};
	if (!HTMLDialogElement.prototype.close)
		HTMLDialogElement.prototype.close = function () {
			this.open = false;
		};
	const call = vi.mocked(runnerCall);
	call.mockImplementation(async (path: string) => {
		if (path.startsWith("/reviews?project=web"))
			return {
				settings: null,
				reviews: [
					review({}),
					review({
						id: "r2",
						number: 8,
						status: "failed",
						error: "The agent wrote no review",
						sessionId: null,
						commentUrl: null,
					}),
				],
				canManage,
			};
		if (path === "/reviews/settings") return { enabled: true };
		return null;
	});
	const Router = createRouter({
		routes: [
			{
				path: "/pulls/:slug",
				component: () => <ReviewsDialog open project="web" onClose={() => {}} />,
			},
		],
		history: memoryHistory("/pulls/web"),
	});
	const container = document.createElement("div");
	document.body.append(container);
	const dispose = render(() => <Router />, container);
	return {
		call,
		done: () => {
			dispose();
			container.remove();
			call.mockReset();
		},
	};
}

describe("ReviewsDialog", () => {
	let done = () => {};
	afterEach(() => done());

	it("lets admins turn the review agent on, with what reviews look for", async () => {
		const mounted = mount(true);
		done = mounted.done;
		await settle();
		const dialog = document.querySelector("dialog[open]") as HTMLElement;
		expect(dialog.textContent).toContain("#7 Charge cards");
		expect(dialog.textContent).toContain("Posted");
		expect(dialog.textContent).toContain("The agent wrote no review");
		button("Review every pull request")?.click();
		const field = dialog.querySelector("textarea");
		if (!field) throw new Error("no field");
		field.value = "Money is in cents.";
		field.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		button("Save")?.click();
		await settle();
		const saved = mounted.call.mock.calls.find(([path]) => path === "/reviews/settings");
		expect(JSON.parse(String(saved?.[2]?.body))).toEqual({
			project: "web",
			enabled: true,
			provider: "claude",
			model: null,
			instructions: "Money is in cents.",
		});
	});

	it("shows everyone else the reviews, and leaves the settings to admins", async () => {
		const mounted = mount(false);
		done = mounted.done;
		await settle();
		expect(button("Review every pull request")?.disabled).toBe(true);
		expect(button("Save")).toBeUndefined();
		expect(document.querySelector("dialog[open]")?.textContent).toContain(
			"Owners and admins turn this on.",
		);
	});
});
