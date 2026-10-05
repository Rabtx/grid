import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellProvider } from "@/modules/shell";
import { activityService } from "../services/activity.service";
import { machineService } from "../services/machine.service";
import { placementsStore } from "../stores/placements";
import { AgentsOverview } from "./operations-screen";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({ projects: () => [{ slug: "grid" }] }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ role: "owner" }) }),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	agentName: () => "Claude Code",
	offeredProviders: (list: unknown[]) => list,
	providersStore: { load: vi.fn(), providers: () => [] },
}));
vi.mock("@/modules/terminal/services/terminals.service", () => ({
	terminalsService: { list: vi.fn(async () => []) },
}));
vi.mock("../stores/environments", () => ({
	environmentsStore: { load: vi.fn(), environments: () => [] },
}));
vi.mock("../stores/placements", async () => {
	const { createSignal } = await import("solid-js");
	const [environment, setEnvironment] = createSignal<string | null>(null);
	return {
		scopeFor: (id: string | null) => (id ? `/env/${id}` : ""),
		placementsStore: {
			load: vi.fn(),
			environmentOf: environment,
			place: async (_token: string, _project: string, id: string | null) => {
				setEnvironment(id);
			},
		},
	};
});
vi.mock("../services/activity.service", () => ({
	activityService: { list: vi.fn(), stop: vi.fn() },
}));
vi.mock("../services/machine.service", () => ({ machineService: { status: vi.fn() } }));
async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("Agents overview", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(async () => {
		vi.clearAllMocks();
		await placementsStore.place("token", "grid", null);
		vi.mocked(machineService.status).mockResolvedValue({ info: {} } as Awaited<
			ReturnType<typeof machineService.status>
		>);
		vi.mocked(activityService.list).mockResolvedValue([
			{
				id: "s1",
				project: "grid",
				title: "Fix keyboard",
				provider: "claude",
				running: true,
				waiting: true,
				startedAt: null,
				endedAt: null,
				result: null,
				tool: null,
				steps: { done: 2, total: 4 },
			},
		]);
		vi.mocked(activityService.stop).mockResolvedValue(undefined);
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/agents", component: AgentsOverview }],
			history: memoryHistory("/agents"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	});
	afterEach(() => {
		dispose();
		container.remove();
	});
	it("shows a waiting run and only removes it after Stop succeeds", async () => {
		await settle();
		expect(container.textContent).toContain("Needs you");
		expect(container.textContent).toContain("Answer");
		expect(container.textContent).toContain("Steps completed: 50%");
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Stop")
			?.click();
		await settle();
		expect(activityService.stop).toHaveBeenCalledWith("token", "s1", "");
		expect(container.textContent).not.toContain("Fix keyboard");
	});
	it("refetches from the paired runner when placements arrive after mount", async () => {
		await settle();
		await placementsStore.place("token", "grid", "remote");
		await settle();
		expect(activityService.list).toHaveBeenLastCalledWith("token", "grid", "/env/remote");
	});
	it("keeps a live run visible when the runner rejects Stop", async () => {
		vi.mocked(activityService.stop).mockRejectedValue(new Error("Runner disconnected"));
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Stop")
			?.click();
		await settle();
		expect(container.textContent).toContain("Fix keyboard");
	});
});
