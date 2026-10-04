import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { machineService } from "../services/machine.service";
import { MachineBadge } from "./machine-badge";

const up = vi.hoisted(() => ({ value: true }));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ token: () => "token" }) }));
vi.mock("@/lib/runner-health", () => ({ runnerUp: () => up.value }));
vi.mock("../services/machine.service", () => ({ machineService: { status: vi.fn() } }));

async function settle() {
	for (let index = 0; index < 6; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("MachineBadge", () => {
	let dispose = () => {};
	afterEach(() => {
		dispose();
		document.body.innerHTML = "";
		up.value = true;
	});

	it("names this machine and says it is online, linking to Machines", async () => {
		vi.mocked(machineService.status).mockResolvedValue({
			info: { hostname: "rabtx-studio" },
		} as Awaited<ReturnType<typeof machineService.status>>);
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(() => <MachineBadge />, container);
		await settle();
		const link = container.querySelector("a");
		expect(link?.textContent).toBe("rabtx-studio · online");
		expect(link?.getAttribute("href")).toContain("/settings/machines");
	});

	it("says the machine is offline when its runner does not answer", async () => {
		up.value = false;
		const container = document.createElement("div");
		document.body.append(container);
		dispose = render(() => <MachineBadge />, container);
		await settle();
		expect(container.textContent).toBe("This machine · offline");
		expect(machineService.status).not.toHaveBeenCalled();
	});
});
