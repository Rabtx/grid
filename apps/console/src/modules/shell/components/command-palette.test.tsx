import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchService } from "@/modules/search/services/search.service";

import { ShellProvider, useShell } from "../context/shell-context";
import { CommandPalette } from "./command-palette";

vi.mock("@/modules/workspaces", async (original) => ({
	...(await original<Record<string, unknown>>()),
	useTerminalAccess: () => () => true,
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/projects", () => ({
	ProjectIcon: () => null,
	projectsService: { createNote: vi.fn(async () => ({})) },
	useWorkspace: () => ({
		currentProject: () => ({ slug: "grid", name: "Grid" }),
		projects: () => [{ slug: "grid", name: "Grid" }],
		setAddProjectOpen: vi.fn(),
	}),
}));
vi.mock("@/modules/search/services/search.service", () => ({
	searchService: { local: vi.fn(), work: vi.fn(), ask: vi.fn() },
}));

async function settle(rounds = 10) {
	for (let index = 0; index < rounds; index++) {
		await new Promise((resolve) => setTimeout(resolve, 20));
		flush();
	}
}

function type(value: string) {
	const field = document.querySelector<HTMLInputElement>("input[type=search]");
	if (!field) throw new Error("no field");
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
	return field;
}

describe("CommandPalette", () => {
	let container: HTMLElement;
	let dispose: () => void;
	let open: (mode?: "search" | "ask") => void = () => {};
	beforeEach(() => {
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		vi.mocked(searchService.local).mockResolvedValue({
			threads: [
				{
					id: "t1",
					project: "grid",
					provider: "claude",
					title: "Round job ETAs to 5 minutes",
					updatedAt: new Date().toISOString(),
					passage: "",
				},
			],
			files: [{ project: "grid", path: "src/jobs/eta.ts" }],
		});
		vi.mocked(searchService.work).mockResolvedValue({
			tasks: [
				{
					project: "grid",
					projectName: "Grid",
					number: 27,
					title: "Show ETA on the driver card",
					status: "in_progress",
					passage: null,
				},
			],
			notes: [],
		});
		vi.mocked(searchService.ask).mockResolvedValue({
			answer: "You picked LISTEN so jobs stay in Postgres [1].",
			cited: [1],
			followUps: ["What would Redis take?"],
			sources: [
				{
					n: 1,
					kind: "note",
					title: "Architecture decisions",
					meta: "Note · Aug 12",
					href: "/notes/grid/n1",
				},
				{ n: 2, kind: "thread", title: "Unrelated thread", meta: "Thread", href: "/chat/grid/t2" },
			],
			agent: "claude",
		});
		container = document.createElement("div");
		document.body.append(container);
		function Opener() {
			const shell = useShell();
			open = (mode = "search") => shell.setPaletteOpen(true, mode);
			return <CommandPalette />;
		}
		const Router = createRouter({
			routes: [{ path: "/*", component: Opener }],
			history: memoryHistory("/chat/grid"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	});
	afterEach(() => {
		dispose();
		document.body.innerHTML = "";
		vi.clearAllMocks();
	});

	it("finds threads, files, tasks and commands in groups, in the project you are in", async () => {
		await settle(2);
		open();
		await settle(2);
		type("eta");
		await settle();
		expect(searchService.local).toHaveBeenCalledWith("token", "eta", "grid");
		const text = document.body.textContent ?? "";
		for (const heading of ["Threads", "Files", "Tasks", "Commands"])
			expect(text).toContain(heading);
		expect(text).toContain("Round job ETAs to 5 minutes");
		expect(text).toContain("eta.ts");
		expect(text).toContain("Show ETA on the driver card");
		expect(text).toContain("Ask Grid about “eta”");
		expect(text).toContain("Searching Grid");
	});

	it("asks Grid and shows the answer with only the sources it cites", async () => {
		await settle(2);
		open("ask");
		await settle(2);
		const field = type("Why did we pick Postgres LISTEN?");
		field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await settle();
		expect(searchService.ask).toHaveBeenCalledWith("token", {
			question: "Why did we pick Postgres LISTEN?",
			project: "grid",
			history: [],
		});
		const text = document.body.textContent ?? "";
		expect(text).toContain("You picked LISTEN so jobs stay in Postgres");
		expect(text).toContain("Architecture decisions");
		expect(text).not.toContain("Unrelated thread");
		expect(text).toContain("from 1 source you can see");
		expect(text).toContain("What would Redis take?");
		expect(text).toContain("Save as note");
	});
});
