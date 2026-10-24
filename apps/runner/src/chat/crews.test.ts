import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent } from "../agents/events";
import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";
import {
	coordinatorBrief,
	Crews,
	CrewStore,
	MAX_ATTEMPTS,
	NUDGE,
	NUDGE_GRACE_MS,
	QUIET_MS,
} from "./crews";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";

/** Agents the test ends by hand, one turn per session, keeping what each was sent. */
function agents() {
	const sessions: {
		ctx: AgentContext;
		prompts: string[];
		steers: string[];
		finish: ((result: TurnResult) => void) | null;
	}[] = [];
	const provider: Provider = {
		info: () => ({ id: "hand", name: "Hand", available: true, models: [], modes: [] }),
		start: async (ctx): Promise<AgentSession> => {
			const entry = {
				ctx,
				prompts: [] as string[],
				steers: [] as string[],
				finish: null as ((r: TurnResult) => void) | null,
			};
			sessions.push(entry);
			return {
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						entry.prompts.push(text);
						entry.finish = resolve;
					}),
				steer: async (text) => {
					if (!entry.finish) return false;
					entry.steers.push(text);
					return true;
				},
				cancel: () => {
					entry.finish?.({ reason: "cancelled" });
					entry.finish = null;
				},
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			};
		},
	};
	return { provider, sessions };
}

const who = { userId: "me", workspace: "me" };
const stores: CrewStore[] = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.close();
});

async function settle(ms = 60): Promise<void> {
	await Bun.sleep(ms);
}

function setup() {
	const { provider, sessions } = agents();
	const chat = new ChatStore(":memory:");
	const hub = new ChatHub(chat, new Map([["hand", provider]]), tmpdir());
	hub.linkProjectFolder("me", "alpha", tmpdir());
	hub.setGridTools(() => "http://runner");
	const key = (hub as unknown as { tools: { key: string } }).tools.key;
	const crewStore = new CrewStore(":memory:");
	stores.push(crewStore);
	let now = Date.now();
	const crews = new Crews(crewStore, hub, { now: () => now, reportDelayMs: 10 });
	const { crew, session } = crews.create(who, {
		project: "alpha",
		name: "Launch",
		provider: "hand",
		parallel: 1,
		instructions: "Keep commits small.",
	});
	const tool = (name: string, args: Record<string, unknown>) =>
		hub.callTool(key, session.id, name, args);
	return {
		hub,
		chat,
		crews,
		crewStore,
		crew,
		coordinator: session,
		sessions,
		tool,
		key,
		tick: (ms: number) => {
			now += ms;
		},
		/** The agent session working on a thread. */
		agentOf: (thread: string) =>
			sessions.find((entry) => entry.prompts.length && chat.get(thread)) && sessions,
	};
}

/** The agent session a member thread runs in: sessions start in order, one per thread. */
function sessionFor(sessions: ReturnType<typeof agents>["sessions"], prompt: string) {
	return sessions.find((entry) => entry.prompts.some((text) => text.includes(prompt)));
}

describe("crews", () => {
	it("give only the coordinator crew tools, and tell it what it is", async () => {
		const { hub, coordinator, key, chat } = setup();
		expect(hub.toolsFor(key, coordinator.id).map((tool) => tool.name)).toContain(
			"crew_start_worker",
		);
		const other = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		expect(hub.toolsFor(key, other.id).map((tool) => tool.name)).not.toContain("crew_start_worker");
		expect(chat.get(coordinator.id)?.role?.brief).toContain("Keep commits small.");
		expect(coordinatorBrief({ name: "X", project: "p", parallel: 2, instructions: "" })).toContain(
			"Up to 2",
		);
	});

	it("start members up to the crew's limit, queue the rest, and report each to the coordinator", async () => {
		const { tool, crewStore, crew, sessions, chat, coordinator } = setup();
		expect(
			await tool("crew_start_worker", {
				key: "api",
				title: "API routes",
				brief: "Build the API routes",
			}),
		).toContain("Started");
		expect(
			await tool("crew_start_worker", { key: "docs", title: "Docs", brief: "Write the docs" }),
		).toContain("Queued");
		// Asked again for the same task: nothing new starts.
		expect(
			await tool("crew_start_worker", {
				key: "api",
				title: "API routes",
				brief: "Build the API routes",
			}),
		).toContain("Already started");
		await expect(
			tool("crew_start_worker", { key: "api", title: "API", brief: "Something else" }),
		).rejects.toThrow("another brief");
		await settle();
		const api = sessionFor(sessions, "Build the API routes");
		expect(api?.prompts[0]).toContain('member of "Launch"');
		expect(crewStore.workers(crew.id).map((w) => w.state)).toEqual(["working", "queued"]);

		api?.ctx.emit({ type: "message", text: "Routes done; tests pass." });
		api?.finish?.({ reason: "done" });
		await settle(150);
		// The next member started in the freed place, and the coordinator heard how the first went.
		expect(crewStore.workers(crew.id).map((w) => w.state)).toEqual(["done", "working"]);
		expect(sessionFor(sessions, "Write the docs")).toBeDefined();
		const report = chat
			.events(coordinator.id)
			.find(
				(event): event is Extract<ChatEvent, { type: "user" }> =>
					event.type === "user" && event.text.startsWith("[Crew report]"),
			);
		expect(report?.text).toContain("API routes (api) finished.");
		expect(report?.text).toContain("Routes done; tests pass.");
	});

	it("nudge a quiet member, restart it once, then hand it to the person", async () => {
		const { tool, crewStore, crew, sessions, crews, tick, hub } = setup();
		await tool("crew_start_worker", {
			key: "api",
			title: "API routes",
			brief: "Build the API routes",
		});
		await settle();
		const api = sessionFor(sessions, "Build the API routes");
		const worker = () => crewStore.workers(crew.id)[0];

		tick(QUIET_MS + 5_000);
		crews.check();
		await settle();
		expect(api?.steers).toEqual([NUDGE]);

		tick(NUDGE_GRACE_MS + 5_000);
		crews.check();
		await settle(150);
		// Stopped and sent again: a fresh turn, not a report.
		expect(worker()?.attempts).toBe(MAX_ATTEMPTS);
		expect(api?.prompts.at(-1)).toContain("Carry on with your task");
		expect(worker()?.state).toBe("working");

		tick(QUIET_MS + 5_000);
		crews.check();
		await settle();
		tick(NUDGE_GRACE_MS + 5_000);
		crews.check();
		await settle(150);
		expect(worker()?.state).toBe("needs_you");
		expect(hub.isRunning(worker()?.sessionId ?? "")).toBe(false);

		// Retry gives it another go.
		await crews.retry("me", crew.id, worker()?.id ?? "");
		await settle();
		expect(worker()?.state).toBe("working");
		expect(worker()?.attempts).toBe(0);
	});

	it("leave a member waiting on the person alone", async () => {
		const { tool, crewStore, crew, sessions, crews, tick } = setup();
		await tool("crew_start_worker", {
			key: "api",
			title: "API routes",
			brief: "Build the API routes",
		});
		await settle();
		const api = sessionFor(sessions, "Build the API routes");
		api?.ctx.emit({ type: "approval", id: "a1", title: "Run tests", options: [] });
		tick(QUIET_MS * 3);
		crews.check();
		await settle();
		expect(api?.steers).toEqual([]);
		expect(crewStore.workers(crew.id)[0]?.nudgedAt).toBeNull();
	});
});
