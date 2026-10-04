import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";
import { workspacesService } from "@/modules/workspaces/services/workspaces.service";

import { RolesScreen } from "./roles-screen";

const role = vi.hoisted(() => ({ value: "owner" }));
const refresh = vi.fn();
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({
		current: () => ({
			slug: "rabtx",
			name: "RabtX",
			role: role.value,
			settings: {
				rolePermissions: { member: { mergePulls: false } },
				customRoles: [{ id: "qa", name: "QA", permissions: { approveCommands: true } }],
			},
		}),
		refresh,
	}),
}));
vi.mock("@/modules/workspaces/services/workspaces.service", () => ({
	workspacesService: {
		update: vi.fn(async () => ({})),
		members: vi.fn(async () => [
			{ userId: "u1", username: "ana", displayName: "Ana", avatarUrl: null, role: "owner" },
			{ userId: "u2", username: "sam", displayName: "Sam", avatarUrl: null, role: "member" },
			{ userId: "u3", username: "kai", displayName: "Kai", avatarUrl: null, role: "member" },
			{
				userId: "u4",
				username: "lee",
				displayName: "Lee",
				avatarUrl: null,
				role: "member",
				customRole: "qa",
			},
		]),
	},
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

const cell = (container: HTMLElement, label: string) =>
	container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe("RolesScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
	});
	function mount() {
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/roles", component: RolesScreen }],
			history: memoryHistory("/settings/roles"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
	}
	afterEach(() => {
		dispose();
		container.remove();
		document.body.innerHTML = "";
		vi.clearAllMocks();
		role.value = "owner";
	});

	it("lists the roles with who holds each, the workspace's own included", async () => {
		mount();
		await settle();
		const text = container.textContent ?? "";
		for (const name of ["Owner", "Admin", "Member", "Viewer", "QA"]) expect(text).toContain(name);
		expect(text).toContain("1 person");
		expect(text).toContain("2 people");
		expect(text).toContain("No one");
		expect(text).toContain("Follow tasks, notes and runs. Can't change anything");
	});

	it("shows what each role can do, and saves a changed cell for that role alone", async () => {
		mount();
		await settle();
		const merge = cell(container, "Member: Merge pull requests");
		expect(merge?.getAttribute("aria-checked")).toBe("false");
		expect(cell(container, "Admin: Merge pull requests")?.getAttribute("aria-checked")).toBe(
			"true",
		);
		// The owner's column is fixed: no buttons there.
		expect(cell(container, "Owner: Merge pull requests")).toBeNull();
		merge?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenCalledWith("token", "rabtx", {
			settings: { rolePermissions: { member: { mergePulls: true } } },
		});
		expect(cell(container, "Member: Merge pull requests")?.getAttribute("aria-checked")).toBe(
			"true",
		);
		cell(container, "QA: Start agents")?.click();
		await settle();
		expect(workspacesService.update).toHaveBeenLastCalledWith("token", "rabtx", {
			settings: {
				customRoles: [
					{ id: "qa", name: "QA", permissions: { approveCommands: true, startAgents: true } },
				],
			},
		});
	});

	it("adds a role starting from a member's permissions", async () => {
		mount();
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent?.trim() === "New role")
			?.click();
		await settle();
		const name = document.querySelector<HTMLInputElement>('input[placeholder="Contractor"]');
		if (name) {
			name.value = "Contractor";
			name.dispatchEvent(new Event("input", { bubbles: true }));
		}
		await settle();
		[...document.querySelectorAll("button")]
			.find((button) => button.textContent?.trim() === "Add role")
			?.click();
		await settle();
		const call = vi.mocked(workspacesService.update).mock.calls.at(-1);
		expect(call).toBeDefined();
		const roles = (
			(call as unknown[])[2] as { settings: { customRoles: { id: string; permissions: object }[] } }
		).settings.customRoles;
		expect(roles.map((item) => item.id)).toEqual(["qa", "contractor"]);
		expect(roles[1]?.permissions).toMatchObject({ startAgents: true, machines: false });
	});

	it("lets members look but not change anything", async () => {
		role.value = "member";
		mount();
		await settle();
		expect(cell(container, "Admin: Invite people")).toBeNull();
		expect(container.textContent).toContain("Only owners and admins change these.");
		expect(
			[...container.querySelectorAll("button")].some((b) => b.textContent?.trim() === "New role"),
		).toBe(false);
	});
});
