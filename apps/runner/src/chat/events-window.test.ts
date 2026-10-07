import { Database } from "bun:sqlite";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";

const dir = mkdtempSync(join(tmpdir(), "grid-events-window-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const turn = (n: number, ...middle: ChatEvent[]): ChatEvent[] => [
	{ type: "turn_start", at: `2026-10-07T00:00:0${n}Z` },
	{ type: "reasoning", text: `answer ${n}` },
	...middle,
	{ type: "turn_end", reason: "done", at: `2026-10-07T00:00:0${n}Z` },
];

function thread(path: string) {
	const store = new ChatStore(path);
	const hub = new ChatHub(store, new Map(), tmpdir());
	const session = store.create({
		id: crypto.randomUUID(),
		ownerId: "me",
		workspaceId: "w",
		project: "alpha",
		provider: "echo",
		title: "A thread",
		cwd: tmpdir(),
		model: null,
		mode: null,
		effort: null,
		worktree: null,
	});
	return { store, hub, id: session.id };
}

describe("reading only a thread's latest turn", () => {
	it("gives the events from the last one of a kind on, the same as slicing the whole thread", () => {
		const { store, id } = thread(":memory:");
		expect(store.eventsFromLast(id, "turn_start")).toEqual([]);
		store.append(id, [{ type: "reasoning", text: "before any turn" }]);
		// No turn yet: everything, as before.
		expect(store.eventsFromLast(id, "turn_start")).toEqual(store.events(id));
		store.append(id, [
			...turn(1),
			...turn(2),
			{ type: "turn_start" },
			{ type: "reasoning", text: "now" },
		]);
		const all = store.events(id);
		expect(store.eventsFromLast(id, "turn_start")).toEqual(
			all.slice(all.findLastIndex((event) => event.type === "turn_start")),
		);
		expect(store.eventsFromLast(id, "turn_end")).toEqual(
			all.slice(all.findLastIndex((event) => event.type === "turn_end")),
		);
	});

	it("finds a turn that began more than a page of events ago", () => {
		const { store, id } = thread(":memory:");
		const long: ChatEvent[] = Array.from({ length: 250 }, (_, n) => ({
			type: "reasoning",
			text: `step ${n}`,
		}));
		store.append(id, [...turn(1), { type: "turn_start" }, ...long]);
		const latest = store.eventsFromLast(id, "turn_start");
		expect(latest).toHaveLength(251);
		expect(latest[0]).toEqual({ type: "turn_start" });
	});

	it("never reads the turns before it", () => {
		const path = join(dir, "chat.db");
		const { store, hub, id } = thread(path);
		store.append(id, [...turn(1), ...turn(2)]);
		// Spoil the first turn: reading it now would throw.
		const raw = new Database(path);
		raw.run("UPDATE events SET data = 'not json' WHERE session_id = ? AND seq <= 2", [id]);
		raw.close();
		expect(() => store.events(id)).toThrow();
		const latest = store.eventsFromLast(id, "turn_start");
		expect(latest.map((event) => event.type)).toEqual(["turn_start", "reasoning", "turn_end"]);
		const [run] = hub.activity("w", "alpha");
		expect(run?.startedAt).toBe("2026-10-07T00:00:02Z");
		expect(run?.result).toBe("done");
	});
});
