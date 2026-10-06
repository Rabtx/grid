import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service";
const json = () => Response.json({ success: true, data: {} });
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
async function settle() {
	for (let n = 0; n < 8; n++) await Promise.resolve();
}
describe("refresh cookie mutation ordering", () => {
	it("finishes an earlier refresh before logout and a later login after logout", async () => {
		const starts: string[] = [];
		let finishRefresh!: (value: Response) => void;
		let finishLogout!: (value: Response) => void;
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) => {
				starts.push(url.split("/").pop()!);
				if (url.endsWith("/refresh"))
					return new Promise((resolve) => {
						finishRefresh = resolve;
					});
				if (url.endsWith("/logout"))
					return new Promise((resolve) => {
						finishLogout = resolve;
					});
				return Promise.resolve(json());
			}),
		);
		const refresh = authService.refresh();
		const logout = authService.logout();
		const login = authService.login({ email: "next@example.com", password: "secret" });
		await settle();
		expect(starts).toEqual(["refresh"]);
		finishRefresh(json());
		await refresh;
		await settle();
		expect(starts).toEqual(["refresh", "logout"]);
		finishLogout(new Response(null, { status: 204 }));
		await logout;
		await login;
		expect(starts).toEqual(["refresh", "logout", "login"]);
	});
	it("keeps the queue usable after an issuer fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockRejectedValueOnce(new TypeError("offline"))
				.mockResolvedValueOnce(new Response(null, { status: 204 })),
		);
		const refresh = authService.refresh();
		const logout = authService.logout();
		await expect(refresh).rejects.toThrow("offline");
		await expect(logout).resolves.toBeUndefined();
	});
	it("aborts a stalled issuer so queued logout can proceed", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string, init: RequestInit) => {
				if (url.endsWith("/refresh"))
					return new Promise((_, reject) => {
						init.signal!.addEventListener(
							"abort",
							() => reject(new DOMException("Timed out", "AbortError")),
							{ once: true },
						);
					});
				return Promise.resolve(new Response(null, { status: 204 }));
			}),
		);
		const refresh = authService.refresh();
		const failed = expect(refresh).rejects.toMatchObject({ name: "AbortError" });
		const logout = authService.logout();
		await settle();
		await vi.advanceTimersByTimeAsync(30_000);
		await failed;
		await expect(logout).resolves.toBeUndefined();
	});

	it("sends the captured session bearer as logout proof without attempting renewal", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetch);
		await authService.logout("captured");
		expect(new Headers(fetch.mock.calls[0][1].headers).get("Authorization")).toBe(
			"Bearer captured",
		);
	});
});
