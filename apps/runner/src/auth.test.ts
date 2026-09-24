import { describe, expect, it } from "bun:test";

import { createTokenVerifier } from "./auth";

function api(status: number, body: unknown) {
	const calls: { url: string; auth: string | null }[] = [];
	const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: input.toString(), auth: new Headers(init?.headers).get("authorization") });
		return new Response(JSON.stringify(body), { status });
	}) as typeof fetch;
	return { calls, fetcher };
}

describe("createTokenVerifier", () => {
	it("asks the API who the token belongs to, and trusts the answer for a while", async () => {
		const { calls, fetcher } = api(200, { data: { id: "user-1" } });
		const verify = createTokenVerifier("http://api.test", fetcher);
		expect(await verify("t1")).toBe("user-1");
		expect(await verify("t1")).toBe("user-1");
		expect(calls).toEqual([{ url: "http://api.test/api/v1/auth/me", auth: "Bearer t1" }]);
	});

	it("rejects a token the API does not accept", async () => {
		const verify = createTokenVerifier("http://api.test", api(401, { message: "no" }).fetcher);
		expect(await verify("expired")).toBeNull();
	});

	it("rejects when the API is unreachable", async () => {
		const verify = createTokenVerifier("http://api.test", (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch);
		expect(await verify("t1")).toBeNull();
	});
});
