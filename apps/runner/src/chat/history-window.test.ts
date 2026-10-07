import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent } from "../agents/events";
import { ChatHub, HISTORY_TURNS } from "./hub";
import { chatRequest } from "./routes";
import { ChatStore } from "./store";

/** A thread of `turns` exchanges: each a message, its turn and the reply. */
function thread(turns: number) {
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(store, new Map(), tmpdir());
	const { id } = store.create({
		id: crypto.randomUUID(),
		ownerId: "me",
		workspaceId: "w",
		project: "alpha",
		provider: "echo",
		title: "A long thread",
		cwd: tmpdir(),
		model: null,
		mode: null,
		effort: null,
		worktree: null,
	});
	const events: ChatEvent[] = [];
	for (let n = 1; n <= turns; n++)
		events.push(
			{ type: "user", text: `question ${n}` },
			{ type: "turn_start" },
			{ type: "message", text: `answer ${n}` },
			{ type: "turn_end", reason: "done" },
		);
	store.append(id, events);
	return { store, hub, id };
}

const questions = (events: ChatEvent[]) =>
	events.flatMap((event) => (event.type === "user" ? [event.text] : []));

describe("opening a long thread", () => {
	it("sends its latest messages, and pages of earlier ones that add up to the whole log", () => {
		const { store, hub, id } = thread(HISTORY_TURNS * 2 + 5);
		const attached = hub.attach("w", id, { event: () => {}, state: () => {} });
		expect(questions(attached.history)).toHaveLength(HISTORY_TURNS);
		expect(attached.history[0]).toEqual({ type: "user", text: "question 26" });
		expect(attached.earlier).not.toBeNull();

		let log = attached.history;
		let earlier = attached.earlier;
		const pages: number[] = [];
		while (earlier !== null) {
			const page = hub.earlierEvents("w", id, earlier);
			pages.push(questions(page.events).length);
			log = [...page.events, ...log];
			earlier = page.earlier;
		}
		expect(pages).toEqual([HISTORY_TURNS, 5]);
		expect(log).toEqual(store.events(id));
		attached.detach();
	});

	it("sends a short thread whole, with nothing earlier", () => {
		const { hub, id } = thread(3);
		const attached = hub.attach("w", id, { event: () => {}, state: () => {} });
		expect(questions(attached.history)).toEqual(["question 1", "question 2", "question 3"]);
		expect(attached.earlier).toBeNull();
	});

	it("answers earlier history over HTTP, to the thread's workspace only", async () => {
		const { hub, id } = thread(HISTORY_TURNS + 2);
		const { earlier } = hub.attach("w", id, { event: () => {}, state: () => {} });
		const ask = (workspace: string, before: unknown) => {
			const url = new URL(`http://runner/chat/sessions/${id}/events?before=${before}`);
			return chatRequest(new Request(url.href), url, { userId: "me", workspace }, hub);
		};
		const response = await ask("w", earlier);
		expect(response?.status).toBe(200);
		const body = (await response?.json()) as { data: { events: ChatEvent[]; earlier: null } };
		expect(questions(body.data.events)).toEqual(["question 1", "question 2"]);
		expect(body.data.earlier).toBeNull();
		expect((await ask("other", earlier))?.status).toBe(404);
		expect((await ask("w", "nope"))?.status).toBe(400);
	});
});
