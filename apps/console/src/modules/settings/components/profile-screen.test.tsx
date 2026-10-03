import { createRouter, memoryHistory } from "@solidjs/router";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShellProvider } from "@/modules/shell";

import { accountService, type Me, type PrefsAnswer } from "../services/account.service";
import { DEFAULT_TEST_PREFS } from "./settings-fixtures";
import { ProfileScreen } from "./profile-screen";

vi.mock("@/modules/auth", () => ({
	useAuth: () => ({ token: () => "token", user: () => ({ id: "u1" }), logout: vi.fn() }),
}));
vi.mock("@/modules/workspaces", () => ({
	useWorkspaces: () => ({ current: () => ({ slug: "rabtx", name: "RabtX", role: "owner" }) }),
}));
vi.mock("../services/account.service", () => ({
	accountService: {
		me: vi.fn(),
		security: vi.fn(),
		sessions: vi.fn(),
		prefs: vi.fn(),
		updatePrefs: vi.fn(),
		updateProfile: vi.fn(),
		revokeSession: vi.fn(),
	},
}));

const me: Me = {
	id: "u1",
	email: "shabir@rabtx.dev",
	username: "shabir",
	emailVerified: true,
	hasPassword: true,
	passwordChangedAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
	createdAt: "2026-01-01T00:00:00Z",
	profile: {
		displayName: "Shabir Khan",
		avatarUrl: null,
		bio: null,
		timezone: "Asia/Karachi",
		locale: null,
	},
};
const prefs = (git: Partial<PrefsAnswer["prefs"]["git"]> = {}): PrefsAnswer => ({
	prefs: { ...DEFAULT_TEST_PREFS, git: { ...DEFAULT_TEST_PREFS.git, ...git } },
	signingKey: {
		path: "/home/s/.ssh/id_ed25519.pub",
		type: "ed25519",
		addedAt: "2026-08-12T00:00:00Z",
	},
});

async function settle() {
	for (let index = 0; index < 8; index++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		flush();
	}
}

describe("ProfileScreen", () => {
	let container: HTMLElement;
	let dispose: () => void;
	beforeEach(() => {
		vi.mocked(accountService.me).mockResolvedValue(me);
		vi.mocked(accountService.security).mockResolvedValue({
			mfa: { totpEnabled: true, recoveryCodesRemaining: 8 },
			passkeys: [
				{
					id: "p1",
					name: "MacBook Pro",
					deviceType: "multiDevice",
					backedUp: true,
					lastUsedAt: null,
					createdAt: "",
				},
			],
		});
		vi.mocked(accountService.sessions).mockResolvedValue([
			{
				id: "s1",
				userAgent: "Mozilla/5.0 (Macintosh; Mac OS X) Chrome/140 Safari",
				ipAddress: null,
				createdAt: "",
				lastUsedAt: new Date().toISOString(),
				isCurrent: true,
			},
			{
				id: "s2",
				userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/140",
				ipAddress: "10.0.0.2",
				createdAt: "",
				lastUsedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
				isCurrent: false,
			},
		]);
		vi.mocked(accountService.prefs).mockResolvedValue(
			prefs({ name: "Shabir Khan", email: me.email }),
		);
		vi.mocked(accountService.updatePrefs).mockImplementation(async (_token, patch) =>
			prefs(patch.git),
		);
		vi.mocked(accountService.updateProfile).mockImplementation(async (_token, patch) => ({
			...me,
			profile: { ...me.profile, displayName: patch.displayName ?? me.profile.displayName },
		}));
		vi.mocked(accountService.revokeSession).mockResolvedValue({});
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/profile", component: ProfileScreen }],
			history: memoryHistory("/settings/profile"),
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

	it("shows who you are, who agents commit as, how you sign in and where", async () => {
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("Owner · shabir@rabtx.dev");
		expect(text).toContain("Verified");
		expect(text).toContain("Shabir Khan <shabir@rabtx.dev>");
		expect(text).toContain("SSH key · ed25519");
		expect(text).toContain("Changed 3 months ago");
		expect(text).toContain("MacBook Pro");
		expect(text).toContain("Chrome on Mac");
		expect(text).toContain("This device");
		expect(text).toContain("Firefox on Linux");
		// The runner already has the right name and email, so nothing is sent.
		expect(accountService.updatePrefs).not.toHaveBeenCalled();
	});
	it("saves a new name, and tells the runner who agents commit as", async () => {
		await settle();
		const name = container.querySelector<HTMLInputElement>('input[aria-label="Name"]');
		if (name) {
			name.value = "Shabir K.";
			name.dispatchEvent(new Event("change", { bubbles: true }));
		}
		await settle();
		expect(accountService.updateProfile).toHaveBeenCalledWith("token", {
			displayName: "Shabir K.",
		});
		expect(accountService.updatePrefs).toHaveBeenCalledWith("token", {
			git: { name: "Shabir K.", email: me.email },
		});
	});
	it("turns off crediting the agent, and signs out the other devices", async () => {
		await settle();
		container.querySelector<HTMLButtonElement>('button[aria-label="Credit the agent"]')?.click();
		await settle();
		expect(accountService.updatePrefs).toHaveBeenCalledWith("token", {
			git: { creditAgent: false },
		});
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Sign out others")
			?.click();
		await settle();
		expect(accountService.revokeSession).toHaveBeenCalledWith("token", "s2");
		expect(accountService.revokeSession).toHaveBeenCalledTimes(1);
		expect(container.textContent).not.toContain("Firefox on Linux");
	});
	it("on phones, opens each detail in a sheet", async () => {
		dispose();
		container.remove();
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		HTMLDialogElement.prototype.showModal = function () {
			this.setAttribute("open", "");
		};
		HTMLDialogElement.prototype.close = function () {
			this.removeAttribute("open");
		};
		container = document.createElement("div");
		document.body.append(container);
		const Router = createRouter({
			routes: [{ path: "/settings/profile", component: ProfileScreen }],
			history: memoryHistory("/settings/profile"),
		});
		dispose = render(
			() => <Router>{(route) => <ShellProvider>{route.children}</ShellProvider>}</Router>,
			container,
		);
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("@shabir");
		expect(text).toContain("Asia/Karachi");
		expect(text).toContain("2 devices");
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent?.startsWith("Sessions"))
			?.click();
		await settle();
		[...container.querySelectorAll("button")]
			.find((button) => button.textContent === "Sign out")
			?.click();
		await settle();
		expect(accountService.revokeSession).toHaveBeenCalledWith("token", "s2");
		vi.unstubAllGlobals();
	});
});
