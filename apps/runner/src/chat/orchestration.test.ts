import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent, Choice } from "../agents/events";
import type {
	AgentCapabilities,
	AgentContext,
	AgentSession,
	Provider,
	TurnResult,
} from "../agents/provider";
import { CONTINUE_PROMPT, ChatHub } from "./hub";
import { ChatStore } from "./store";

/**
 * An agent the test drives: each turn waits for the test (or `reply`) to end it. Every start's
 * context and every prompt is kept, and its session ids follow what a real agent does: the same
 * id when it resumes, a new one when it starts afresh or forks.
 */
function agent(
	id: string,
	options: {
		steer?: boolean;
		capabilities?: Partial<AgentCapabilities>;
		modes?: Choice[];
		defaultMode?: string;
		/** What a resume comes back as (see `AgentSession.resumed`). */
		resumed?: (context: AgentContext) => boolean | undefined;
		/** Ends a turn as soon as it is sent, saying `text`; return null to leave it going. */
		reply?: (text: string, context: AgentContext) => TurnResult | null;
		/** A stop the agent never acts on. */
		deaf?: boolean;
	} = {},
) {
	const starts: AgentContext[] = [];
	const prompts: string[] = [];
	let finish: ((result: TurnResult) => void) | null = null;
	let closed = 0;
	let made = 0;
	const provider: Provider = {
		info: () => ({
			id,
			name: id.toUpperCase(),
			available: true,
			models: [],
			modes: options.modes ?? [],
			...(options.defaultMode ? { defaultMode: options.defaultMode } : {}),
			...(options.capabilities ? { capabilities: options.capabilities } : {}),
		}),
		start: async (context) => {
			starts.push(context);
			const token = context.resume && !context.fork ? context.resume : `${id}-${++made}`;
			context.onResumeToken(token);
			const resumed = context.resume ? options.resumed?.(context) : undefined;
			const session: AgentSession = {
				...(resumed !== undefined ? { resumed } : {}),
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						prompts.push(text);
						finish = resolve;
						const now = options.reply?.(text, context);
						if (now) {
							finish = null;
							queueMicrotask(() => resolve(now));
						}
					}),
				cancel: () => {
					if (options.deaf) return;
					finish?.({ reason: "cancelled" });
					finish = null;
				},
				approve: () => undefined,
				answer: (questionId, answers) =>
					context.emit({ type: "question_answered", id: questionId, answers }),
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => {
					closed++;
					finish?.({ reason: "error", error: "The agent exited (code 143)." });
					finish = null;
				},
			};
			if (options.steer) session.steer = async () => finish !== null;
			return session;
		},
	};
	return {
		provider,
		starts,
		prompts,
		closed: () => closed,
		say: (text: string) => starts.at(-1)?.emit({ type: "message", text }),
		emit: (event: ChatEvent) => starts.at(-1)?.emit(event),
		end: async (result: TurnResult = { reason: "done" }) => {
			const done = finish;
			finish = null;
			done?.(result);
			await Bun.sleep(30);
		},
	};
}

const who = { userId: "me", workspace: "me" };
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const step of cleanup.splice(0)) step();
});

function hubWith(...agents: ReturnType<typeof agent>[]) {
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(
		store,
		new Map(agents.map((item) => [item.provider.info().id, item.provider])),
		tmpdir(),
	);
	cleanup.push(() => hub.closeAll());
	return { store, hub };
}

async function until(check: () => boolean, ms = 2_000): Promise<void> {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out waiting");
		await Bun.sleep(5);
	}
}

const ofType = <T extends ChatEvent["type"]>(events: ChatEvent[], type: T) =>
	events.filter((event): event is Extract<ChatEvent, { type: T }> => event.type === type);

