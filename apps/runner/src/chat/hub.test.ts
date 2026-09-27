import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatError, ChatHub } from "./hub";
import { ChatStore } from "./store";

const root = mkdtempSync(join(tmpdir(), "grid-hub-"));
mkdirSync(join(root, "shop"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function fakeProvider(): { provider: Provider; asked: () => number } {
	let asked = 0;
	const provider: Provider = {
		info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
		catalog: async () => {
			asked++;
			return { models: [{ id: `m${asked}`, name: `Model ${asked}` }] };
		},
		start: async () => {
			throw new Error("not used");
		},
	};
	return { provider, asked: () => asked };
}

describe("ChatHub providers", () => {
	it("asks an agent for its models once, keeps them, and asks again on refresh", async () => {
		const { provider, asked } = fakeProvider();
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), root);

		const first = await hub.providerList("u1");
		const second = await hub.providerList("u1");
		expect(asked()).toBe(1);
		expect(second[0].models.map((model) => model.id)).toEqual(["m1"]);
		expect(first[0].refreshedAt).not.toBeNull();

		const fresh = await hub.refreshProvider("u1", "fake");
		expect(asked()).toBe(2);
		expect(fresh.models.map((model) => model.id)).toEqual(["m2"]);
		expect((await hub.providerList("u1"))[0].models[0].id).toBe("m2");
	});

	it("keeps each person's settings per agent", async () => {
		const { provider } = fakeProvider();
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), root);
		hub.setProviderSettings("u1", "fake", { enabled: false, model: "m1" });
		expect((await hub.providerList("u1"))[0].settings).toEqual({ enabled: false, model: "m1" });
		expect((await hub.providerList("u2"))[0].settings).toEqual({});
		expect(() => hub.setProviderSettings("u1", "nope", {})).toThrow(ChatError);
	});
});

describe("ChatHub project folders", () => {
	it("refuses a linked folder outside the projects directory", () => {
		const outside = mkdtempSync(join(tmpdir(), "grid-hub-outside-"));
		try {
			const hub = new ChatHub(new ChatStore(":memory:"), new Map(), root);
			expect(() => hub.linkProjectFolder("u1", "outside", outside)).toThrow(
				"outside the projects directory",
			);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("works in the project's folder, and refuses to guess when there is none", () => {
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map(), root);
		expect(hub.defaultCwd("u1", "shop")).toBe(join(root, "shop"));
		store.setProjectFolder("u1", "grid", root);
		expect(hub.defaultCwd("u1", "grid")).toBe(root);
		expect(() => hub.defaultCwd("u1", "platform")).toThrow("Choose this project's folder first");
	});
});

describe("ChatHub running threads", () => {
	it("lists only this person's threads with a turn in flight", async () => {
		let finish: () => void = () => undefined;
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			start: async () => ({
				prompt: () =>
					new Promise((resolve) => {
						finish = () => resolve({ reason: "done" });
					}),
				cancel: () => undefined,
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			}),
		};
		const store = new ChatStore(":memory:");
		const hub = new ChatHub(store, new Map([["fake", provider]]), root);
		const mine = hub.create(
			{ userId: "u1", workspace: "u1" },
			{ project: "shop", provider: "fake" },
		);
		hub.create({ userId: "u2", workspace: "u2" }, { project: "shop", provider: "fake" });
		const turn = hub.prompt("u1", mine.id, "go");
		await Bun.sleep(5);
		expect(hub.running("u1")).toEqual([{ id: mine.id, project: "shop" }]);
		expect(hub.running("u2")).toEqual([]);
		finish();
		await turn;
		expect(hub.running("u1")).toEqual([]);
		hub.closeAll();
	});
});
