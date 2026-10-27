import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import { ChatHub } from "./hub";
import { ChatStore } from "./store";
import { heldAgent, until } from "./test-agents";

const who = { userId: "me", workspace: "me" };
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const step of cleanup.splice(0)) step();
});

function setup() {
	const agent = heldAgent();
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(store, new Map([["hand", agent.provider]]), tmpdir());
	cleanup.push(() => hub.closeAll());
	const thread = (title: string, project = "alpha", workspace = who) => {
		const row = hub.create(workspace, { project, provider: "hand", cwd: tmpdir() });
		hub.rename(workspace.workspace, row.id, title);
		return row;
	};
	return { agent, store, hub, thread };
}

describe("full-text search (P)", () => {
	it("finds words by prefix with accents folded, best first, in the workspace only", () => {
		const { store, thread } = setup();
		const deploy = thread("Release");
		store.append(deploy.id, [
			{ type: "user", text: "Plan the deployment of the café service" },
			{ type: "message", text: "Deployment planned: blue/green, with a deploy checklist." },
		]);
		const other = thread("Docs");
		store.append(other.id, [{ type: "message", text: "Wrote the docs for deploy." }]);
		thread("Elsewhere", "alpha", { userId: "you", workspace: "you" });
		const found = store.searchText("me", ["deploy"]);
		expect(found.map((row) => row.id)).toEqual([deploy.id, other.id]);
		expect(found[0]?.hits).toBeGreaterThan(1);
		expect(found[0]?.passage.toLowerCase()).toContain("deploy");
		expect(store.searchText("me", ["cafe"]).map((row) => row.id)).toEqual([deploy.id]);
		expect(store.searchText("you", ["deploy"])).toEqual([]);
		// A title is found too, and words that would be FTS syntax are only words.
		expect(store.searchText("me", ["docs"]).map((row) => row.id)).toContain(other.id);
		expect(store.searchText("me", ['"NEAR(', "*"])).toEqual([]);
	});
	it("forgets a deleted thread and keeps a renamed one's new title", () => {
		const { store, hub, thread } = setup();
		const row = thread("Old name");
		store.append(row.id, [{ type: "message", text: "kangaroo" }]);
		hub.rename("me", row.id, "Marsupials");
		expect(store.searchText("me", ["marsupials"]).map((found) => found.id)).toEqual([row.id]);
		expect(store.searchText("me", ["old"])).toEqual([]);
		store.delete(row.id);
		expect(store.searchText("me", ["kangaroo"])).toEqual([]);
	});
	it("indexes threads that were there before search was", () => {
		const path = `${tmpdir()}/grid-search-${crypto.randomUUID()}.db`;
		const first = new ChatStore(path);
		const hub = new ChatHub(first, new Map([["hand", heldAgent().provider]]), tmpdir());
		const row = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		hub.closeAll();
		first.append(row.id, [{ type: "message", text: "wombat burrows" }]);
		(first as unknown as { db: { exec: (sql: string) => void } }).db.exec(
			"DELETE FROM search_fts; DELETE FROM search_meta;",
		);
		first.close();
		const again = new ChatStore(path);
		expect(again.searchText("me", ["wombat"]).map((found) => found.id)).toEqual([row.id]);
		again.close();
	});
});

describe("snooze (P)", () => {
	it("keeps until a time to come, at most 90 days, and wakes on null", () => {
		const { hub, thread } = setup();
		const row = thread("Later");
		expect(() => hub.snooze("me", row.id, new Date(Date.now() - 1000).toISOString())).toThrow();
		expect(() =>
			hub.snooze("me", row.id, new Date(Date.now() + 91 * 86_400_000).toISOString()),
		).toThrow();
		expect(() => hub.snooze("me", row.id, "soon")).toThrow();
		expect(() => hub.snooze("you", row.id, new Date(Date.now() + 60_000).toISOString())).toThrow();
		const snoozed = hub.snooze("me", row.id, new Date(Date.now() + 60_000).toISOString());
		expect(hub.isSnoozed(snoozed)).toBe(true);
		expect(hub.isSnoozed(snoozed, Date.now() + 120_000)).toBe(false);
		expect(hub.snooze("me", row.id, null).snoozedUntil).toBeNull();
	});
	it("wakes when the agent asks for approval, but not when it simply answers", async () => {
		const { agent, hub, store, thread } = setup();
		const row = thread("Quiet");
		hub.snooze("me", row.id, new Date(Date.now() + 3_600_000).toISOString());
		void hub.prompt("me", row.id, "Look around");
		await until(() => agent.seats.length === 1 && agent.prompts().length === 1);
		agent.seats[0]?.context.emit({ type: "message", text: "Looking" });
		await Bun.sleep(10);
		expect(store.get(row.id)?.snoozedUntil).not.toBeNull();
		agent.seats[0]?.context.emit({
			type: "approval",
			id: "a1",
			title: "Run tests",
			options: [{ id: "allow", label: "Allow", kind: "allow_once" }],
		} as never);
		await until(() => store.get(row.id)?.snoozedUntil === null);
		await agent.finishAll();
	});
});
