import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush, Loading } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localStore } from "@/lib/local-store";
import { projectsService, WorkspaceProvider, useWorkspace } from "@/modules/projects";
import { WorkspacesProvider } from "@/modules/workspaces";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "first-token" }) }));
let dispose: (() => void) | undefined;
let container: HTMLElement;
beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation(async () => Response.json({ data: {} })),
	);
	localStore.setUser("first");
	container = document.createElement("div");
	document.body.append(container);
});
afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
	localStore.setUser(null);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
function ProjectsProbe() {
	const workspace = useWorkspace();
	return <span>{workspace.projects().length}</span>;
}
async function settle() {
	for (let n = 0; n < 10; n++) await Promise.resolve();
	flush();
}
describe("disposed account memo cache writes", () => {
	it("does not persist an old project's late read into the next account", async () => {
		let finish!: (value: Awaited<ReturnType<typeof projectsService.list>>) => void;
		vi.spyOn(projectsService, "list").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const persist = vi.spyOn(localStore, "set").mockResolvedValue();
		const Router = createRouter({
			routes: [{ path: "/board/:slug", component: () => null }],
			history: memoryHistory("/board/alpha"),
		});
		dispose = render(
			() => (
				<Router>
					{() => (
						<Loading fallback={null}>
							<WorkspaceProvider>
								<ProjectsProbe />
							</WorkspaceProvider>
						</Loading>
					)}
				</Router>
			),
			container,
		);
		flush();
		await settle();
		dispose();
		dispose = undefined;
		localStore.setUser("second");
		finish([
			{
				slug: "alpha",
				name: "Private project",
				status: "active",
				summary: null,
				repoUrl: null,
				createdAt: "now",
				updatedAt: "now",
			},
		]);
		await settle();
		expect(persist).not.toHaveBeenCalledWith("projects", expect.anything());
	});
	it("does not persist a disposed workspace list into the next account", async () => {
		let finish!: (value: Awaited<ReturnType<typeof workspacesService.list>>) => void;
		vi.spyOn(workspacesService, "list").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const persist = vi.spyOn(localStore, "set").mockResolvedValue();
		dispose = render(
			() => (
				<WorkspacesProvider>
					<span>Workspace</span>
				</WorkspacesProvider>
			),
			container,
		);
		flush();
		await settle();
		dispose();
		dispose = undefined;
		localStore.setUser("second");
		finish([]);
		await settle();
		expect(persist).not.toHaveBeenCalledWith("workspaces", expect.anything());
	});
});