describe("steering an agent that cannot take a message mid-turn (A)", () => {
	it("stops the turn and starts the next with the message, told it was stopped for it", async () => {
		const slow = agent("slow");
		const { store, hub } = hubWith(slow);
		const thread = hub.create(who, { project: "p", provider: "slow", cwd: tmpdir() });
		void hub.prompt("me", thread.id, "Refactor the parser");
		await until(() => slow.prompts.length === 1);
		await hub.prompt("me", thread.id, "Keep the old API", [], "steer");
		await until(() => slow.prompts.length === 2);
		const events = store.events(thread.id);
		const ends = ofType(events, "turn_end");
		expect(ends[0]).toMatchObject({ reason: "cancelled", restarted: true });
		const users = ofType(events, "user");
		expect(users[1]).toMatchObject({ text: "Keep the old API", steered: true });
		expect(slow.prompts[1]).toContain("your turn was stopped so you could read it");
		expect(slow.prompts[1]).toContain("Keep the old API");
		await slow.end();
		// A plain stop is not a restart.
		void hub.prompt("me", thread.id, "Next");
		await until(() => slow.prompts.length === 3);
		await hub.stopRunning("me", thread.id);
		await until(() => ofType(store.events(thread.id), "turn_end").length === 3);
		expect(ofType(store.events(thread.id), "turn_end")[2]).not.toHaveProperty("restarted");
	});

	it("ends an agent that does not stop in time, and counts its turn as stopped", async () => {
		const deaf = agent("deaf", { deaf: true });
		const { store, hub } = hubWith(deaf);
		hub.stopGraceMs = 20;
		const thread = hub.create(who, { project: "p", provider: "deaf", cwd: tmpdir() });
		void hub.prompt("me", thread.id, "Work");
		await until(() => deaf.prompts.length === 1);
		await hub.stopRunning("me", thread.id);
		await until(() => !hub.isRunning(thread.id));
		expect(deaf.closed()).toBe(1);
		expect(ofType(store.events(thread.id), "turn_end")[0]?.reason).toBe("cancelled");
		// The next message starts a new process, which resumes the conversation.
		void hub.prompt("me", thread.id, "Again");
		await until(() => deaf.starts.length === 2);
		expect(deaf.starts[1]?.resume).toBe("deaf-1");
	});
});

describe("sending safely more than once (B)", () => {
	it("takes a send once however many times its request id arrives", async () => {
		const quick = agent("quick", { reply: () => ({ reason: "done" }) });
		const { store, hub } = hubWith(quick);
		const thread = hub.create(who, { project: "p", provider: "quick", cwd: tmpdir() });
		await hub.prompt("me", thread.id, "Hello", [], "send", { requestId: "r-1" });
		await hub.prompt("me", thread.id, "Hello", [], "send", { requestId: "r-1" });
		expect(ofType(store.events(thread.id), "user")).toHaveLength(1);
		await hub.prompt("me", thread.id, "Hello", [], "send", { requestId: "r-2" });
		expect(ofType(store.events(thread.id), "user")).toHaveLength(2);
		await expect(
			hub.prompt("me", thread.id, "x", [], "send", { requestId: "not ok!" }),
		).rejects.toThrow("request id");
	});

	it("keeps the turn going on in the store until it ends", async () => {
		const slow = agent("slow");
		const { store, hub } = hubWith(slow);
		const thread = hub.create(who, { project: "p", provider: "slow", cwd: tmpdir() });
		void hub.prompt("me", thread.id, "Go");
		await until(() => slow.prompts.length === 1);
		expect(store.activeTurn(thread.id)).toMatchObject({ turn: 1, continuations: 0 });
		await slow.end();
		expect(store.activeTurn(thread.id)).toBeNull();
	});
});

