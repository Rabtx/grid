import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { pulseService } from "../services/pulse.service";
import { PulseScreen } from "./pulse-screen";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({ projects: () => [{ slug: "grid" }] }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({
			slug: "rabtx",
			name: "RabtX",
			role: "owner",
			settings: { finance: { cash: 14280, costs: [{ label: "AI models", monthly: 1020 }] } },
		}),
		refresh: vi.fn(),
	}),
}));
vi.mock("../services/pulse.service", () => ({
	pulseService: { view: vi.fn(), refresh: vi.fn(async () => ({ reading: true })) },
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("PulseScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(pulseService.view).mockResolvedValue({
			days: 30,
			sources: { stripe: true, posthog: false, sentry: false },
			shipping: {
				deploys: 9,
				merged: 23,
				leadTimeHours: 6,
				byAgents: 17,
				byPeople: 6,
				repositories: 1,
				failed: [],
			},
			snapshot: {
				reading: {
					mrr: { value: 4820, currency: "USD", change: 12, series: [1, 2, 3] },
					activeUsers: null,
					activation: null,
					errorRate: null,
					insights: [
						{
							title: "3 failed payments · $96",
							detail: "Stripe invoices",
							source: "Stripe",
							tone: "warn",
						},
					],
					missing: {},
				},
				project: "grid",
				thread: "t1",
				agent: "claude",
				error: null,
				at: new Date().toISOString(),
			},
			reading: false,
		});
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/home/pulse", component: PulseScreen }],
			history: memoryHistory("/home/pulse"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	});
	afterEach(() => {
		dispose();
		container.remove();
		vi.clearAllMocks();
	});

	it("shows the numbers that were read, what shipped, the runway and what is worth knowing", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("$4,820");
		expect(text).toContain("+12%");
		expect(text).toContain("Connect PostHog to see it.");
		expect(text).toContain("PRs merged");
		expect(text).toContain("Agents 17");
		// $4,820 a month in against $1,020 out: revenue covers the costs.
		expect(text).toContain("Profitable");
		expect(text).toContain("3 failed payments · $96");
		expect(text).toContain("Open the thread it was read in");
		expect(pulseService.view).toHaveBeenCalledWith("token", 30);
	});
});
