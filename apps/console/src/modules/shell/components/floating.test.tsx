import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "../context/shell-context";
import { FloatingSidebar, FloatingTopBar } from "./floating";

const switchTo = vi.fn();
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({ slug: "rabtx", name: "RabtX", color: null, logoUrl: null }),
		list: () => [
			{ slug: "rabtx", name: "RabtX", color: null, logoUrl: null },
			{ slug: "school", name: "School", color: null, logoUrl: null },
		],
		switchTo,
		setCreateOpen: vi.fn(),
	}),
}));
vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({ currentSlug: () => "grid", setAddProjectOpen: vi.fn() }),
}));
vi.mock("@/modules/inbox", () => ({ inboxStore: { unread: () => 2 } }));
vi.mock("./project-tree", () => ({ ProjectTree: () => <p>Projects tree</p> }));
vi.mock("./account-menu", () => ({ AccountMenu: () => <button type="button">Account</button> }));

async function settle() {
	for (let index = 0; index < 6; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

function mount(path: string, page: () => unknown) {
	const container = document.createElement("div");
	document.body.append(container);
	const Router = createRouter({
		routes: [{ path: "/*", component: page as () => never }],
		history: memoryHistory(path),
	});
	const dispose = render(
		() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
		container,
	);
	return { container, dispose };
}

describe("floating sidebar", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.innerHTML = "";
		localStorage.clear();
	});

	it("top bar: folds the sidebar, names the workspace and opens the Inbox", async () => {
		const view = mount("/chat", () => <FloatingTopBar />);
		dispose = view.dispose;
		await settle();
		const toggle = view.container.querySelector<HTMLButtonElement>(
			'button[aria-label="Hide sidebar"]',
		);
		expect(toggle).not.toBeNull();
		toggle?.click();
		await settle();
		expect(view.container.querySelector('button[aria-label="Show sidebar"]')).not.toBeNull();
		expect(view.container.textContent).toContain("RabtX");
		const inbox = view.container.querySelector<HTMLAnchorElement>(
			'a[aria-label="Inbox, 2 unread"]',
		);
		expect(inbox?.getAttribute("href")).toContain("/inbox");
	});

	it("card: every destination as an icon, the current one marked, then the projects", async () => {
		const view = mount("/chat/grid", () => <FloatingSidebar />);
		dispose = view.dispose;
		await settle();
		const nav = view.container.querySelector('nav[aria-label="Workspace"]');
		const links = [...(nav?.querySelectorAll("a") ?? [])];
		expect(links.map((link) => link.getAttribute("data-tooltip"))).toEqual([
			"Home",
			"Inbox",
			"Threads",
			"Board",
			"Files",
			"Notes",
			"Terminal",
			"Pull requests",
			"Ship",
			"Automations",
		]);
		const current = links.find((link) => link.getAttribute("aria-current") === "page");
		expect(current?.getAttribute("data-tooltip")).toBe("Threads");
		expect(view.container.textContent).toContain("Projects tree");
	});

	it("card: holds a body in place of the projects (settings' pages)", async () => {
		const view = mount("/settings/profile", () => (
			<FloatingSidebar body={() => <p>Settings pages</p>} />
		));
		dispose = view.dispose;
		await settle();
		expect(view.container.textContent).toContain("Settings pages");
		expect(view.container.textContent).not.toContain("Projects tree");
	});
});
