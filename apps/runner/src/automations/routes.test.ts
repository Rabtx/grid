import { describe, expect, test } from "bun:test";

import type { ChatHub } from "../chat/hub";
import { InboxStore } from "../inbox/store";
import { automationRequest, optionsOf } from "./routes";
import { Automations } from "./service";
import { AutomationStore, DEFAULT_OPTIONS, type AutomationInput } from "./store";

const body: AutomationInput = {
	name: "Check",
	prompt: "Check the project",
	provider: "claude",
	model: "opus",
	effort: "high",
	mode: null,
	project: "grid",
	workspaceMode: "folder",
	enabled: true,
	triggers: [{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "UTC" }],
};
const alice = { userId: "alice", workspace: "alpha" };

function harness() {
	const store = new AutomationStore(":memory:");
	const chat = {
		projectFolders: () => ({ grid: "/tmp/grid" }),
		providerList: async () => [
			{
				id: "claude",
				available: true,
				models: [{ id: "opus", efforts: [{ id: "high" }] }],
				modes: [],
			},
		],
	} as unknown as ChatHub;
	const service = new Automations(store, chat, new InboxStore(":memory:"));
	const call = (method: string, path: string, who = alice, data?: unknown, github = true) => {
		const url = new URL(path, "http://localhost:4910");
		return automationRequest(
			new Request(url.toString(), { method, ...(data ? { body: JSON.stringify(data) } : {}) }),
			url,
			who,
			service,
			chat,
			github,
		);
	};
	return { store, service, call };
}

describe("automation routes", () => {
	test("workspace isolation and owner-only edits", async () => {
		const { service, call } = harness();
		const created = await call("POST", "/automations", alice, body);
		expect(created.status).toBe(201);
		const item = ((await created.json()) as { data: { id: string } }).data;
		expect(
			(
				(await (
					await call("GET", "/automations", { userId: "bob", workspace: "beta" })
				).json()) as { data: unknown[] }
			).data,
		).toEqual([]);
		expect(
			(await call("GET", `/automations/${item.id}`, { userId: "bob", workspace: "beta" })).status,
		).toBe(404);
		expect(
			(await call("PUT", `/automations/${item.id}`, { userId: "bob", workspace: "alpha" }, body))
				.status,
		).toBe(403);
		expect(
			(await call("DELETE", `/automations/${item.id}`, { userId: "bob", workspace: "alpha" }))
				.status,
		).toBe(403);
		expect(
			(await call("POST", `/automations/${item.id}/run`, { userId: "bob", workspace: "alpha" }))
				.status,
		).toBe(403);
		service.stop();
	});
	test("rejects invalid fields and GitHub triggers without connection", async () => {
		const { service, call } = harness();
		expect((await call("POST", "/automations", alice, { ...body, prompt: "" })).status).toBe(400);
		expect((await call("POST", "/automations", alice, { ...body, project: "other" })).status).toBe(
			400,
		);
		expect((await call("POST", "/automations", alice, { ...body, model: "unknown" })).status).toBe(
			400,
		);
		expect(
			(
				await call(
					"POST",
					"/automations",
					alice,
					{ ...body, triggers: [{ kind: "event", event: "pull_opened" }] },
					false,
				)
			).status,
		).toBe(400);
		expect((await call("PATCH", "/automations")).status).toBe(405);
		expect((await call("POST", "/automations/templates")).status).toBe(405);
		service.stop();
	});
	test("bounds request body and returns at most 50 history rows", async () => {
		const { store, service, call } = harness();
		expect(
			(await call("POST", "/automations", alice, { ...body, prompt: "x".repeat(33_000) })).status,
		).toBe(413);
		const item = store.create("alpha", "alice", body);
		for (let index = 0; index < 60; index++) store.start(item.id, "manual", null, null);
		expect(
			((await (await call("GET", `/automations/${item.id}/runs`)).json()) as { data: unknown[] })
				.data,
		).toHaveLength(50);
		service.stop();
	});
});

describe("automation options", () => {
	test("missing options are the defaults and valid ones pass through", () => {
		expect(optionsOf(undefined)).toEqual(DEFAULT_OPTIONS);
		expect(
			optionsOf({
				role: "reviewer",
				branch: "release/1.2",
				pullRequest: true,
				waitForReview: true,
				minutes: 19.6,
				budgetUsd: 2,
				offLimits: [" migrations/ ", ".env"],
				icon: "shield",
			}),
		).toEqual({
			role: "reviewer",
			branch: "release/1.2",
			pullRequest: true,
			waitForReview: true,
			minutes: 20,
			budgetUsd: 2,
			offLimits: ["migrations/", ".env"],
			icon: "shield",
		});
	});
	test("waiting for review needs a pull request, and bad values are refused", () => {
		expect(optionsOf({ waitForReview: true }).waitForReview).toBe(false);
		for (const bad of [
			[],
			{ branch: "../main" },
			{ branch: "-x" },
			{ role: "a b" },
			{ minutes: 0 },
			{ minutes: 2000 },
			{ budgetUsd: "5" },
			{ offLimits: "migrations" },
			{ offLimits: Array.from({ length: 21 }, (_, i) => `p${i}`) },
			{ icon: "Shield!" },
		])
			expect(() => optionsOf(bad)).toThrow();
	});
});
