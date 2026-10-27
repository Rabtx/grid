import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent, Choice } from "../agents/events";
import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";
import { gridToolTitle } from "../agents/grid-titles";
import { MAX_DEPTH, ThreadTools } from "./thread-tools";

const MODES: Choice[] = [
	{ id: "plan", name: "Plan" },
	{ id: "default", name: "Ask" },
	{ id: "acceptEdits", name: "Auto-accept edits" },
	{ id: "bypassPermissions", name: "Full access" },
];

/** Agent sessions the test drives one by one: each turn waits until the test ends it. */
function team(id = "hand") {
	type Seat = {
		context: AgentContext;
		prompts: string[];
		finish: ((result: TurnResult) => void) | null;
	};
	const seats: Seat[] = [];
	const provider: Provider = {
		info: () => ({
			id,
			name: "Hand",
			available: true,
			models: [],
			modes: MODES,
			defaultMode: "default",
		}),
		start: async (context) => {
			const seat: Seat = { context, prompts: [], finish: null };
			seats.push(seat);
			const session: AgentSession = {
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						seat.prompts.push(text);
						seat.finish = resolve;
					}),
				cancel: () => {
					seat.finish?.({ reason: "cancelled" });
					seat.finish = null;
				},
				approve: () => undefined,
				answer: (questionId, answers) =>
					context.emit({ type: "question_answered", id: questionId, answers }),
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			};
			return session;
		},
	};
	/** The seat whose prompts mention `text`. */
	const seat = (text: string) => seats.find((entry) => entry.prompts.some((p) => p.includes(text)));
	return {
		provider,
		seats,
		seat,
		/** End the turn of the seat that was sent `text`, after it says `reply`. */
		end: async (text: string, reply = "", result: TurnResult = { reason: "done" }) => {
			const found = seat(text);
			if (!found) throw new Error(`no agent was sent ${text}`);
			if (reply) found.context.emit({ type: "message", text: reply });
			const done = found.finish;
			found.finish = null;
			done?.(result);
			await Bun.sleep(30);
		},
		emit: (text: string, event: ChatEvent) => seat(text)?.context.emit(event),
	};
}

const who = { userId: "me", workspace: "me" };
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const step of cleanup.splice(0)) step();
});

async function until(check: () => boolean, ms = 2_000): Promise<void> {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out waiting");
		await Bun.sleep(5);
	}
}

function setup(mode = "default") {
	const agents = team();
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(store, new Map([["hand", agents.provider]]), tmpdir());
	cleanup.push(() => hub.closeAll());
	hub.setGridTools(() => "http://runner");
	const key = (hub as unknown as { tools: { key: string } }).tools.key;
	new ThreadTools(hub, { reportDelayMs: 10 });
	const lead = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir(), mode });
	hub.rename("me", lead.id, "Lead");
	const tool = (thread: string, name: string, args: Record<string, unknown>) =>
		hub.callTool(key, thread, name, args);
	return { agents, store, hub, lead: { ...lead, title: "Lead" }, tool, key };
}

/** The lead thread mid-turn, as when its agent calls a tool. */
async function working(context: ReturnType<typeof setup>, text = "Plan the release") {
	void context.hub.prompt("me", context.lead.id, text);
	await until(() => context.agents.seat(text) !== undefined);
}

const users = (store: ChatStore, id: string) =>
	store
		.events(id)
		.filter((event): event is Extract<ChatEvent, { type: "user" }> => event.type === "user");

