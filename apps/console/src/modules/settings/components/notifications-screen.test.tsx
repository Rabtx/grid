import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { accountService, type PrefsPatch } from "../services/account.service";
import { DEFAULT_TEST_PREFS } from "./settings-fixtures";
import { NotificationsScreen } from "./notifications-screen";

vi.mock("@/modules/auth", () => ({
	useAuth: () => ({ token: () => "token", user: () => ({ email: "shabir@rabtx.dev" }) }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ slug: "rabtx", name: "RabtX", role: "owner" }) }),
}));
vi.mock("../services/push.service", () => ({
	pushSupport: async () => "ready",
	currentSubscription: async () => ({}),
	enablePush: vi.fn(),
	thisDeviceId: async () => "d1",
	sendTestPush: vi.fn(),
}));
vi.mock("../services/account.service", () => ({
	accountService: { prefs: vi.fn(), updatePrefs: vi.fn(), devices: vi.fn(), testDevice: vi.fn() },
}));

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("NotificationsScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(accountService.prefs).mockResolvedValue({
			prefs: DEFAULT_TEST_PREFS,
			signingKey: null,
		});
		vi.mocked(accountService.updatePrefs).mockImplementation(async (_token, patch: PrefsPatch) => ({
			prefs: {
				...DEFAULT_TEST_PREFS,
				notify: {
					...DEFAULT_TEST_PREFS.notify,
					quiet: { ...DEFAULT_TEST_PREFS.notify.quiet, ...patch.notify?.quiet },
				},
			},
			signingKey: null,
		}));
		vi.mocked(accountService.devices).mockResolvedValue([
			{ id: "d1", label: "Safari on iPhone", kind: "phone", createdAt: new Date().toISOString() },
		]);
		vi.mocked(accountService.testDevice).mockResolvedValue(undefined);
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/notifications", component: NotificationsScreen }],
			history: memoryHistory("/settings/notifications"),
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
	const switchNamed = (name: string) =>
		container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

	it("shows each kind of update by channel, quiet hours and the devices", async () => {
		await settle();
		const text = container.textContent ?? "";
		for (const word of [
			"Approvals",
			"Questions",
			"Runs",
			"Reviews",
			"Following",
			"Desktop",
			"Phone",
			"Email",
		])
			expect(text).toContain(word);
		expect(text).toContain(`10 PM – 8 AM · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
		expect(text).toContain("Safari on iPhone");
		expect(switchNamed("Runs on phone")?.getAttribute("aria-checked")).toBe("false");
		expect(switchNamed("Approvals on phone")?.getAttribute("aria-checked")).toBe("true");
	});
	it("saves a channel, turns quiet hours on in this zone, and tests a device", async () => {
		await settle();
		switchNamed("Runs on phone")?.click();
		await settle();
		expect(accountService.updatePrefs).toHaveBeenCalledWith("token", {
			notify: { channels: { runs: { phone: true } } },
		});
		switchNamed("Quiet hours")?.click();
		await settle();
		expect(accountService.updatePrefs).toHaveBeenLastCalledWith("token", {
			notify: { quiet: { on: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
		});
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Send test")
			?.click();
		await settle();
		expect(accountService.testDevice).toHaveBeenCalledWith("token", "d1");
	});
	it("on phones, lists each kind with where it reaches you and opens its channels", async () => {
		dispose();
		container.remove();
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/notifications", component: NotificationsScreen }],
			history: memoryHistory("/settings/notifications"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("Desktop · Phone · Email");
		expect(text).toContain("This phone");
		expect(text).toContain("Test notification");
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent?.startsWith("Runs"))
			?.click();
		await settle();
		document.querySelector<HTMLButtonElement>('button[aria-label="Phone for runs"]')?.click();
		await settle();
		expect(accountService.updatePrefs).toHaveBeenCalledWith("token", {
			notify: { channels: { runs: { phone: true } } },
		});
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Send")
			?.click();
		await settle();
		expect(accountService.testDevice).toHaveBeenCalledWith("token", "d1");
		vi.unstubAllGlobals();
	});
});
