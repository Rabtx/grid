import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { shipService } from "../services/ship.service";
import type { EnvironmentDetail } from "../types/ship.types";
import { EnvironmentView } from "./environment-view";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("../services/ship.service", () => ({
	shipService: {
		environment: vi.fn(),
		promote: vi.fn(async () => ({ version: "v0.8.4" })),
		rollback: vi.fn(async () => ({ version: "v0.8.2" })),
		saveSettings: vi.fn(),
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const production: EnvironmentDetail = {
	name: "production",
	kind: "production",
	version: "v0.8.3",
	sha: "3".repeat(40),
	state: "healthy",
	url: "https://app.rabtx.dev",
	deployedAt: ago(2),
	ahead: null,
	repository: "rabtx/app",
	host: "GitHub Actions",
	deployedBy: "shabir",
	health: { errorRate: null, p95: 312, uptime: 99.98, checks: 8640, deploysWeek: 2 },
	promotion: {
		from: {
			name: "staging",
			version: "4444444",
			sha: "4".repeat(40),
			url: "https://staging.rabtx.dev",
		},
		ahead: 2,
		commits: [
			{
				sha: "a41f2c9".padEnd(40, "0"),
				title: "Fix ETA rounding off-by-one",
				author: "ana",
				agent: "claude",
			},
			{ sha: "9be03d1".padEnd(40, "0"), title: "Bump vite to 6.2", author: "ana", agent: null },
		],
		checks: { total: 14, passed: 14, failed: 0, pending: 0 },
		migrations: ["0042_eta_rounding.sql"],
		version: "v0.8.4",
		method: "A vx.y.z release tag starts cd.yml",
		ready: true,
	},
	history: [
		{
			id: 30,
			version: "v0.8.3",
			sha: "3".repeat(40),
			title: "Seed demo drivers",
			author: "shabir",
			agent: null,
			at: ago(2),
			seconds: 112,
			state: "live",
			logUrl: "https://github.com/rabtx/app/actions/runs/11/job/12",
			canRollback: false,
		},
		{
			id: 25,
			version: "v0.8.1",
			sha: "5".repeat(40),
			title: "Pricing page copy",
			author: "opencode",
			agent: "opencode",
			at: ago(6),
			seconds: 30,
			state: "failed",
			logUrl: "https://github.com/rabtx/app/actions/runs/26/job/27",
			canRollback: false,
		},
		{
			id: 20,
			version: "v0.8.2",
			sha: "2".repeat(40),
			title: "Show ETA on the driver card",
			author: "ana",
			agent: null,
			at: ago(5),
			seconds: 107,
			state: "success",
			logUrl: "https://github.com/rabtx/app/actions/runs/21/job/22",
			canRollback: true,
		},
	],
	watch: null,
	method: "A vx.y.z release tag starts cd.yml",
	settings: {},
	allowed: true,
};

describe("EnvironmentView", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(shipService.environment).mockResolvedValue(production);
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [
				{
					path: "/ship/grid/env/production",
					component: () => (
						<EnvironmentView
							project="grid"
							name="production"
							onChanged={() => {}}
							onBack={() => {}}
						/>
					),
				},
			],
			history: memoryHistory("/ship/grid/env/production"),
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

	it("shows health, what staging would ship, and each deploy with what can be done", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("312 ms");
		expect(text).toContain("99.98%");
		expect(text).toContain("Connect Sentry");
		expect(text).toContain("Staging is 2 commits ahead");
		expect(text).toContain("Fix ETA rounding off-by-one");
		expect(text).toContain("14 checks passed");
		expect(text).toContain("Seed demo drivers");
		expect(text).toContain("Live");
		expect(text).toContain("Build failed");
		expect(text).toContain("View log");
		expect(shipService.environment).toHaveBeenCalledWith("token", "grid", "production");
	});

	it("promotes after showing the gates, watching the site for 15 minutes", async () => {
		await settle();
		const promote = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Promote to production",
		);
		promote?.click();
		await settle();
		const dialog = document.body.textContent ?? "";
		expect(dialog).toContain("Promote v0.8.4 to production?");
		expect(dialog).toContain("All 14 checks passed");
		expect(dialog).toContain("Migration 0042_eta_rounding.sql");
		expect(dialog).toContain("Rollback is ready");
		const confirm = [...document.querySelectorAll("dialog button")].find(
			(button) => button.textContent === "Promote",
		) as HTMLButtonElement | undefined;
		confirm?.click();
		await settle();
		expect(shipService.promote).toHaveBeenCalledWith("token", "grid", "production", true);
	});
});