describe("thread tools (G)", () => {
	it("start a thread with only its prompt, marked as the lead's, and report when it finishes", async () => {
		const context = setup();
		const { tool, hub, store, lead, agents } = context;
		await working(context);
		const answer = await tool(lead.id, "thread_start", {
			prompt: "Write the changelog",
			title: "Changelog",
		});
		expect(answer).toContain('Started "Changelog"');
		const child = hub.list("me", "alpha").find((row) => row.title === "Changelog");
		expect(child?.delegatedBy).toBe(lead.id);
		await until(() => agents.seat("Write the changelog") !== undefined);
		const sent = agents.seat("Write the changelog")?.prompts[0] ?? "";
		expect(sent).toContain(`from the agent working in another Grid thread ("Lead", id ${lead.id})`);
		expect(sent).not.toContain("Plan the release");
		expect(users(store, child?.id ?? "")[0]?.origin).toEqual({
			kind: "agent",
			thread: { id: lead.id, title: "Lead" },
		});
		await agents.end("Write the changelog", "Changelog written.");
		// The lead is told when its turn is over: the report waits in its queue.
		await agents.end("Plan the release");
		await until(() => users(store, lead.id).length === 2);
		const report = users(store, lead.id)[1];
		expect(report?.origin).toEqual({ kind: "grid", reason: "report" });
		expect(report?.text).toContain('"Changelog" (thread');
		expect(report?.text).toContain("finished.\nChangelog written.");
	});

	it("wait for a thread and return its reply, without reporting it again", async () => {
		const context = setup();
		const { tool, lead, agents, store } = context;
		await working(context);
		const waited = tool(lead.id, "thread_start", {
			prompt: "Count the files",
			wait: true,
			timeout: 5,
		});
		await until(() => agents.seat("Count the files") !== undefined);
		await agents.end("Count the files", "There are 12.");
		expect(await waited).toContain("Its last reply:\nThere are 12.");
		await agents.end("Plan the release");
		await Bun.sleep(60);
		expect(users(store, lead.id)).toHaveLength(1);
	});

	it("send a question to the lead, and let the lead answer it", async () => {
		const context = setup();
		const { tool, lead, agents, store, hub } = context;
		await working(context);
		await tool(lead.id, "thread_start", { prompt: "Pick the region", title: "Region" });
		await until(() => agents.seat("Pick the region") !== undefined);
		agents.emit("Pick the region", {
			type: "question",
			id: "q1",
			questions: [
				{
					id: "region",
					header: "Region",
					question: "Which region?",
					options: [{ label: "eu-west" }, { label: "us-east" }],
				},
			],
		});
		const child = hub.list("me", "alpha").find((row) => row.title === "Region");
		await agents.end("Plan the release");
		await until(() => users(store, lead.id).length === 2);
		const told = users(store, lead.id)[1]?.text ?? "";
		expect(told).toContain("is waiting on an answer");
		expect(told).toContain('[region] Which region? Options: "eu-west", "us-east"');
		await until(() => agents.seat("is waiting on an answer") !== undefined);
		expect(
			await tool(lead.id, "thread_answer", {
				thread: child?.id,
				question: "q1",
				answers: { region: ["eu-west"] },
			}),
		).toContain("Answered");
		const answered = store
			.events(child?.id ?? "")
			.find((event) => event.type === "question_answered");
		expect(answered).toMatchObject({ answers: { region: ["eu-west"] } });
		await expect(
			tool(lead.id, "thread_answer", {
				thread: child?.id,
				question: "q1",
				answers: { region: ["x"] },
			}),
		).rejects.toThrow("no longer waiting");
	});

	it("never give a thread broader permissions than the caller's", async () => {
		const context = setup("default");
		const { tool, lead, hub } = context;
		await working(context);
		await expect(
			tool(lead.id, "thread_start", { prompt: "Deploy", mode: "bypassPermissions" }),
		).rejects.toThrow("broader permissions");
		await tool(lead.id, "thread_start", { prompt: "Read only", mode: "plan", title: "Narrow" });
		expect(hub.list("me", "alpha").find((row) => row.title === "Narrow")?.mode).toBe("plan");
		const wide = hub.create(who, {
			project: "alpha",
			provider: "hand",
			cwd: tmpdir(),
			mode: "bypassPermissions",
		});
		await expect(tool(lead.id, "thread_send", { thread: wide.id, message: "Go" })).rejects.toThrow(
			"broader permissions",
		);
		const someone = hub.create(
			{ userId: "other", workspace: "me" },
			{ project: "alpha", provider: "hand", cwd: tmpdir() },
		);
		await expect(
			tool(lead.id, "thread_send", { thread: someone.id, message: "Go" }),
		).rejects.toThrow("someone else's");
		// Reading is fine.
		expect(await tool(lead.id, "thread_read", { thread: someone.id })).toContain("0 turns");
	});

	it("do a retried start once, and stop threads starting threads too deep", async () => {
		const context = setup();
		const { tool, lead, hub, store } = context;
		await working(context);
		const first = await tool(lead.id, "thread_start", { prompt: "Once", requestId: "start-1" });
		const again = await tool(lead.id, "thread_start", { prompt: "Once", requestId: "start-1" });
		expect(again).toContain("nothing was repeated");
		expect(again).toContain(first.split(" It works")[0] ?? "");
		expect(hub.list("me", "alpha").filter((row) => row.delegatedBy === lead.id)).toHaveLength(1);
		// A chain as deep as allowed cannot start another.
		let parent = lead.id;
		for (let depth = 0; depth < MAX_DEPTH; depth++) {
			const row = hub.create(who, {
				project: "alpha",
				provider: "hand",
				cwd: tmpdir(),
				delegatedBy: parent,
			});
			parent = row.id;
		}
		void hub.prompt("me", parent, "Deep work");
		await until(() => hub.isRunning(parent));
		await expect(tool(parent, "thread_start", { prompt: "Deeper" })).rejects.toThrow(
			"deep at most",
		);
		expect(store.get(parent)?.delegatedBy).toBeTruthy();
	});

	it("send into, read, and stop a thread", async () => {
		const context = setup();
		const { tool, lead, hub, agents } = context;
		const other = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		hub.rename("me", other.id, "Docs");
		await working(context);
		expect(
			await tool(lead.id, "thread_send", { thread: other.id, message: "Update the README" }),
		).toContain("working on it now");
		await until(() => agents.seat("Update the README") !== undefined);
		expect(await tool(lead.id, "thread_list", {})).toContain('"Docs" (thread');
		const read = await tool(lead.id, "thread_read", { thread: other.id });
		expect(read).toContain('Turn 1 — Agent in "Lead": Update the README');
		expect(read).toContain("(Still going.)");
		expect(await tool(lead.id, "thread_stop", { thread: other.id })).toContain("Stopping");
		await until(() => !hub.isRunning(other.id));
		await expect(tool(lead.id, "thread_send", { thread: lead.id, message: "x" })).rejects.toThrow(
			"your own thread",
		);
	});
});

describe("thread tools in the transcript", () => {
	it("read as what they did", () => {
		expect(gridToolTitle("mcp__grid__thread_start", { title: "Math helper" })).toBe(
			"Started a thread: Math helper",
		);
		expect(gridToolTitle("mcp__grid__thread_wait")).toBe("Waited for a thread");
		expect(gridToolTitle("mcp__grid__thread_answer")).toBe("Answered a thread's question");
	});
});
