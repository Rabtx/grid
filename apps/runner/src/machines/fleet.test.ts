import { describe, expect, it } from "bun:test";

import { MachineFleet } from "./fleet";

describe("MachineFleet", () => {
	it("reads addresses for the workspace the machine joined", async () => {
		const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
			expect(String(input)).toBe("http://api.test/api/v1/runner/fleet");
			expect(new Headers(init?.headers).get("authorization")).toBe("Runner grid-key");
			return Response.json({
				data: [
					{
						id: "m1",
						workspaceId: "ws-1",
						name: "Ada",
						address: "http://127.0.0.1:4301",
						kind: "managed",
						status: "online",
					},
					{
						id: "m2",
						workspaceId: "ws-2",
						name: "Other",
						address: "http://100.1.1.1:4100",
						kind: "byom",
						status: "online",
					},
				],
			});
		}) as typeof fetch;
		const fleet = new MachineFleet({ url: "http://api.test", key: "grid-key" }, fetcher);
		expect(await fleet.address("ws-1", "m1")).toBe("http://127.0.0.1:4301");
		expect(await fleet.address("ws-1", "m2")).toBeNull();
		expect(await fleet.address("ws-2", "m2")).toBe("http://100.1.1.1:4100");
	});
});