describe("carrying turns on after a restart (C)", () => {
	/** A thread whose turn was going when the runner stopped, as the store keeps it. */
	function cutOff(store: ChatStore, hub: ChatHub, provider: string, extra: ChatEvent[] = []) {
		const thread = hub.create(who, { project: "p", provider, cwd: tmpdir() });
		store.update(thread.id, { resumeToken: `${provider}-old` });
		store.append(thread.id, [
			{ type: "user", id: "u1", text: "Build the page" },
			{ type: "turn_start", at: new Date().toISOString() },
			{ type: "message", text: "Half of it" },
			...extra,
		]);
		const at = new Date().toISOString();
		store.setActiveTurn(thread.id, { turn: 1, startedAt: at, continuations: 0, chainSince: at });
		return thread;
	}

	it("closes the cut-off turn and carries it on as a turn from Grid, resuming the agent", async () => {
		const worker = agent("worker");
		const { store, hub } = hubWith(worker);
		const thread = cutOff(store, hub, "worker");
		store.setQueue(thread.id, { items: [{ id: "q1", text: "Then the footer" }], paused: true });
		// As after a restart: a new hub on the same store.
		const restarted = new ChatHub(store, new Map([["worker", worker.provider]]), tmpdir());
		cleanup.push(() => restarted.closeAll());
		expect(restarted.recover()).toEqual({ carried: [thread.id], held: [] });
		await until(() => worker.prompts.length === 1);
		const events = store.events(thread.id);
		expect(ofType(events, "turn_end")[0]).toMatchObject({ reason: "cancelled", continued: true });
		expect(ofType(events, "turn_end")[0]?.error).toContain("Grid carries the turn on below");
		expect(ofType(events, "user")[1]).toMatchObject({
			text: CONTINUE_PROMPT,
			origin: { kind: "grid", reason: "restart" },
		});
		expect(worker.starts[0]?.resume).toBe("worker-old");
		expect(store.activeTurn(thread.id)).toMatchObject({ continuations: 1 });
		// The held queue goes on after the carried-on turn.
		await worker.end();
		await until(() => worker.prompts.length === 2);
		expect(worker.prompts[1]).toContain("Then the footer");
	});

	it("leaves a turn that waited on the person, and gives up on a restart loop", async () => {
		const worker = agent("worker");
		const { store, hub } = hubWith(worker);
		const asking = cutOff(store, hub, "worker", [
			{
				type: "question",
				id: "q",
				questions: [{ id: "a", header: "A", question: "Which?", options: [] }],
			},
		]);
		const looping = cutOff(store, hub, "worker");
		const at = new Date().toISOString();
		store.setActiveTurn(looping.id, { turn: 1, startedAt: at, continuations: 3, chainSince: at });
		const result = hub.recover();
		expect(result.carried).toEqual([]);
		expect(result.held.sort()).toEqual([asking.id, looping.id].sort());
		expect(ofType(store.events(asking.id), "turn_end")[0]).toMatchObject({ reason: "error" });
		expect(ofType(store.events(asking.id), "turn_end")[0]?.error).toContain(
			"waiting on your answer",
		);
		expect(ofType(store.events(asking.id), "question_answered")).toHaveLength(1);
		expect(ofType(store.events(looping.id), "turn_end")[0]?.error).toContain("3 times");
		expect(worker.prompts).toHaveLength(0);
		expect(store.cutOff()).toEqual([]);
	});

	it("leaves the turn open when the runner stops, so the next start can carry it on", async () => {
		const slow = agent("slow");
		const { store, hub } = hubWith(slow);
		const thread = hub.create(who, { project: "p", provider: "slow", cwd: tmpdir() });
		void hub.prompt("me", thread.id, "Go");
		await until(() => slow.prompts.length === 1);
		hub.shutdown();
		await Bun.sleep(30);
		expect(store.activeTurn(thread.id)).not.toBeNull();
		expect(ofType(store.events(thread.id), "turn_end")).toHaveLength(0);
	});
});

describe("telling an agent the thread only when it does not remember it (D, E)", () => {
	it("tells the thread to an agent that could not resume its conversation", async () => {
		const forgetful = agent("forgetful", {
			resumed: () => false,
			reply: () => ({ reason: "done" }),
		});
		const { store, hub } = hubWith(forgetful);
		const thread = hub.create(who, { project: "p", provider: "forgetful", cwd: tmpdir() });
		await hub.prompt("me", thread.id, "First question");
		hub.closeAll();
		await hub.prompt("me", thread.id, "Second question");
		expect(forgetful.starts[1]?.resume).toBe("forgetful-1");
		expect(forgetful.prompts[1]).toContain("no memory of it");
		expect(forgetful.prompts[1]).toContain("Person: First question");
		// Told once: the same process is not told again.
		await hub.prompt("me", thread.id, "Third question");
		expect(forgetful.prompts[2]).not.toContain("no memory of it");
		expect(store.events(thread.id).length).toBeGreaterThan(0);
	});

	it("starts afresh and tells the thread when the agent no longer has its conversation", async () => {
		let lost = true;
		const claude = agent("claude", {
			reply: (_text, context) => {
				if (context.resume && lost) {
					lost = false;
					return { reason: "error", error: "No conversation found with session ID: abc" };
				}
				return { reason: "done" };
			},
		});
		const { store, hub } = hubWith(claude);
		const thread = hub.create(who, { project: "p", provider: "claude", cwd: tmpdir() });
		await hub.prompt("me", thread.id, "Earlier work");
		hub.closeAll();
		await hub.prompt("me", thread.id, "Carry on");
		expect(claude.starts).toHaveLength(3);
		expect(claude.starts[2]?.resume).toBeUndefined();
		expect(claude.prompts[2]).toContain("Person: Earlier work");
		const ends = ofType(store.events(thread.id), "turn_end");
		expect(ends.map((end) => end.reason)).toEqual(["done", "done"]);
	});
});

