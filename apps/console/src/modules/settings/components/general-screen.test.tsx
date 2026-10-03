import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";

import { GeneralScreen } from "./general-screen";

const refresh = vi.fn();
vi.mock("@/modules/auth", () => ({
	useAuth: () => ({ token: () => "token", user: () => ({ id: "me" }) }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({
			slug: "rabtx",
			name: "RabtX",
			color: null,
			logoUrl: null,
			role: "owner",
			settings: { defaultBranch: "main", logRetentionDays: 90 },
		}),
		refresh,
	}),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	offeredProviders: <T,>(list: T[]) => list,
	providersStore: {
		load: vi.fn(async () => {}),
		providers: () => [
			{ id: "claude", name: "Claude Code", available: true, models: [], modes: [] },
		],
	},
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: {
		data: vi.fn(),
		update: vi.fn(),
		backUp: vi.fn(),
		exportFile: vi.fn(),
		uploadLogo: vi.fn(),
		members: vi.fn(async () => []),
		setRole: vi.fn(),
		remove: vi.fn(),
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const buttonWith = (text: string) =>
	[...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === text);

describe("GeneralScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		vi.mocked(workspacesService.data).mockResolvedValue({
			host: "rabtx-studio",
			database: { version: "Postgres 16.15", sizeBytes: 2.4 * 1024 ** 3, healthy: true },
			backups: {
				available: true,
				hour: 3,
				last: {
					file: "grid-x.dump",
					at: new Date(Date.now() - 9 * 3_600_000).toISOString(),
					sizeBytes: 1,
				},
				count: 1,
			},
		});
		vi.mocked(workspacesService.update).mockResolvedValue({} as never);
		vi.mocked(workspacesService.backUp).mockResolvedValue({
			file: "grid-y.dump",
			at: new Date().toISOString(),
			sizeBytes: 2048,
		});
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/general", component: GeneralScreen }],
			history: memoryHistory("/settings/general"),
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

	it("shows the workspace, its defaults and where its data lives", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("RabtX");
		expect(text).toContain("self-hosted on rabtx-studio");
		expect(text).toContain("Postgres 16.15 · 2.4 GB on rabtx-studio");
		expect(text).toContain("Healthy");
		expect(text).toContain("Nightly at 3:00 AM · last one 9 hours ago");
		expect(text).toContain("90 days");
		expect(text).toContain("Danger zone");
	});

	it("backs up now, keeps logs longer, and deletes only once the name is typed", async () => {
		await settle();
		buttonWith("Back up now")?.click();
		await settle();
		expect(workspacesService.backUp).toHaveBeenCalledWith("token", "rabtx");
		document.querySelector<HTMLButtonElement>('button[aria-label="Keep run logs"]')?.click();
		await settle();
		buttonWith("1 year")?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenCalledWith("token", "rabtx", {
			settings: { logRetentionDays: 365 },
		});
		expect(refresh).toHaveBeenCalled();
		buttonWith("Delete workspace")?.click();
		await settle();
		const confirm = [...document.querySelectorAll("button")].filter(
			(button) => button.textContent?.trim() === "Delete workspace",
		);
		expect(confirm.at(-1)?.disabled).toBe(true);
		const typed = document.querySelector<HTMLInputElement>("dialog[open] input");
		if (typed) {
			typed.value = "RabtX";
			typed.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		expect(confirm.at(-1)?.disabled).toBe(false);
	});
});
