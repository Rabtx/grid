import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";
import { ChatHub } from "./hub";
import { chatToolsRequest } from "./routes";
import { ChatStore } from "./store";

/**
 * An agent the test drives by hand: each turn waits until the test ends it, and what it was
 * sent (prompts, steers, answers) is kept to look at.
 */
function handAgent(options: { steer?: boolean; edit?: (cwd: string, text: string) => void } = {}) {
	const prompts: string[] = [];
	const steers: string[] = [];
	const answers: { id: string; answers: Record<string, string[]> | null }[] = [];
	let finish: ((result: TurnResult) => void) | null = null;
	let context: AgentContext | null = null;
	let cancelled = 0;
	const provider: Provider = {
		info: () => ({ id: "hand", name: "Hand", available: true, models: [], modes: [] }),
		start: async (ctx) => {
			context = ctx;
			const session: AgentSession = {
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						prompts.push(text);
						options.edit?.(ctx.cwd, text);
						finish = resolve;
					}),
				cancel: () => {
					cancelled++;
					finish?.({ reason: "cancelled" });
					finish = null;
				},
				approve: () => undefined,
				answer: (id, given) => {
					answers.push({ id, answers: given });
					ctx.emit({ type: "question_answered", id, answers: given });
				},
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			};
			if (options.steer)
				session.steer = async (text) => {
					if (!finish) return false;
					steers.push(text);
					return true;
				};
			return session;
		},
	};
	return {
		provider,
		prompts,
		steers,
		answers,
		cancelled: () => cancelled,
		emit: (event: ChatEvent) => context?.emit(event),
		/** End the turn going on, and let the hub see to what follows. */
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

function setup(agent: ReturnType<typeof handAgent>, cwd = tmpdir()) {
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(store, new Map([["hand", agent.provider]]), tmpdir());
	const session = hub.create(who, { project: "alpha", provider: "hand", cwd });
	const seen: ChatEvent[] = [];
	hub.attach("me", session.id, { event: (event) => seen.push(event), state: () => undefined });
	return { hub, store, session, seen };
}

/** Wait for the hub to reach the agent (it opens the agent and takes a checkpoint first). */
async function settle(): Promise<void> {
	await Bun.sleep(40);
}

describe("queued messages", () => {
	it("waits while the agent works, then sends each in order", async () => {
		const agent = handAgent();
		const { hub, session, seen } = setup(agent);
		const first = hub.prompt("me", session.id, "one");
		await settle();
		await hub.prompt("me", session.id, "two");
		await hub.prompt("me", session.id, "three");
		const queued = seen.findLast((event) => event.type === "queue");
		expect(queued).toMatchObject({ paused: false });
		expect(queued?.type === "queue" && queued.items.map((item) => item.text)).toEqual([
			"two",
			"three",
		]);

		await agent.end();
		await first;
		await settle();
		expect(agent.prompts.at(-1)).toContain("two");
		await agent.end();
		await settle();
		expect(agent.prompts.at(-1)).toContain("three");
		await agent.end();
		expect(agent.prompts).toHaveLength(3);
	});

	it("holds the queue after a stop, until the person goes on", async () => {
		const agent = handAgent();
		const { hub, session, seen } = setup(agent);
		void hub.prompt("me", session.id, "one");
		await settle();
		await hub.prompt("me", session.id, "two");
		await agent.end({ reason: "cancelled" });
		expect(agent.prompts).toHaveLength(1);
		expect(seen.findLast((event) => event.type === "queue")).toMatchObject({ paused: true });

		await hub.queueAction("me", session.id, "resume");
		await settle();
		expect(agent.prompts.at(-1)).toContain("two");
		await agent.end();
	});

	it("drops a message from the queue, and keeps the queue across a restart, held", async () => {
		const agent = handAgent();
		const { hub, store, session } = setup(agent);
		void hub.prompt("me", session.id, "one");
		await settle();
		await hub.prompt("me", session.id, "two");
		await hub.prompt("me", session.id, "three");
		const two = store.queue(session.id).items[0];
		await hub.queueAction("me", session.id, "remove", two?.id);
		expect(store.queue(session.id).items.map((item) => item.text)).toEqual(["three"]);

		// Another runner over the same store: what waited is there, and waits for the person.
		const restarted = new ChatHub(store, new Map([["hand", handAgent().provider]]), tmpdir());
		const events: ChatEvent[] = [];
		restarted.attach("me", session.id, { event: (event) => events.push(event), state: () => {} });
		expect(events.find((event) => event.type === "queue")).toMatchObject({ paused: true });
		await agent.end();
	});
});

describe("steering", () => {
	it("goes into the turn going on when the agent can take it", async () => {
		const agent = handAgent({ steer: true });
		const { hub, session, store } = setup(agent);
		void hub.prompt("me", session.id, "build it");
		await settle();
		await hub.prompt("me", session.id, "use tabs", [], "steer");
		expect(agent.steers).toEqual(["use tabs"]);
		expect(store.events(session.id).some((event) => event.type === "steer")).toBe(true);
		await agent.end();
		expect(agent.prompts).toHaveLength(1);
	});

	it("stops an agent that cannot take it, and sends it next", async () => {
		const agent = handAgent();
		const { hub, session, store } = setup(agent);
		void hub.prompt("me", session.id, "build it");
		await settle();
		await hub.prompt("me", session.id, "no, the other way", [], "steer");
		expect(agent.cancelled()).toBe(1);
		await settle();
		expect(agent.prompts.at(-1)).toContain("no, the other way");
		// The stop was for the steer: the queue was not held.
		expect(store.queue(session.id).paused).toBe(false);
		await agent.end();
	});
});

describe("agent questions", () => {
	it("passes the answer to the agent and logs it", async () => {
		const agent = handAgent();
		const { hub, session, store } = setup(agent);
		void hub.prompt("me", session.id, "plan it");
		await settle();
		agent.emit({
			type: "question",
			id: "q1",
			questions: [
				{ id: "db", header: "Database", question: "Which one?", options: [{ label: "Postgres" }] },
			],
		});
		await hub.answerQuestion("me", session.id, "q1", { db: ["Postgres"] });
		expect(agent.answers).toEqual([{ id: "q1", answers: { db: ["Postgres"] } }]);
		expect(store.events(session.id).at(-1)).toEqual({
			type: "question_answered",
			id: "q1",
			answers: { db: ["Postgres"] },
		});
		await expect(hub.answerQuestion("me", session.id, "q1", null)).rejects.toThrow(
			"no longer waiting",
		);
		await agent.end();
	});
});

describe("inline visuals", () => {
	it("records a checked visual into the turn, and refuses a wrong key or a bad block", async () => {
		const agent = handAgent();
		const { hub, session, store } = setup(agent);
		hub.setGridTools(() => "http://runner");
		const key = (hub as unknown as { tools: { key: string } }).tools.key;
		const call = (args: unknown, header = key) =>
			chatToolsRequest(
				new Request("http://runner/chat/tools/visual", {
					method: "POST",
					headers: { "x-grid-tools-key": header },
					body: JSON.stringify({ thread: session.id, args }),
				}),
				new URL("http://runner/chat/tools/visual"),
				hub,
			);
		const blocks = [{ type: "stats", items: [{ label: "p95", value: "120 ms", tone: "accent" }] }];
		// Not while nothing is answering.
		expect((await call({ title: "Latency", blocks }))?.status).toBe(409);
		void hub.prompt("me", session.id, "how fast?");
		await settle();
		expect((await call({ title: "Latency", blocks }, "wrong"))?.status).toBe(401);
		const bad = await call({ title: "Latency", blocks: [{ type: "pie" }] });
		expect(bad?.status).toBe(400);
		expect(((await bad?.json()) as { message: string }).message).toContain("blocks[0]");
		expect((await call({ title: "Latency", blocks }))?.status).toBe(204);
		expect(store.events(session.id).find((event) => event.type === "visual")).toMatchObject({
			title: "Latency",
			format: "components",
			blocks,
		});
		await agent.end();
	});
});

function gitRepo(): string {
	const root = mkdtempSync(join(tmpdir(), "grid-checkpoint-test-"));
	cleanup.push(() => rmSync(root, { recursive: true, force: true }));
	const run = (...args: string[]) =>
		Bun.spawnSync(["git", "-C", root, ...args], { stdout: "ignore", stderr: "ignore" });
	run("init", "-q");
	run("config", "user.email", "test@example.com");
	run("config", "user.name", "Test");
	writeFileSync(join(root, "app.ts"), "one\n");
	run("add", "-A");
	run("commit", "-qm", "start");
	return root;
}

describe("checkpoints", () => {
	it("keeps what each turn changed, and undoes a turn without touching git history", async () => {
		const repo = gitRepo();
		const agent = handAgent({
			edit: (cwd, text) => {
				if (text.includes("first")) writeFileSync(join(cwd, "app.ts"), "two\n");
				if (text.includes("second")) writeFileSync(join(cwd, "new.ts"), "made\n");
			},
		});
		const { hub, session, store } = setup(agent, repo);
		const head = () =>
			Bun.spawnSync(["git", "-C", repo, "rev-parse", "HEAD"]).stdout.toString().trim();
		const before = head();

		void hub.prompt("me", session.id, "first");
		await settle();
		await agent.end();
		void hub.prompt("me", session.id, "second");
		await settle();
		await agent.end();

		const checkpoints = store.events(session.id).filter((event) => event.type === "checkpoint");
		expect(checkpoints).toMatchObject([
			{ turn: 1, files: [{ path: "app.ts", added: 1, removed: 1 }] },
			{ turn: 2, files: [{ path: "new.ts", added: 1, removed: 0 }] },
		]);

		// Undo the first turn: both turns' changes go, since the second came after it.
		await hub.restoreCheckpoint("me", session.id, 1);
		expect(readFileSync(join(repo, "app.ts"), "utf8")).toBe("one\n");
		expect(() => readFileSync(join(repo, "new.ts"))).toThrow();
		expect(store.events(session.id).at(-1)).toMatchObject({ type: "checkpoint_restored", turn: 1 });
		expect(head()).toBe(before);
	});

	it("refuses to undo while the agent works", async () => {
		const agent = handAgent();
		const { hub, session } = setup(agent, gitRepo());
		void hub.prompt("me", session.id, "go");
		await settle();
		await expect(hub.restoreCheckpoint("me", session.id, 1)).rejects.toThrow("Stop the agent");
		await agent.end();
	});
});

describe("forks", () => {
	it("copies the thread up to a turn and marks where the fork begins", async () => {
		const agent = handAgent();
		const { hub, session, store } = setup(agent);
		void hub.prompt("me", session.id, "first");
		await settle();
		agent.emit({ type: "message", text: "Answer one" });
		await agent.end();
		void hub.prompt("me", session.id, "second");
		await settle();
		await agent.end();

		const first = store.events(session.id).find((event) => event.type === "user");
		const fork = hub.fork(who, session.id, { at: first?.type === "user" ? first.id : "" });
		const copied = store.events(fork.id);
		expect(
			copied
				.filter((event) => event.type === "user")
				.map((event) => event.type === "user" && event.text),
		).toEqual(["first"]);
		expect(copied.at(-1)).toMatchObject({ type: "forked", from: { id: session.id } });
		expect(fork.title).toContain("fork");

		// The fork's agent starts fresh, and is told the conversation it carries on from.
		const forked = handAgent();
		const hub2 = new ChatHub(store, new Map([["hand", forked.provider]]), tmpdir());
		void hub2.prompt("me", fork.id, "carry on");
		await settle();
		expect(forked.prompts[0]).toContain("Answer one");
		await forked.end();
	});
});
