import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";

import { AgentsScreen } from "./agents-screen";

const refresh = vi.fn();
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/workspaces", () => ({
	useTerminalAccess: () => () => true,
	useWorkspaces: () => ({
		current: () => ({
			slug: "rabtx",
			name: "RabtX",
			role: "owner",
			settings: { defaultAgent: "claude", agentPolicy: { rules: { push: "never" } } },
		}),
		refresh,
	}),
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: { update: vi.fn(async () => ({})) },
}));
vi.mock("@/modules/environments", () => ({
	environmentsStore: { environments: () => [], labelOf: () => null, load: vi.fn() },
	MachinePicker: () => null,
	scopeFor: () => "",
}));
vi.mock("@/modules/environments/services/machine.service", () => ({
	machineService: {
		addAgent: vi.fn(async () => ({ id: "gemini", name: "Gemini" })),
		removeAgent: vi.fn(),
	},
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	providersStore: {
		reload: vi.fn(async () => {}),
		error: () => null,
		providers: () => [
			{
				id: "claude",
				name: "Claude Code",
				available: true,
				version: "v2.1.4",
				models: [{ id: "opus", name: "Opus 5.5" }],
				modes: [],
				setup: {
					canInstall: false,
					canSignIn: true,
					signInOptional: false,
					signedIn: true,
					docs: null,
				},
			},
			{
				id: "antigravity",
				name: "Antigravity",
				available: false,
				models: [],
				modes: [],
				setup: {
					canInstall: true,
					canSignIn: false,
					signInOptional: false,
					signedIn: null,
					docs: null,
				},
			},
		],
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("AgentsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/agents", component: AgentsScreen }],
			history: memoryHistory("/settings/agents"),
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

	it("lists agents with version, default model, status and install", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("v2.1.4 · default model Opus 5.5");
		expect(text).toContain("Default");
		expect(text).toContain("Connected");
		expect(text).toContain("Not installed on this machine");
		expect(text).toContain("Install");
		expect(text).toContain("Add ACP agent");
	});
	it("saves what agents may do on their own and the safety switches", async () => {
		await settle();
		const push = container.querySelector("fieldset legend")?.closest("fieldset");
		expect(push).toBeTruthy();
		const allow = [...container.querySelectorAll("fieldset")]
			.find(
				(fieldset) =>
					fieldset.textContent?.includes("Allow") &&
					fieldset.querySelector("legend")?.textContent === "Run commands",
			)
			?.querySelector<HTMLButtonElement>("button");
		allow?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenCalledWith("token", "rabtx", {
			settings: { agentPolicy: { rules: { commands: "allow" } } },
		});
		container
			.querySelector<HTMLButtonElement>('button[aria-label="Work on a new branch"]')
			?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenCalledWith("token", "rabtx", {
			settings: { agentPolicy: { newBranch: true } },
		});
		expect(refresh).toHaveBeenCalled();
	});
});
