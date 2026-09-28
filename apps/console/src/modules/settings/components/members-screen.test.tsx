import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspacesService } from "@/modules/workspaces/services/workspaces.service";
import type { Member, WorkspaceRole } from "@/modules/workspaces/types/workspace.types";

import { MembersScreen } from "./members-screen";

let role: WorkspaceRole = "owner";
vi.mock("@/modules/auth", () => ({
	useAuth: () => ({ token: () => "token", user: () => ({ id: "me", username: "demo" }) }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ slug: "demo", name: "Demo", role }) }),
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: {
		members: vi.fn(),
		invites: vi.fn(),
		setRole: vi.fn(),
		removeMember: vi.fn(),
		createInvite: vi.fn(),
		revokeInvite: vi.fn(),
	},
}));

const person = (over: Partial<Member>): Member => ({
	userId: "u2",
	username: "sam",
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
		dispose = render(() => <Router>{(route) => route.children}</Router>, container);
	}

	it("shows owners the people, the pending invites and a way to invite", async () => {
		mount();
		await settle();
		expect(container.textContent).toContain("Demo (you)");
		expect(container.textContent).toContain("Sam Lee");
		expect(container.textContent).toContain("Invite link");
		expect(buttonWith("Invite")).toBeTruthy();
	});

	it("shows a plain member the people only", async () => {
		role = "member";
		mount();
		await settle();
		expect(container.textContent).toContain("Sam Lee");
		expect(container.textContent).not.toContain("Pending invites");
		expect(workspacesService.invites).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Owners and admins invite people");
	});

	it("changes someone's role from their sheet", async () => {
		vi.mocked(workspacesService.setRole).mockResolvedValue(person({ role: "admin" }));
		mount();
		await settle();
		buttonWith("Sam Lee")?.click();
		await settle();
		document.querySelector<HTMLInputElement>('input[type="radio"][value="admin"]')?.click();
		await settle();
		buttonWith("Save role")?.click();
		await settle();
		expect(workspacesService.setRole).toHaveBeenCalledWith("token", "demo", "u2", "admin");
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
		[...document.querySelectorAll("button")].find((b) => b.textContent === "Invite")?.click();
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
