import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { machineService } from "../services/machine.service";
import { StoredThreadsPanel } from "./stored-threads-panel";

vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("../services/machine.service", () => ({
	machineService: { storedMachines: vi.fn(), restoreMachine: vi.fn() },
}));

const laptop = {
	id: "old-laptop-1",
	name: "maya-laptop",
	threads: 3,
	lastSyncedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
};

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("StoredThreadsPanel", () => {
	let dispose: (() => void) | undefined;
	afterEach(() => {
		dispose?.();
		document.body.innerHTML = "";
		vi.clearAllMocks();
	});
	const mount = async (admin: boolean) => {
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(() => <StoredThreadsPanel admin={admin} />, container);
		await settle();
		return container;
	};

	it("lists a gone machine's threads and restores them after asking", async () => {
		vi.mocked(machineService.storedMachines).mockResolvedValue([laptop]);
		vi.mocked(machineService.restoreMachine).mockResolvedValue({ imported: 3, total: 3 });
		await mount(true);
		expect(document.body.textContent).toContain("Restore threads");
		expect(document.body.textContent).toContain("maya-laptop");
		expect(document.body.textContent).toContain("3 threads ·");

		const restore = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Restore",
		);
		restore?.click();
		await settle();
		expect(document.body.textContent).toContain("Restore threads from maya-laptop?");
		const buttons = [...document.querySelectorAll("button")].filter(
			(b) => b.textContent === "Restore",
		);
		buttons.at(-1)?.click();
		await settle();
		expect(machineService.restoreMachine).toHaveBeenCalledWith("token", "old-laptop-1");
		expect(machineService.storedMachines).toHaveBeenCalledTimes(2);
	});

	it("shows nothing to people who do not manage machines, or when there is nothing to restore", async () => {
		vi.mocked(machineService.storedMachines).mockResolvedValue([laptop]);
		await mount(false);
		expect(machineService.storedMachines).not.toHaveBeenCalled();
		expect(document.body.textContent).not.toContain("Restore threads");
		dispose?.();

		vi.mocked(machineService.storedMachines).mockRejectedValue(new Error("not kept"));
		await mount(true);
		expect(document.body.textContent).not.toContain("Restore threads");
	});
});
