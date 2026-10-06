import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSession } from "@/modules/chat/types/chat.types";
import type { Project } from "@/modules/projects";

import { ShellProvider } from "../context/shell-context";
import { ProjectTree } from "./project-tree";

const mockProjects = createSignal<Project[]>([]);
const mockCurrentSlug = createSignal<string>("proj-1");
const mockThreadsByProject = createSignal<Record<string, ChatSession[]>>({});
const mockLoaded = createSignal<Record<string, boolean>>({});
const mockNavigate = vi.fn();

vi.mock("@solidjs/router", async () => {
	const actual = await vi.importActual<typeof import("@solidjs/router")>("@solidjs/router");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock("@/modules/auth", () => ({
	useAuth: () => ({
		token: () => "test-token",
	}),
}));

vi.mock("@/modules/projects", () => ({
	useWorkspace: () => ({
		projects: mockProjects[0],
		currentSlug: mockCurrentSlug[0],
		folders: () => ({ "proj-1": "/path/proj-1" }),
		projectHref: (slug: string) => `/chat/${slug}`,
		setAddProjectOpen: vi.fn(),
		setProjectAction: vi.fn(),
		chooseFolderFor: vi.fn(),
	}),
	ProjectIcon: () => <span>Icon</span>,
}));

vi.mock("@/modules/chat/stores/threads", () => ({
	threadsStore: {
		threads: (slug: string) => mockThreadsByProject[0]()[slug] ?? [],
		loaded: (slug: string) => mockLoaded[0]()[slug] ?? true,
		runningIn: () => 0,
		isRunning: () => false,
		error: () => null,
		watchRunning: () => {},
		load: () => Promise.resolve(),
	},
}));

vi.mock("@/modules/inbox", () => ({
	inboxStore: {
		items: () => [],
	},
}));

vi.mock("@/modules/environments/stores/placements", () => ({
	placementsStore: {
		scopeOf: () => "local",
	},
}));

vi.mock("@/modules/chat/services/chat.service", () => ({
	chatService: {
		projectSettings: () => Promise.resolve({ worktrees: false }),
		saveProjectSettings: () => Promise.resolve(),
	},
}));

function makeProject(index: number): Project {
	return {
		slug: `proj-${index}`,
		name: `Project ${index}`,
		summary: null,
		repoUrl: null,
		status: "active",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function makeSession(index: number, project: string = "proj-1"): ChatSession {
	return {
		id: `t-${index}`,
		project,
		provider: "anthropic",
		title: `Thread ${index}`,
		cwd: `/path/${project}`,
		model: null,
		mode: null,
		effort: null,
		worktree: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date(Date.now() - index * 60000).toISOString(),
	};
}

async function settle() {
	for (let index = 0; index < 6; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

/** A finger, as `attachContextMenu` hears one: happy-dom has no `TouchEvent`. */
function touchAt(type: string, x: number, y: number): Event {
	const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
		touches: { clientX: number; clientY: number }[];
	};
	event.touches = [{ clientX: x, clientY: y }];
	return event;
}

/** Counts the popovers a row's gesture opens, whichever instance it holds. */
function spyOnShowPopover(): ReturnType<typeof vi.fn> {
	const spy = vi.fn();
	const original = HTMLElement.prototype.showPopover;
	HTMLElement.prototype.showPopover = function show(this: HTMLElement) {
		spy(this.id);
		return original?.call(this);
	};
	spy.mockRestore = () => {
		if (original) HTMLElement.prototype.showPopover = original;
	};
	return spy as ReturnType<typeof vi.fn> & { mockRestore: () => void };
}

function mount(path: string = "/chat/proj-1") {
	const container = document.createElement("div");
	document.body.append(container);
	const Router = createRouter({
		routes: [{ path: "/*", component: () => <ProjectTree /> }],
		history: memoryHistory(path),
	});
	const dispose = render(
		() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
		container,
	);
	return { container, dispose };
}

describe("ProjectTree pagination and collapse", () => {
	let dispose = () => {};

	beforeEach(() => {
		mockNavigate.mockReset();
		localStorage.clear();
		vi.useRealTimers();
	});

	afterEach(() => {
		dispose();
		document.body.innerHTML = "";
		localStorage.clear();
		vi.useRealTimers();
	});

	it("paginates projects: shows 5 by default, expands on click, and can show fewer", async () => {
		const eightProjects: Project[] = Array.from({ length: 8 }, (_, i) => makeProject(i + 1));
		mockProjects[1](eightProjects);
		mockCurrentSlug[1]("proj-1");

		const view = mount();
		dispose = view.dispose;
		await settle();

		// Should render the first 5 projects
		expect(view.container.textContent).toContain("Project 1");
		expect(view.container.textContent).toContain("Project 5");
		expect(view.container.textContent).not.toContain("Project 6");
		expect(view.container.textContent).not.toContain("Project 8");

		// Pagination button should show remaining count
		const loadMoreBtn = Array.from(view.container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Show 3 more projects"),
		);
		expect(loadMoreBtn).toBeDefined();

		// Click to expand
		loadMoreBtn?.click();
		await settle();

		// Now all 8 should be visible
		expect(view.container.textContent).toContain("Project 6");
		expect(view.container.textContent).toContain("Project 8");

		// "Show fewer projects" button should now exist
		const showFewerBtn = Array.from(view.container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Show fewer projects"),
		);
		expect(showFewerBtn).toBeDefined();

		// Click to collapse back
		showFewerBtn?.click();
		await settle();

		expect(view.container.textContent).not.toContain("Project 6");
	});

	it("paginates threads: shows 5 latest threads by default and loads more on demand", async () => {
		const oneProject: Project[] = [makeProject(1)];
		const sevenThreads: ChatSession[] = Array.from({ length: 7 }, (_, i) =>
			makeSession(i + 1, "proj-1"),
		);

		mockProjects[1](oneProject);
		mockCurrentSlug[1]("proj-1");
		mockThreadsByProject[1]({ "proj-1": sevenThreads });
		mockLoaded[1]({ "proj-1": true });

		const view = mount();
		dispose = view.dispose;
		await settle();

		// First 5 threads should be rendered
		expect(view.container.textContent).toContain("Thread 1");
		expect(view.container.textContent).toContain("Thread 5");
		expect(view.container.textContent).not.toContain("Thread 6");
		expect(view.container.textContent).not.toContain("Thread 7");

		// Pagination button should show remaining count
		const loadMoreBtn = Array.from(view.container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Load 2 more"),
		);
		expect(loadMoreBtn).toBeDefined();

		// Click to expand
		loadMoreBtn?.click();
		await settle();

		// Now threads 6 and 7 should be visible
		expect(view.container.textContent).toContain("Thread 6");
		expect(view.container.textContent).toContain("Thread 7");

		// "Show fewer threads" should appear
		const showFewerBtn = Array.from(view.container.querySelectorAll("button")).find((b) =>
			b.textContent?.includes("Show fewer threads"),
		);
		expect(showFewerBtn).toBeDefined();

		// Click show fewer
		showFewerBtn?.click();
		await settle();

		expect(view.container.textContent).not.toContain("Thread 6");
	});

	it("keeps the thread count off the project row, so nothing collides with the chevron", async () => {
		const sevenThreads = Array.from({ length: 7 }, (_, i) => makeSession(i + 1));
		mockProjects[1]([makeProject(1)]);
		mockCurrentSlug[1]("proj-1");
		mockThreadsByProject[1]({ "proj-1": sevenThreads });
		mockLoaded[1]({ "proj-1": true });

		const view = mount("/chat/proj-1");
		dispose = view.dispose;
		await settle();

		const row = view.container.querySelector<HTMLAnchorElement>("a[aria-expanded]") as HTMLElement;
		// The row carries the project's name and nothing else: no thread count beside the chevron.
		expect(row.querySelector(".truncate")?.textContent).toBe("Project 1");
		expect(row.querySelector(".tabular-nums")).toBeNull();
	});

	// The gesture reaching the row's menu is this card's work. Whether the popover then opens is
	// `kit/popover.tsx`, which hands out controls that go stale on re-render: see
	// 2026-10-07-popover-control-stale.md.
	it("sends a long press on a project row to its menu, at the finger", async () => {
		mockProjects[1]([makeProject(1), makeProject(2)]);
		mockCurrentSlug[1]("proj-1");
		mockThreadsByProject[1]({ "proj-1": [makeSession(1), makeSession(2)] });
		mockLoaded[1]({ "proj-1": true });

		const view = mount("/chat/proj-1");
		dispose = view.dispose;
		await settle();
		vi.useFakeTimers();

		const row = view.container
			.querySelector<HTMLElement>('.group\\/row a[href*="proj-2"]')
			?.closest(".group\\/row") as HTMLElement;
		expect(row).not.toBeNull();
		// The menu lives inside the actions container, which must stay mounted on touch: a menu in a
		// `display: none` parent can never open, and one behind `pointer-events: none` cannot be
		// tapped.
		const actions = row.querySelector<HTMLElement>(":scope > div > div") as HTMLElement;
		expect(actions.className).not.toContain("pointer-coarse:hidden");
		expect(actions.className).not.toContain("pointer-coarse:pointer-events-none");

		const opened = spyOnShowPopover();
		row.dispatchEvent(touchAt("touchstart", 20, 20));
		await vi.advanceTimersByTimeAsync(500);
		row.dispatchEvent(touchAt("touchend", 20, 20));
		await vi.advanceTimersByTimeAsync(1);
		flush();

		// The press reached the row's menu, and did not also open the project.
		expect(opened).toHaveBeenCalledTimes(1);
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("sends a long press on a thread row to its menu", async () => {
		mockProjects[1]([makeProject(1)]);
		mockCurrentSlug[1]("proj-1");
		mockThreadsByProject[1]({ "proj-1": [makeSession(1), makeSession(2)] });
		mockLoaded[1]({ "proj-1": true });

		const view = mount("/chat/proj-1");
		dispose = view.dispose;
		await settle();
		vi.useFakeTimers();

		const thread = view.container
			.querySelector<HTMLElement>('a[href*="t-2"]')
			?.closest(".group\\/row") as HTMLElement;
		expect(thread).not.toBeNull();
		const opened = spyOnShowPopover();
		thread.dispatchEvent(touchAt("touchstart", 20, 20));
		await vi.advanceTimersByTimeAsync(500);
		thread.dispatchEvent(touchAt("touchend", 20, 20));
		await vi.advanceTimersByTimeAsync(1);
		flush();

		expect(opened).toHaveBeenCalledTimes(1);
	});

	it("decouples collapse toggle from navigation: clicking chevron toggles open without navigating", async () => {
		const projects: Project[] = [makeProject(1), makeProject(2)];
		mockProjects[1](projects);
		mockCurrentSlug[1]("proj-1");

		const view = mount("/chat/proj-1");
		dispose = view.dispose;
		await settle();

		// Initially proj-1 is open because it is currentSlug
		const proj2Link = view.container.querySelector('a[href*="proj-2"]');
		expect(proj2Link).not.toBeNull();
		expect(proj2Link?.getAttribute("aria-expanded")).toBe("false");

		// Find the collapse toggle button for proj-2
		const proj2CollapseBtn = view.container.querySelector<HTMLButtonElement>(
			'button[aria-label="Expand Project 2"]',
		);
		expect(proj2CollapseBtn).not.toBeNull();

		// Click the collapse button
		proj2CollapseBtn?.click();
		await settle();

		// Proj-2 should now be expanded without navigating
		expect(proj2Link?.getAttribute("aria-expanded")).toBe("true");
		expect(mockNavigate).not.toHaveBeenCalled();

		// Click the collapse button again to close
		const proj2CloseBtn = view.container.querySelector<HTMLButtonElement>(
			'button[aria-label="Collapse Project 2"]',
		);
		expect(proj2CloseBtn).not.toBeNull();
		proj2CloseBtn?.click();
		await settle();

		expect(proj2Link?.getAttribute("aria-expanded")).toBe("false");
		expect(mockNavigate).not.toHaveBeenCalled();

		// Now click the project link itself: it SHOULD navigate
		(proj2Link as HTMLElement)?.click();
		await settle();

		expect(mockNavigate).toHaveBeenCalledWith("/chat/proj-2");
	});
});
