import { createRouter, memoryHistory } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider, useShell } from "@/modules/shell";

import {
	automationsService,
	DEFAULT_OPTIONS,
	type Automation,
	type AutomationRun,
} from "../services/automations.service";
import { AutomationsScreen } from "./automations-screen";

vi.mock("@/modules/auth", () => ({
	useAuth: () => ({
		token: () => "token",
		user: () => ({ id: "alice", email: "alice@example.com", username: "alice" }),
	}),
}));
vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({
		currentSlug: () => "grid",
		folders: () => ({ grid: "/tmp/grid" }),
		projects: () => [{ slug: "grid", name: "Grid" }],
	}),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	agentName: (id: string) => (id === "claude" ? "Claude" : id),
	offeredProviders: <T,>(list: T[]) => list,
	providersStore: {
		load: vi.fn(async () => {}),
		providers: () => [{ id: "claude", name: "Claude", available: true, models: [], modes: [] }],
	},
}));
vi.mock("@/modules/chat/stores/roles", () => ({
	rolesStore: { load: vi.fn(async () => {}), roles: () => [] },
}));
vi.mock("../services/automations.service", async (original) => ({
	...(await original<Record<string, unknown>>()),
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
	options: { ...DEFAULT_OPTIONS },
	nextRunAt: null,
	createdAt: "2026-09-28T00:00:00Z",
	updatedAt: "2026-09-28T00:00:00Z",
	lastRun: null,
	recent: [],
	machine: "studio",
};
const run: AutomationRun = {
	id: "r1",
	automationId: "a1",
	trigger: "schedule",
	status: "succeeded",
	error: null,
	sessionId: "s1",
	scheduledFor: null,
	startedAt: "2026-09-29T02:00:00Z",
	finishedAt: "2026-09-29T02:04:12Z",
	summary: "Fixed the rounding",
	pullNumber: 142,
	costUsd: 0.4,
	steps: [{ title: "bun test", detail: "213 passed · 1 failed" }],
};

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

/** What the shell draws around the screen: the panel and the top bar's slots. */
function ShellOutlet(): JSX.Element {
	const shell = useShell();
	return (
		<>
			<nav data-slot="panel">{shell.panel()?.()}</nav>
			<div data-slot="crumb">{shell.crumb()?.()}</div>
			<div data-slot="actions">{shell.actions()?.()}</div>
		</>
	);
}

describe("AutomationsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		vi.mocked(automationsService.templates).mockResolvedValue([
			{
				id: "review-pulls",
				name: "Review pull requests",
				prompt: "Review",
				event: "pull_opened",
				icon: "eye",
				description: "On every new PR",
			},
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
	function mount(path = "/automations") {
		const Router = createRouter({
			routes: [{ path: "/automations/:id?", component: AutomationsScreen }],
			history: memoryHistory(path),
		});
		dispose = render(
			() => (
				<Router>
					{(route) => (
						<ShellProvider>
							<ShellOutlet />
							{route.children}
						</ShellProvider>
					)}
				</Router>
			),
			container,
		);
	}
	const panel = () => container.querySelector('[data-slot="panel"]') as HTMLElement;
	const buttonNamed = (name: string) =>
		[...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.getAttribute("aria-label") === name || button.textContent === name,
		);

	it("shows the empty state and templates", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([]);
		mount();
		await settle();
		expect(container.textContent).toContain("Let an agent take the recurring work");
		expect(container.textContent).toContain("Review pull requests");
		expect(container.textContent).toContain("On every new PR");
	});
	it("lists active and paused jobs in the panel, with when each runs", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([
			{ ...item, id: "a2", name: "Nightly", enabled: false },
			{
				...item,
				id: "a3",
				name: "Morning",
				triggers: [{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "UTC" }],
				nextRunAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
			},
		]);
		mount();
		await settle();
		const text = panel().textContent ?? "";
		expect(text.indexOf("Active")).toBeLessThan(text.indexOf("Paused"));
		expect(text).toContain("Every day at 09:00");
		expect(text).toContain("When a PR is opened");
		expect(panel().querySelector('a[href$="/automations/a3"]')).not.toBeNull();
	});
	it("opens one as its recipe, guardrails, runs and last run", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([
			{
				...item,
				workspaceMode: "worktree",
				options: {
					...DEFAULT_OPTIONS,
					branch: "main",
					pullRequest: true,
					waitForReview: true,
					minutes: 20,
					offLimits: ["migrations", ".env"],
				},
				lastRun: run,
				recent: [run],
			},
		]);
		vi.mocked(automationsService.runs).mockResolvedValue([run]);
		mount("/automations/a1");
		await settle();
		expect(automationsService.runs).toHaveBeenCalledWith("token", "a1");
		const text = container.textContent ?? "";
		expect(text).toContain("Created by alice");
		expect(text).toContain("a PR is opened");
		expect(text).toContain("studio");
		expect(text).toContain("wait for my review");
		expect(text).toContain("20 min");
		expect(text).toContain("migrations, .env");
		expect(text).toContain("Needs review");
		expect(text).toContain("213 passed · 1 failed");
		expect(text).toContain("Opened PR #142");
		expect(text).toContain("100% passed · 1 PR");
		expect(container.querySelector('a[href$="/pulls/grid/142"]')?.textContent).toBe("Review");
	});
	it("runs one now from its actions", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([item]);
		vi.mocked(automationsService.run).mockResolvedValue({ ...run, status: "running" });
		mount("/automations/a1");
		await settle();
		const actions = container.querySelector('[data-slot="actions"]') as HTMLElement;
		[...actions.querySelectorAll("button")]
			.find((button) => button.textContent?.includes("Run now"))
			?.click();
		await settle();
		expect(automationsService.run).toHaveBeenCalledWith("token", "a1");
	});
	it("opens a template as a new automation on the first agent, and creates it", async () => {
		vi.mocked(automationsService.list).mockResolvedValue([]);
		vi.mocked(automationsService.create).mockResolvedValue(item);
		mount();
		await settle();
		buttonNamed("Start from Review pull requests")?.click();
		await settle();
		expect(
			[...container.querySelectorAll<HTMLInputElement>("input")].some(
				(input) => input.value === "Review pull requests",
			),
		).toBe(true);
		expect(container.textContent).toContain("New automation");
		buttonNamed("Create automation")?.click();
		await settle();
		expect(automationsService.create).toHaveBeenCalledWith(
			"token",
			expect.objectContaining({
				name: "Review pull requests",
				provider: "claude",
				project: "grid",
				triggers: [{ kind: "event", event: "pull_opened" }],
				options: expect.objectContaining({ icon: "eye", pullRequest: false }),
			}),
		);
	});
	it("shows the runner error and retry action", async () => {
		vi.mocked(automationsService.list).mockRejectedValue(new Error("Runner unavailable"));
		mount();
		await settle();
		expect(container.textContent).toContain("Runner unavailable");
		expect(container.textContent).toContain("Try again");
	});
});
