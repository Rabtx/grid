import { describe, expect, it } from "bun:test";

import { InboxStore, type InboxDraft } from "./store";

const draft = (over: Partial<InboxDraft> = {}): InboxDraft => ({
	id: "turn_done:s1:2026-09-28T09:00:00.000Z",
	workspaceId: "acme",
	kind: "turn_done",
	project: "grid",
	title: "Fix the login",
	body: "Finished — tap to see what it did.",
	url: "/chat/grid/s1",
	createdAt: "2026-09-28T09:00:00.000Z",
	...over,
});

describe("InboxStore", () => {
	it("keeps one row per event, newest first, and counts what is unread", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.keep(
			draft({ id: "approval:s1:a1", kind: "approval", createdAt: "2026-09-28T10:00:00.000Z" }),
		);
		// The same event heard twice is still one row, and an agent that restates it is not a new one.
		store.keep(draft({ title: "Fix the login (again)" }));
		const { items, unread } = store.list("acme");
		expect(items.map((item) => item.kind)).toEqual(["approval", "turn_done"]);
		expect(unread).toBe(2);
		expect(store.list("acme").items[1]?.title).toBe("Fix the login (again)");
		store.close();
	});

	it("keeps each workspace to itself", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.keep(draft({ id: "turn_done:s2:x", workspaceId: "other" }));
		expect(store.list("acme").unread).toBe(1);
		expect(store.unread("other")).toBe(1);
		expect(store.list("nobody").items).toEqual([]);
		store.close();
	});

	it("marks one item read, or all of them, and says how many it changed", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.keep(draft({ id: "pull_review:grid:12", kind: "pull_review", project: "grid" }));
		expect(store.read("acme", "pull_review:grid:12")).toBe(1);
		// Asking again about the same item is not a failure and changes nothing.
		expect(store.read("acme", "pull_review:grid:12")).toBe(0);
		expect(store.unread("acme")).toBe(1);
		// Another workspace's items are not this one's to clear.
		expect(store.read("other")).toBe(0);
		expect(store.read("acme")).toBe(1);
		expect(store.unread("acme")).toBe(0);
		expect(store.read("acme")).toBe(0);
		store.close();
	});

	it("marks read everything pointing at a page, and nothing else", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.keep(draft({ id: "turn_error:s1:later", kind: "turn_error" }));
		store.keep(
			draft({
				id: "pull_checks:grid:12",
				kind: "pull_checks",
				url: "/pulls/grid?pr=12",
				project: "grid",
			}),
		);
		expect(store.readAt("acme", "/chat/grid/s1")).toBe(2);
		// A page stands for its own pull requests, query and all.
		expect(store.readAt("acme", "/pulls/grid")).toBe(1);
		expect(store.unread("acme")).toBe(0);
		// Nothing left, so a whole-workspace read changes nothing.
		expect(store.readAt("acme")).toBe(0);
		store.close();
	});

	it("does not read a page that is only the start of another one's path", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft({ url: "/pulls/grid-api?pr=3", project: "grid-api" }));
		expect(store.readAt("acme", "/pulls/grid")).toBe(0);
		expect(store.unread("acme")).toBe(1);
		store.close();
	});

	it("lists two items from the same moment in a fixed order, not at random", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft({ id: "pull_checks:grid:12", kind: "pull_checks" }));
		store.keep(draft({ id: "pull_review:grid:12", kind: "pull_review" }));
		expect(store.list("acme").items.map((item) => item.id)).toEqual([
			"pull_review:grid:12",
			"pull_checks:grid:12",
		]);
		store.close();
	});

	it("forgets what a refresh no longer sees, and only its own kinds", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.keep(draft({ id: "pull_review:grid:12", kind: "pull_review" }));
		store.keep(draft({ id: "pull_checks:grid:12", kind: "pull_checks" }));
		// The pull request merged, so only the check row is still there to keep.
		expect(
			store.forgetMissing("acme", "grid", ["pull_review", "pull_checks"], ["pull_checks:grid:12"]),
		).toBe(1);
		expect(store.list("acme").items.map((item) => item.id)).toEqual([
			"turn_done:s1:2026-09-28T09:00:00.000Z",
			"pull_checks:grid:12",
		]);
		// A refresh that saw nothing at all clears its kinds, but the finished turn still happened.
		expect(store.forgetMissing("acme", "grid", ["pull_review", "pull_checks"], [])).toBe(1);
		expect(store.list("acme").items.map((item) => item.id)).toEqual([
			"turn_done:s1:2026-09-28T09:00:00.000Z",
		]);
		// A read item is history, not something waiting: a refresh leaves it be.
		store.read("acme");
		expect(store.forgetMissing("acme", "grid", ["turn_done"], [])).toBe(0);
		store.close();
	});

	it("keeps read items for a month, then lets them go", () => {
		const store = new InboxStore(":memory:");
		store.keep(draft());
		store.read("acme");
		expect(store.list("acme", 60_000).unread).toBe(0);
		expect(store.list("acme", 0).items).toEqual([]);
		store.close();
	});
});
