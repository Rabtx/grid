import { describe, expect, it } from "bun:test";

import { createTokenVerifier, type Who } from "./auth";

const WORKSPACES = [
	{ id: "ws-home", slug: "home", isDefault: true },
	{ id: "ws-acme", slug: "acme", isDefault: false },
];

function api(status: number) {
	const calls: { url: string; auth: string | null }[] = [];
	const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = input.toString();
		calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
		const body = url.endsWith("/auth/me") ? { data: { id: "user-1" } } : { data: WORKSPACES };
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
	return { calls, fetcher };
}

describe("createTokenVerifier", () => {
	it("asks the API who the token belongs to and their workspaces, and trusts it a while", async () => {
		const { calls, fetcher } = api(200);
		const verify = createTokenVerifier("http://api.test", fetcher);
		expect(await verify("t1")).toEqual({ who: { userId: "user-1", workspace: "ws-home" } });
		expect(await verify("t1", "acme")).toEqual({ who: { userId: "user-1", workspace: "ws-acme" } });
		expect(calls).toEqual([
			{ url: "http://api.test/api/v1/auth/me", auth: "Bearer t1" },
			{ url: "http://api.test/api/v1/workspaces", auth: "Bearer t1" },
		]);
	});

	it("refuses a workspace the person is not in", async () => {
		const verify = createTokenVerifier("http://api.test", api(200).fetcher);
		expect(await verify("t1", "elsewhere")).toEqual({
			status: 404,
			message: 'Workspace "elsewhere" not found',
		});
	});

	it("tells about requests in the default workspace", async () => {
		const seen: Who[] = [];
		const verify = createTokenVerifier("http://api.test", api(200).fetcher, (who) =>
			seen.push(who),
		);
		await verify("t1", "acme");
		await verify("t1");
		expect(seen).toEqual([{ userId: "user-1", workspace: "ws-home" }]);
	});

	it("rejects a token the API does not accept", async () => {
		const verify = createTokenVerifier("http://api.test", api(401).fetcher);
		expect(await verify("expired")).toMatchObject({ status: 401 });
	});

	it("rejects when the API is unreachable", async () => {
		const verify = createTokenVerifier("http://api.test", (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch);
		expect(await verify("t1")).toMatchObject({ status: 401 });
	});
});
