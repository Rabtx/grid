import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { automationsService, type Automation } from "../services/automations.service";
import { AutomationsScreen } from "./automations-screen";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({
		currentSlug: () => "grid",
		folders: () => ({ grid: "/tmp/grid" }),
		projects: () => [{ slug: "grid", name: "Grid" }],
	}),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	providersStore: {
		load: vi.fn(async () => {}),
		providers: () => [{ id: "claude", name: "Claude", available: true, models: [], modes: [] }],
	},
}));
vi.mock("../services/automations.service", () => ({
	automationsService: {
		list: vi.fn(),
		templates: vi.fn(),
		runs: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		toggle: vi.fn(),
		run: vi.fn(),
	},
}));

const item: Automation = {
	id: "a1",
	workspace: "alpha",
	ownerId: "alice",
	name: "Review pulls",
	prompt: "Review",
	provider: "claude",
	model: null,
	effort: null,
	mode: null,
	project: "grid",
	workspaceMode: "folder",
	enabled: true,
	triggers: [{ kind: "event", event: "pull_opened" }],
	nextRunAt: null,
	createdAt: "2026-09-28T00:00:00Z",
	updatedAt: "2026-09-28T00:00:00Z",
	lastRun: null,
};
async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("AutomationsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		vi.mocked(automationsService.templates).mockResolvedValue([
			{ id: "review-pulls", name: "Review pull requests", prompt: "Review", event: "pull_opened" },
		]);
		vi.mocked(automationsService.runs).mockResolvedValue([]);
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
	});
	afterEach(() => {
		dispose();
		container.remove();
		vi.clearAllMocks();
	});
	function mount() {
		const Router = createRouter({
			routes: [{ path: "/automations", component: AutomationsScreen }],
			history: memoryHistory("/automations"),
		});
		dispose = render(() => <Router>{(route) => route.children}</Router>, container);
	}
	it("shows the empty state and templates", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([]);
		mount();
		await settle();
		expect(container.textContent).toContain("Let an agent take recurring work");
		expect(container.textContent).toContain("Review pull requests");
	});
	it("lists jobs and opens run history", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([item]);
		mount();
		await settle();
		expect(container.textContent).toContain("Review pulls");
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent?.includes("Review pulls"))
			?.click();
		await settle();
		expect(automationsService.runs).toHaveBeenCalledWith("token", "a1");
		expect(container.textContent).toContain("No runs yet");
	});
	it("opens a template in the create sheet", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([]);
		mount();
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Review pull requests")
			?.click();
		await settle();
		expect(
			[...container.querySelectorAll<HTMLInputElement>("input")].some(
				(input) => input.value === "Review pull requests",
			),
		).toBe(true);
		expect(container.textContent).toContain("Save automation");
	});
	it("shows the runner error and retry action", async () => {
		vi.mocked(automationsService.list).mockRejectedValue(new Error("Runner unavailable"));
		mount();
		await settle();
		expect(container.textContent).toContain("Runner unavailable");
		expect(container.textContent).toContain("Try again");
	});
});
