import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UpdateStatus } from "../services/machine.service";
import { GridVersion } from "./grid-version";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
const status: UpdateStatus = {
	available: true,
	reason: null,
	current: { commit: "abc1234", subject: "fix: something" },
	behind: null,
	last: null,
};
vi.mock("../services/machine.service", () => ({
	machineService: {
		updateStatus: vi.fn(async () => status),
		checkForUpdate: vi.fn(async () => ({ ...status, behind: 2 })),
		updateGrid: vi.fn(async () => ({
			...status,
			last: {
				state: "running",
				step: "building",
				startedAt: "",
				finishedAt: "",
				from: "abc1234",
				to: "def5678",
				message: "",
			},
		})),
	},
}));
const { machineService } = await import("../services/machine.service");

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
	flush();
}

function mount(admin: boolean) {
	const root = document.createElement("div");
	document.body.append(root);
	const dispose = render(() => <GridVersion admin={admin} />, root);
	return { root, cleanup: () => (dispose(), root.remove()) };
}
const button = (root: HTMLElement, text: string) =>
	[...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("GridVersion", () => {
	afterEach(() => vi.clearAllMocks());

	it("lets an admin check for updates and update after confirming", async () => {
		const { root, cleanup } = mount(true);
		await settle();
		expect(root.textContent).toContain("Running abc1234");
		button(root, "Check for updates")?.click();
		await settle();
		expect(root.textContent).toContain("2 new changes on main");
		button(root, "Update")?.click();
		await settle();
		expect(machineService.updateGrid).not.toHaveBeenCalled();
		[...document.querySelectorAll("dialog button")]
			.find((b) => b.textContent?.trim() === "Update and restart")
			?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await settle();
		expect(machineService.updateGrid).toHaveBeenCalledWith("token");
		expect(root.textContent).toContain("Building");
		cleanup();
	});

	it("shows a member the version but no way to update", async () => {
		const { root, cleanup } = mount(false);
		await settle();
		expect(root.textContent).toContain("Running abc1234");
		expect(button(root, "Check for updates")).toBeUndefined();
		expect(button(root, "Update")).toBeUndefined();
		cleanup();
	});

	it("says why a machine cannot update itself", async () => {
		vi.mocked(machineService.updateStatus).mockResolvedValueOnce({
			...status,
			available: false,
			reason: "Grid is not running as a systemd service on this machine",
		});
		const { root, cleanup } = mount(true);
		await settle();
		expect(root.textContent).toContain("not running as a systemd service");
		expect(button(root, "Update")).toBeUndefined();
		cleanup();
	});
});
