import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { machineService } from "../services/machine.service";
import { MachinesScreen } from "./machines-screen";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ slug: "rabtx", name: "RabtX", role: "owner" }) }),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	offeredProviders: <T,>(list: T[]) => list,
	providersStore: { load: vi.fn(), providers: () => [] },
}));
vi.mock("./codespaces-panel", () => ({ CodespacesPanel: () => null }));
vi.mock("../stores/environments", () => ({
	environmentsStore: { load: vi.fn(), environments: () => [], remove: vi.fn(), add: vi.fn() },
}));
vi.mock("../services/machine.service", () => ({
	machineService: {
		status: vi.fn(),
		update: vi.fn(),
		updateStatus: vi.fn(async () => ({
			available: false,
			reason: "Grid is not running as a systemd service on this machine",
			current: { commit: "abc1234", subject: "fix: something" },
			behind: null,
			last: null,
		})),
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("MachinesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(machineService.status).mockResolvedValue({
			info: {
				hostname: "rabtx-studio",
				system: "macOS 15",
				cpu: "Apple M3 Pro",
				cores: 12,
				memory: { totalBytes: 36 * 1024 ** 3, usedBytes: 18 * 1024 ** 3 },
				cpuPercent: 34,
				disk: { totalBytes: 1000 * 1024 ** 3, freeBytes: 212 * 1024 ** 3 },
				runnerVersion: "v0.12",
				startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
			},
			prefs: { keepAwake: true, concurrency: 2, startAtLogin: false },
			agentsRunning: 2,
			terminals: 3,
			projectsDir: "/home/ana/Projects",
		});
		vi.mocked(machineService.update).mockResolvedValue({
			keepAwake: true,
			concurrency: 4,
			startAtLogin: false,
		});
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/machines", component: MachinesScreen }],
			history: memoryHistory("/settings/machines"),
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

	it("shows this machine, its meters, what runs on it and its runner", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("rabtx-studio");
		expect(text).toContain("macOS 15 · Apple M3 Pro · 36 GB · Runner v0.12 · up 3 days");
		expect(text).toContain("34%");
		expect(text).toContain("18 of 36 GB");
		expect(text).toContain("212 GB free");
		expect(text).toContain("2 agents running · 3 terminals");
		expect(text).toContain("Only work inside ~/Projects");
		expect(text).toContain("Worktrees");
		expect(text).toContain("Diagnostics");
	});
	it("changes how many agents work at once", async () => {
		await settle();
		[...container.querySelectorAll("button")].find((button) => button.textContent === "4")?.click();
		await settle();
		expect(machineService.update).toHaveBeenCalledWith("token", { concurrency: 4 });
	});
});
