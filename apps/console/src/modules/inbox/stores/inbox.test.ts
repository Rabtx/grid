import { afterEach, describe, expect, it, vi } from "vitest";

import type { InboxItem, InboxView } from "../types/inbox.types";

/** Each call's answer, held until the test lets it go, so the order they settle in is the test's. */
type Held<T> = { resolve: (value: T) => void; promise: Promise<T> };
function hold<T>(): Held<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { resolve, promise };
}

const lists: Held<InboxView>[] = [];
const counts: Held<{ unread: number }>[] = [];

vi.mock("../services/inbox.service", () => ({
	inboxService: {
		list: () => {
			const held = hold<InboxView>();
			lists.push(held);
			return held.promise;
		},
		unread: () => {
			const held = hold<{ unread: number }>();
			counts.push(held);
			return held.promise;
		},
		read: () => Promise.resolve({ changed: 1, unread: 0 }),
	},
}));

vi.mock("@/modules/environments", () => ({ placementsStore: { scopes: () => [""] } }));

const { inboxStore } = await import("./inbox");

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
	id: "turn_done:s1:x",
	kind: "turn_done",
	project: "grid",
	title: "Fix the login",
	body: "Finished",
	url: "/chat/grid/s1",
	createdAt: "2026-09-28T09:00:00.000Z",
	readAt: null,
	...over,
});

const view = (items: InboxItem[]): InboxView => ({
	items,
	unread: items.filter((row) => row.readAt === null).length,
	github: false,
});

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	lists.length = 0;
	counts.length = 0;
});

describe("inboxStore", () => {
	it("shows the newest read when an older one answers late", async () => {
		const first = inboxStore.load("token");
		const second = inboxStore.load("token", true);
		expect(lists).toHaveLength(2);
		lists[1]?.resolve(view([item({ id: "new", title: "Newest" })]));
		await second;
		lists[0]?.resolve(view([item({ id: "old", title: "Stale" })]));
		await first;
		expect(inboxStore.items().map((row) => row.id)).toEqual(["new"]);
		expect(inboxStore.loading()).toBe(false);
	});

	it("keeps a read made while the list was being read", async () => {
		const loading = inboxStore.load("token", true);
		const reading = inboxStore.readAll("token");
		lists[0]?.resolve(view([item()]));
		await loading;
		expect(inboxStore.items()[0]?.readAt).not.toBeNull();
		expect(inboxStore.unread()).toBe(0);
		counts.forEach((held) => held.resolve({ unread: 0 }));
		await reading;
	});

	it("does not let a count that set out before a list put back an older number", async () => {
		const counting = inboxStore.count("token");
		const loading = inboxStore.load("token", true);
		lists[0]?.resolve(view([item({ id: "a" }), item({ id: "b" })]));
		await loading;
		counts[0]?.resolve({ unread: 7 });
		await counting;
		await settle();
		expect(inboxStore.unread()).toBe(2);
	});
});
