import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiClient } from "@/lib/api-client";

import { authService } from "../services/auth.service";
import type { AuthSession } from "../types/auth.types";
import { AuthProvider, useAuth } from "./auth-context";

let auth: ReturnType<typeof useAuth>;
let dispose: (() => void) | undefined;
let container: HTMLElement;
const session = (accessToken = "old"): AuthSession => ({
	accessToken,
	accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
	user: { id: "1", email: "test@example.com", username: "test" },
});
function Probe() {
	auth = useAuth();
	return <span>{auth.token()}</span>;
}
async function mount() {
	dispose = render(
		() => (
			<AuthProvider>
				<Probe />
			</AuthProvider>
		),
		container,
	);
	flush();
	await vi.advanceTimersByTimeAsync(0);
	flush();
}

beforeEach(() => {
	vi.useFakeTimers();
	container = document.createElement("div");
	document.body.append(container);
});
afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("session keepalive", () => {
	it("renews 60 seconds before expiry and keeps a 20-minute session usable", async () => {
		const refresh = vi
			.spyOn(authService, "refresh")
			.mockImplementation(async () => session("fresh"));
		await mount();
		await vi.advanceTimersByTimeAsync(839_999);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(refresh).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(360_001);
		expect(auth.token()).toBe("fresh");
		expect(auth.ready()).toBe(true);
	});

	it("schedules after login and clears timers on logout", async () => {
		const refresh = vi
			.spyOn(authService, "refresh")
			.mockRejectedValue(new ApiError("No session", 401));
		vi.spyOn(authService, "login").mockResolvedValue(session());
		vi.spyOn(authService, "logout").mockResolvedValue();
		await mount();
		await auth.login({ email: "test@example.com", password: "password" });
		await vi.advanceTimersByTimeAsync(840_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		await auth.login({ email: "test@example.com", password: "password" });
		await auth.logout();
		await vi.advanceTimersByTimeAsync(900_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(auth.token()).toBeNull();
	});

	it("renews on visibility after background suspension", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockImplementation(async () => session());
		await mount();
		vi.setSystemTime(Date.now() + 900_000);
		vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it("shares one renewal across concurrent 401s and retries both requests", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockResolvedValueOnce(session());
		await mount();
		let finish!: (value: AuthSession) => void;
		refresh.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const fetch = vi.fn(async (_url: string, init: RequestInit) =>
			new Headers(init.headers).get("Authorization") === "Bearer fresh"
				? Response.json({ success: true, data: [] })
				: Response.json({ message: "Expired" }, { status: 401 }),
		);
		vi.stubGlobal("fetch", fetch);
		const first = apiClient.get("/projects", { accessToken: "old" });
		const second = apiClient.get("/projects", { accessToken: "old" });
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(2); // Startup plus one shared renewal.
		finish(session("fresh"));
		await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
		expect(fetch).toHaveBeenCalledTimes(4);
	});

	it("signs out on a refused refresh", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockResolvedValueOnce(session());
		await mount();
		refresh.mockRejectedValue(new ApiError("Session refused", 401));
		expect(await auth.renew()).toBeNull();
		expect(auth.token()).toBeNull();
		expect(auth.user()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps the session on network errors and retries later", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockResolvedValueOnce(session());
		await mount();
		refresh
			.mockRejectedValueOnce(new TypeError("Offline"))
			.mockImplementation(async () => session("fresh"));
		await vi.advanceTimersByTimeAsync(840_000);
		expect(auth.token()).toBe("old");
		await vi.advanceTimersByTimeAsync(30_000);
		expect(auth.token()).toBe("fresh");
	});

	it("does not restore a session when a refresh finishes after logout", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockResolvedValueOnce(session());
		vi.spyOn(authService, "logout").mockResolvedValue();
		await mount();
		let finish!: (value: AuthSession) => void;
		refresh.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const renewing = auth.renew();
		await auth.logout();
		finish(session("late"));
		expect(await renewing).toBeNull();
		expect(auth.token()).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("removes the timer and visibility listener on disposal", async () => {
		const refresh = vi.spyOn(authService, "refresh").mockResolvedValue(session());
		await mount();
		dispose?.();
		dispose = undefined;
		vi.setSystemTime(Date.now() + 900_000);
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(900_000);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("opening straight into a known account", () => {
	const known = { id: "1", email: "test@example.com", username: "test" };
	beforeEach(() => localStorage.setItem("grid.session.user", JSON.stringify(known)));
	afterEach(() => localStorage.clear());

	it("shows the account at once while the session is confirmed, then carries on", async () => {
		let answer: (value: AuthSession) => void = () => {};
		vi.spyOn(authService, "refresh").mockImplementation(
			() => new Promise((resolve) => (answer = resolve)),
		);
		await mount();
		expect(auth.restoring()).toBe(true);
		expect(auth.user()?.id).toBe("1");
		const waiting = auth.waitForToken();
		answer(session("fresh"));
		expect(await waiting).toBe("fresh");
		expect(auth.restoring()).toBe(false);
	});

	it("drops the account from the device when the session is over", async () => {
		vi.spyOn(authService, "refresh").mockRejectedValue(new ApiError("No session", 401));
		await mount();
		expect(auth.restoring()).toBe(false);
		expect(auth.user()).toBeNull();
		expect(await auth.waitForToken()).toBeNull();
		expect(localStorage.getItem("grid.session.user")).toBeNull();
	});

	it("stays in the kept Grid while offline, and connects once the API is back", async () => {
		const refresh = vi
			.spyOn(authService, "refresh")
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValue(session("back"));
		await mount();
		expect(auth.ready()).toBe(true);
		expect(auth.restoring()).toBe(true);
		const waiting = auth.waitForToken();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		expect(await waiting).toBe("back");
		expect(auth.restoring()).toBe(false);
	});
});
