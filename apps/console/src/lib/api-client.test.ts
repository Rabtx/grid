import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, registerTokenRenewal } from "./api-client";

let unregister: (() => void) | undefined;
afterEach(() => {
	unregister?.();
	vi.unstubAllGlobals();
});

const denied = () => Response.json({ message: "Expired", code: "EXPIRED" }, { status: 401 });

describe("authenticated request renewal", () => {
	it("renews once and retries with the new token, preserving the request", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(denied())
			.mockResolvedValueOnce(Response.json({ success: true, data: { saved: true } }));
		vi.stubGlobal("fetch", fetch);
		const renew = vi.fn().mockResolvedValue("fresh");
		unregister = registerTokenRenewal(renew);
		expect(await apiClient.patch("/tasks/1", { title: "Updated" }, { accessToken: "old" })).toEqual(
			{ saved: true },
		);
		expect(renew).toHaveBeenCalledExactlyOnceWith("old");
		expect(fetch).toHaveBeenCalledTimes(2);
		const init = fetch.mock.calls[1][1] as RequestInit;
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fresh");
		expect(init).toMatchObject({
			method: "PATCH",
			body: '{"title":"Updated"}',
			credentials: "include",
		});
	});

	it("does not retry a retry or recurse for unauthenticated auth requests", async () => {
		const fetch = vi.fn().mockImplementation(async () => denied());
		vi.stubGlobal("fetch", fetch);
		const renew = vi.fn().mockResolvedValue("fresh");
		unregister = registerTokenRenewal(renew);
		await expect(apiClient.get("/projects", { accessToken: "old" })).rejects.toMatchObject({
			statusCode: 401,
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		await expect(apiClient.post("/auth/refresh")).rejects.toMatchObject({ statusCode: 401 });
		expect(renew).toHaveBeenCalledTimes(1);
	});

	it("preserves the original error when renewal fails", async () => {
		const fetch = vi.fn().mockResolvedValue(denied());
		vi.stubGlobal("fetch", fetch);
		unregister = registerTokenRenewal(vi.fn().mockResolvedValue(null));
		await expect(apiClient.get("/projects", { accessToken: "old" })).rejects.toMatchObject({
			message: "Expired",
			statusCode: 401,
			code: "EXPIRED",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
