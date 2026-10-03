import { createRouter, memoryHistory } from "@solidjs/router";
import { type JSX, render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider, useShell } from "@/modules/shell";

import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member, WorkspaceRole } from "@/modules/workspaces/types/workspace.types";

import { MembersScreen } from "./members-screen";

let role: WorkspaceRole = "owner";
vi.mock("@/modules/auth", () => ({
	useAuth: () => ({ token: () => "token", user: () => ({ id: "me", username: "demo" }) }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({
			slug: "demo",
			name: "Demo",
			role,
			settings: { agentAccess: { codex: "admins" } },
		}),
		refresh: vi.fn(),
	}),
}));
vi.mock("@/modules/chat/stores/providers", () => ({
	offeredProviders: <T,>(list: T[]) => list,
	providersStore: {
		load: vi.fn(async () => {}),
		providers: () => [
			{ id: "claude", name: "Claude Code", available: true, models: [], modes: [] },
			{ id: "codex", name: "Codex", available: true, models: [], modes: [] },
		],
	},
}));
vi.mock("@/lib/runner-client", () => ({
	runnerCall: vi.fn(async () => [{ provider: "claude", people: 2, roles: ["Engineer"] }]),
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: {
		members: vi.fn(),
		invites: vi.fn(),
		setRole: vi.fn(),
		removeMember: vi.fn(),
		createInvite: vi.fn(),
		revokeInvite: vi.fn(),
		resendInvite: vi.fn(),
		update: vi.fn(),
	},
}));

const person = (over: Partial<Member>): Member => ({
	userId: "u2",
	username: "sam",
	email: "sam@example.com",
	displayName: "Sam Lee",
	avatarUrl: null,
	role: "member",
	joinedAt: "2026-09-26T00:00:00Z",
	...over,
});

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const buttonWith = (text: string) =>
	[...document.querySelectorAll("button")].find((button) => button.textContent?.includes(text));

/** The top bar's actions, where the page puts its invite button. */
function ShellActions(): JSX.Element {
	const shell = useShell();
	return <div data-slot="actions">{shell.actions()?.()}</div>;
}

describe("MembersScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		vi.mocked(workspacesService.members).mockResolvedValue([
			person({ userId: "me", username: "demo", displayName: "Demo", role: "owner" }),
			person({}),
		]);
		vi.mocked(workspacesService.invites).mockResolvedValue([
			{
				id: "i1",
				email: null,
				role: "member",
				expiresAt: "2099-01-01T00:00:00Z",
				createdAt: "2026-09-28T00:00:00Z",
			},
		]);
	});
	afterEach(() => {
		dispose();
		container.remove();
		vi.clearAllMocks();
		role = "owner";
	});
	function mount() {
		const Router = createRouter({
			routes: [{ path: "/settings/members", component: MembersScreen }],
			history: memoryHistory("/settings/members"),
		});
		dispose = render(
			() => (
				<Router>
					{(route) => (
						<ShellProvider>
							<ShellActions />
							{route.children}
						</ShellProvider>
					)}
				</Router>
			),
			container,
		);
	}

	it("shows owners the invite card, the people with their emails, invites and agents", async () => {
		mount();
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("Send invite");
		expect(text).toContain("2 people · agents don't use seats");
		expect(text).toContain("Sam Lee");
		expect(text).toContain("sam@example.com");
		expect(text).toContain("Pending");
		expect(text).toContain("Engineer · used by 2 people");
		expect(text).toContain("Not used yet");
	});

	it("shows a plain member the people only", async () => {
		role = "member";
		mount();
		await settle();
		expect(container.textContent).toContain("Sam Lee");
		expect(container.textContent).not.toContain("Send invite");
		expect(container.textContent).toContain("Admins only");
		expect(workspacesService.invites).not.toHaveBeenCalled();
	});

	it("invites several people by email at once, with a role", async () => {
		vi.mocked(workspacesService.createInvite).mockResolvedValue({
			id: "i2",
			email: "a@x.dev",
			role: "member",
			expiresAt: "2099-01-01T00:00:00Z",
			createdAt: "2026-09-28T00:00:00Z",
			token: "abc",
			url: "http://grid/invite/abc",
		});
		mount();
		await settle();
		const field = container.querySelector<HTMLInputElement>('input[aria-label="Emails to invite"]');
		if (field) {
			field.value = "a@x.dev, b@x.dev";
			field.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		buttonWith("Send invite")?.click();
		await settle();
		expect(workspacesService.createInvite).toHaveBeenCalledWith("token", "demo", {
			email: "a@x.dev",
			role: "member",
		});
		expect(workspacesService.createInvite).toHaveBeenCalledWith("token", "demo", {
			email: "b@x.dev",
			role: "member",
		});
	});

	it("keeps an agent to admins from its row", async () => {
		vi.mocked(workspacesService.update).mockResolvedValue({} as never);
		mount();
		await settle();
		document
			.querySelector<HTMLButtonElement>('button[aria-label="Who can start Claude Code"]')
			?.click();
		await settle();
		buttonWith("Admins only")?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenCalledWith("token", "demo", {
			settings: { agentAccess: { claude: "admins" } },
		});
	});

	it("hands out an invite link on the console's own address", async () => {
		vi.mocked(workspacesService.createInvite).mockResolvedValue({
			id: "i2",
			email: null,
			role: "member",
			expiresAt: "2099-01-01T00:00:00Z",
			createdAt: "2026-09-28T00:00:00Z",
			token: "abc",
			url: "http://elsewhere:3000/invite/abc",
		});
		mount();
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Invite link")
			?.click();
		await settle();
		buttonWith("Create link")?.click();
		await settle();
		expect(workspacesService.createInvite).toHaveBeenCalledWith("token", "demo", {
			role: "member",
		});
		const link = document.querySelector<HTMLInputElement>('input[aria-label="Invite link"]');
		expect(link?.value).toBe(`${window.location.origin}/invite/abc`);
	});
});