describe("forks (F)", () => {
	it("branches the agent's own conversation when it can, and tells the thread when it cannot", async () => {
		const native = agent("native", {
			capabilities: { fork: true, resume: true },
			reply: () => ({ reason: "done" }),
		});
		const plain = agent("plain", { reply: () => ({ reason: "done" }) });
		const { hub } = hubWith(native, plain);
		const source = hub.create(who, { project: "p", provider: "native", cwd: tmpdir() });
		await hub.prompt("me", source.id, "Design the schema");
		const fork = hub.fork(who, source.id, {});
		await hub.prompt("me", fork.id, "Try another layout");
		expect(native.starts[1]).toMatchObject({ resume: "native-1", fork: true });
		expect(native.prompts[1]).not.toContain("no memory of it");
		// Its next process continues the fork's own conversation, not the source's.
		hub.closeAll();
		await hub.prompt("me", fork.id, "And again");
		expect(native.starts[2]?.resume).toBe("native-2");
		expect(native.starts[2]?.fork).toBeUndefined();

		const other = hub.create(who, { project: "p", provider: "plain", cwd: tmpdir() });
		await hub.prompt("me", other.id, "Plan it");
		const copy = hub.fork(who, other.id, {});
		await hub.prompt("me", copy.id, "Carry on");
		expect(plain.starts.at(-1)?.resume).toBeUndefined();
		expect(plain.prompts.at(-1)).toContain("Person: Plan it");
	});

	it("brings a fork's finished work back into its source as the next message", async () => {
		const quick = agent("quick", {
			reply: (text, context) => {
				if (text.includes("Try SQLite"))
					context.emit({ type: "message", text: "SQLite works with WAL." });
				return { reason: "done" };
			},
		});
		const { store, hub } = hubWith(quick);
		const source = hub.create(who, { project: "p", provider: "quick", cwd: tmpdir() });
		await hub.prompt("me", source.id, "Pick a database");
		const fork = hub.fork(who, source.id, {});
		await hub.prompt("me", fork.id, "Try SQLite");
		const merged = hub.mergeBack(who, fork.id);
		expect(merged).toMatchObject({ turns: 1, into: { id: source.id } });
		await until(() => ofType(store.events(source.id), "user").length === 2);
		const brought = ofType(store.events(source.id), "user")[1];
		expect(brought?.origin).toEqual({ kind: "merge", thread: { id: fork.id, title: fork.title } });
		expect(brought?.text).toContain("Person: Try SQLite");
		expect(brought?.text).toContain("The fork's agent: SQLite works with WAL.");
		expect(brought?.text).not.toContain("Person: Pick a database");
		expect(ofType(store.events(fork.id), "merged")[0]).toMatchObject({ turns: 1 });
		expect(() => hub.mergeBack(who, fork.id)).toThrow("Nothing new");
		expect(() => hub.mergeBack(who, source.id)).toThrow("not a fork");
	});
});

describe("handing a thread back to an agent it was with (E)", () => {
	it("resumes the agent's own conversation and tells it only the turns it missed", async () => {
		const first = agent("first", {
			capabilities: { resume: true },
			reply: () => ({ reason: "done" }),
		});
		const second = agent("second", {
			capabilities: { resume: true },
			reply: () => ({ reason: "done" }),
		});
		const { store, hub } = hubWith(first, second);
		const thread = hub.create(who, { project: "p", provider: "first", cwd: tmpdir() });
		await hub.prompt("me", thread.id, "Start the API");
		hub.handoff(who, thread.id, { provider: "second" });
		await hub.prompt("me", thread.id, "Add the tests");
		expect(second.prompts[0]).toContain("taking over this thread from FIRST");
		hub.handoff(who, thread.id, { provider: "first" });
		expect(ofType(store.events(thread.id), "handoff")[1]).toMatchObject({ resumes: { turns: 1 } });
		await hub.prompt("me", thread.id, "Ship it");
		expect(first.starts.at(-1)?.resume).toBe("first-1");
		const told = first.prompts.at(-1) ?? "";
		expect(told).toContain("This thread is back with you. SECOND worked on it after you");
		expect(told).toContain("Add the tests");
		expect(told).not.toContain("Start the API");
	});
});
