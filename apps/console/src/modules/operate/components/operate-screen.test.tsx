import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { observedState } from "../lib/operate-look";
import { operateService } from "../services/operate.service";
import type { OperateOverview } from "../types/operate.types";
import { OperateScreen } from "./operate-screen";

const identity = vi.hoisted(() => ({ token: (): string => "token" }));
vi.mock("@/modules/auth", () => ({ useAuth: () => identity }));
vi.mock("../services/operate.service", () => ({
	operateService: { overview: vi.fn(), save: vi.fn(), remove: vi.fn() },
}));

async function settle(): Promise<void> {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const sample = (): OperateOverview => ({
	project: "grid",
	intervalSeconds: 60,
	allowed: true,
	checkedAt: new Date().toISOString(),
	services: [
		{
			id: "api",
			name: "Production API",
			url: "https://api.example.com/health",
			state: "healthy",
			checkedAt: new Date().toISOString(),
			responseMs: 120,
			p95: 190,
			uptime: 99,
			coverage: 70,
			checks: 1008,
			incidentId: null,
		},
	],
	incidents: [
		{
			id: "incident",
			serviceId: "api",
			serviceName: "Production API",
			url: "https://api.example.com/health",
			status: "resolved",
			openedAt: new Date(Date.now() - 600000).toISOString(),
			resolvedAt: new Date().toISOString(),
			monitoring: true,
		},
	],
});

describe("Operate", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let changeToken: (value: string) => void;
	beforeEach(() => {
		const [token, setToken] = createSignal("token");
		identity.token = token;
		changeToken = setToken;
		vi.mocked(operateService.overview).mockResolvedValue(sample());
		container = document.createElement("div");
		document.body.append(container);
	});
	afterEach(() => {
		dispose?.();
		container.remove();
		vi.clearAllMocks();
	});
	function mount(): void {
		const Router = createRouter({
			routes: [{ path: "/operate/:slug", component: OperateScreen }],
			history: memoryHistory("/operate/grid"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	}
	it("shows actual measurements separately from coverage and recovered incidents", async () => {
		mount();
		await settle();
		expect(container.textContent).toContain("99.00%");
		expect(container.textContent).toContain("70.00%");
		expect(container.textContent).toContain("190 ms");
		expect(container.textContent).toContain("Recovered");
		expect(container.textContent).toContain("monitoring gaps are unknown");
	});
	it("marks stale healthy readings unknown", async () => {
		const view = sample();
		view.services[0]!.checkedAt = new Date(Date.now() - 240000).toISOString();
		vi.mocked(operateService.overview).mockResolvedValue(view);
		mount();
		await settle();
		expect(container.textContent).toContain("Unknown");
		expect(container.textContent).toContain("0 / 1");
		expect(observedState(view.services[0]!, Date.now())).toBe("unknown");
	});
	it("does not let a late account response populate the next account", async () => {
		let answer!: (value: OperateOverview) => void;
		vi.mocked(operateService.overview).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					answer = resolve;
				}),
		);
		mount();
		await settle();
		changeToken("other");
		await settle();
		const old = sample();
		old.services[0]!.name = "Old account service";
		answer(old);
		await settle();
		expect(container.textContent).not.toContain("Old account service");
		expect(operateService.overview).toHaveBeenLastCalledWith("other", "grid");
	});
	it("clears healthy data when the runner cannot answer", async () => {
		vi.mocked(operateService.overview).mockRejectedValue(new Error("Runner unavailable"));
		mount();
		await settle();
		expect(container.textContent).toContain("Runner unavailable");
		expect(container.textContent).not.toContain("99.00%");
	});
	it("preserves unresolved incidents when monitoring has stopped", async () => {
		const view = sample();
		view.incidents[0]!.status = "open";
		view.incidents[0]!.resolvedAt = null;
		view.incidents[0]!.monitoring = false;
		vi.mocked(operateService.overview).mockResolvedValue(view);
		mount();
		await settle();
		expect(container.textContent).toContain("Monitoring stopped");
		expect(container.textContent).toContain("1");
	});
	it("shows an empty state and withholds mutation actions from members", async () => {
		const view = sample();
		view.allowed = false;
		view.services = [];
		view.incidents = [];
		vi.mocked(operateService.overview).mockResolvedValue(view);
		mount();
		await settle();
		expect(container.textContent).toContain("No services monitored");
		expect(container.textContent).not.toContain("Monitor service");
	});
	it("registers a monitor and refreshes health after saving", async () => {
		mount();
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Monitor service")
			?.click();
		await settle();
		const fields = container.querySelectorAll<HTMLInputElement>("dialog input");
		fields[0]!.value = "Public API";
		fields[0]!.dispatchEvent(new Event("input", { bubbles: true }));
		fields[1]!.value = "https://api.example.com/health";
		fields[1]!.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
		[...container.querySelectorAll<HTMLButtonElement>("dialog button")]
			.find((button) => button.textContent === "Start monitoring")
			?.click();
		await settle();
		expect(operateService.save).toHaveBeenCalledWith(
			"token",
			"grid",
			"Public API",
			"https://api.example.com/health",
		);
		expect(operateService.overview).toHaveBeenCalledTimes(2);
	});
	it("stops a service only after confirmation", async () => {
		mount();
		await settle();
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Stop monitoring Production API"]')
			?.click();
		await settle();
		expect(operateService.remove).not.toHaveBeenCalled();
		[...container.querySelectorAll<HTMLButtonElement>("dialog button")]
			.find((button) => button.textContent === "Stop monitoring")
			?.click();
		await settle();
		expect(operateService.remove).toHaveBeenCalledWith("token", "grid", "Production API");
	});
});
