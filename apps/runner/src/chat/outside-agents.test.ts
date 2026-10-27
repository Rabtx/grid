import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent } from "../agents/events";
import { AuditLog } from "../audit/audit-log";
import { SpendLedger } from "../spend/ledger";
import { Guests } from "./guests";
import { ChatHub } from "./hub";
import { AgentKeyStore, OutsideAgents } from "./outside-agents";
import { ChatStore } from "./store";
import { heldAgent, until } from "./test-agents";
import { ThreadTools } from "./thread-tools";

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
	store.setProjectFolder("me", "alpha", tmpdir());
	const threads = new ThreadTools(hub, { reportDelayMs: 10 });
	const keys = new AgentKeyStore(":memory:");
	const ledger = new SpendLedger(":memory:");
	const audit = new AuditLog(":memory:");
	const outside = new OutsideAgents(hub, keys, threads, undefined, { ledger, audit });
	return { agent, store, hub, keys, outside, ledger, audit };
}

async function requireAnswer(answer: Promise<Response | null>): Promise<Response> {
	const response = await answer;
	if (!response) throw new Error("not a keys request");
	return response;
}

/** A person's request to their keys. */
const keysCall = (
	outside: OutsideAgents,
	method: string,
	path: string,
	body?: unknown,
): Promise<Response> => {
	const url = new URL(`http://runner${path}`);
	return requireAnswer(
		outside.keysRequest(
			new Request(url.href, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
			url,
			who,
		),
	);
};

/** Grid's answer to an MCP message, as far as the tests read it. */
type McpAnswer = {
	result?: {
		protocolVersion?: string;
		serverInfo?: { name: string };
		tools?: { name: string }[];
		isError?: boolean;
		content?: { text: string }[];
	};
	error?: { code: number };
};

/** An MCP message from an outside agent. */
async function mcp(
	outside: OutsideAgents,
	token: string,
	method: string,
	params?: unknown,
	id = 1,
) {
	const url = new URL("http://runner/mcp");
	const response = await outside.mcpRequest(
		new Request(url.href, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }),
		}),
		url,
	);
	if (!response) throw new Error("not an MCP request");
	return { status: response.status, body: (await response.json()) as McpAnswer };
}

async function key(outside: OutsideAgents, input: Record<string, unknown>) {
	const made = await keysCall(outside, "POST", "/chat/agent-keys", input);
	expect(made.status).toBe(201);
	return ((await made.json()) as { data: { token: string; key: { id: string } } }).data;
}

describe("agent keys (N)", () => {
	it("shows a token once, keeps only its hash, and stops it when revoked", async () => {
		const { outside, keys } = setup();
		expect((await keysCall(outside, "POST", "/chat/agent-keys", { name: "" })).status).toBe(400);
		expect(
			(await keysCall(outside, "POST", "/chat/agent-keys", { name: "x", mode: "god" })).status,
		).toBe(400);
		expect(
			(await keysCall(outside, "POST", "/chat/agent-keys", { name: "x", project: "nope" })).status,
		).toBe(400);
		const made = await key(outside, { name: "Cursor", project: "alpha", provider: "hand" });
		expect(made.token).toStartWith("grid_ak_");
		const listed = await (await keysCall(outside, "GET", "/chat/agent-keys")).json();
		expect(JSON.stringify(listed)).not.toContain(made.token);
		expect(keys.byToken(made.token)?.name).toBe("Cursor");
		expect((await keysCall(outside, "DELETE", `/chat/agent-keys/${made.key.id}`)).status).toBe(204);
		expect(keys.byToken(made.token)).toBeNull();
		expect((await mcp(outside, made.token, "ping")).status).toBe(401);
	});
});

describe("Grid over MCP (N)", () => {
	it("speaks the protocol and hides the tools that change threads from a read-only key", async () => {
		const { outside } = setup();
		const reader = await key(outside, { name: "Reader" });
		const init = await mcp(outside, reader.token, "initialize", { protocolVersion: "2025-03-26" });
		expect(init.body.result?.protocolVersion).toBe("2025-03-26");
		expect(init.body.result?.serverInfo?.name).toBe("grid");
		const tools = (await mcp(outside, reader.token, "tools/list")).body.result?.tools?.map(
			(tool) => tool.name,
		);
		expect(tools).toContain("thread_list");
		expect(tools).toContain("list_projects");
		expect(tools).not.toContain("thread_start");
		const refused = await mcp(outside, reader.token, "tools/call", {
			name: "thread_start",
			arguments: { prompt: "Do it", project: "alpha", provider: "hand" },
		});
		expect(refused.body.result?.isError).toBe(true);
		expect((await mcp(outside, reader.token, "nope")).body.error?.code).toBe(-32601);
		expect((await mcp(outside, "grid_ak_wrong", "ping")).status).toBe(401);
	});
	it("starts a thread as the agent outside Grid, once per request id, and reads it back", async () => {
		const { outside, agent, hub, store } = setup();
		const writer = await key(outside, {
			name: "Cursor",
			write: true,
			project: "alpha",
			provider: "hand",
		});
		const call = (name: string, args: Record<string, unknown>, id = 2) =>
			mcp(outside, writer.token, "tools/call", { name, arguments: args }, id);
		const started = await call("thread_start", {
			prompt: "Fix the flaky test",
			title: "Flaky",
			requestId: "r1",
		});
		expect(started.body.result?.isError).toBe(false);
		expect(started.body.result?.content?.[0]?.text).toContain("[Flaky](grid-thread://");
		const again = await call(
			"thread_start",
			{ prompt: "Fix the flaky test", title: "Flaky", requestId: "r1" },
			3,
		);
		expect(again.body.result?.content?.[0]?.text).toContain("nothing was repeated");
		expect(hub.list("me", "alpha").filter((row) => row.title === "Flaky")).toHaveLength(1);
		await until(() => agent.prompts().length === 1);
		expect(agent.prompts()[0]).toContain("Cursor");
		const thread = hub.list("me", "alpha").find((row) => row.title === "Flaky");
		const first = store
			.events(thread?.id ?? "")
			.find((event): event is Extract<ChatEvent, { type: "user" }> => event.type === "user");
		expect(first?.origin).toEqual({ kind: "outside", agent: "Cursor" });
		await agent.finishAll("Fixed: a timer leaked.");
		const read = await call("thread_read", { thread: `grid-thread://${thread?.id}` }, 4);
		expect(read.body.result?.content?.[0]?.text).toContain("Fixed: a timer leaked.");
	});
});

describe("guest links (N)", () => {
	function linked() {
		const context = setup();
		let now = new Date();
		const guests = new Guests(":memory:", context.hub, context.store, () => now, context.audit);
		const thread = context.hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		context.hub.rename("me", thread.id, "Launch");
		return {
			...context,
			guests,
			thread,
			later: (ms: number) => (now = new Date(now.getTime() + ms)),
		};
	}

	it("show a thread's conversation, not its tools' inputs, to whoever has the link", () => {
		const { guests, store, thread } = linked();
		const { token } = guests.create(who, thread.id);
		expect(token).toStartWith("grid_gl_");
		store.append(thread.id, [
			{ type: "user", text: "Ship it" },
			{
				type: "tool",
				id: "t1",
				title: "Run deploy",
				status: "completed",
				input: "SECRET=1 ./deploy",
				output: "ok",
			} as ChatEvent,
			{ type: "message", text: "Shipped." },
		]);
		const view = guests.view(token);
		expect(view.title).toBe("Launch");
		expect(view.events.map((event) => event.type)).toEqual(["user", "tool", "message"]);
		expect(JSON.stringify(view.events)).not.toContain("SECRET");
		expect(guests.view(token, view.next).events).toEqual([]);
		expect(() => guests.view("grid_gl_nottherealtokenatall")).toThrow();
		expect(() => guests.create({ userId: "you", workspace: "you" }, thread.id)).toThrow();
	});

	it("end after a day, or when stopped", () => {
		const { guests, thread, later } = linked();
		const first = guests.create(who, thread.id);
		later(25 * 3_600_000);
		expect(() => guests.view(first.token)).toThrow("ended");
		const second = guests.create(who, thread.id);
		guests.stop(who, thread.id);
		expect(() => guests.view(second.token)).toThrow("ended");
	});

	it("let a guest ask; the person sends it on as the guest's, or dismisses it", async () => {
		const { guests, thread, agent, store } = linked();
		const { token } = guests.create(who, thread.id);
		expect(() => guests.ask(token, { text: "" })).toThrow();
		const asked = guests.ask(token, { name: "Dana", text: "Can it ship Friday?" });
		const dismissed = guests.ask(token, { text: "Hello?" });
		expect(guests.pending(thread.id).map((item) => item.name)).toEqual(["Dana", "Guest"]);
		await guests.resolve(who, thread.id, dismissed.id, "dismiss");
		await guests.resolve(who, thread.id, asked.id, "send");
		await expect(guests.resolve(who, thread.id, asked.id, "send")).rejects.toThrow();
		expect(guests.pending(thread.id)).toEqual([]);
		await until(() => agent.prompts().length === 1);
		expect(agent.prompts()[0]).toContain("Can it ship Friday?");
		expect(agent.prompts()[0]).toContain("Dana");
		const user = store
			.events(thread.id)
			.find((event): event is Extract<ChatEvent, { type: "user" }> => event.type === "user");
		expect(user?.origin).toEqual({ kind: "guest", name: "Dana" });
		await agent.finishAll();
	});

	it("note links, what guests ask and what was done with it in the audit log", async () => {
		const { guests, thread, audit, agent } = linked();
		const { token } = guests.create(who, thread.id);
		const asked = guests.ask(token, { name: "Dana", text: "Ready?" });
		await guests.resolve(who, thread.id, asked.id, "send");
		guests.stop(who, thread.id);
		expect(audit.list("me").map((entry) => `${entry.actor.kind}:${entry.action}`)).toEqual([
			"person:guest_link.stop",
			"person:guest.send",
			"guest:guest.ask",
			"person:guest_link.create",
		]);
		await until(() => agent.prompts().length === 1);
		await agent.finishAll();
	});

	it("limit how much a guest can send", () => {
		const { guests, thread } = linked();
		const { token } = guests.create(who, thread.id);
		for (let i = 0; i < 5; i++) guests.ask(token, { text: `q${i}` });
		expect(() => guests.ask(token, { text: "one more" })).toThrow();
		expect(() => guests.ask(token, { text: "x".repeat(5000) })).toThrow();
	});
});

describe("scoped agent keys (F2)", () => {
	const start = (outside: OutsideAgents, token: string, args: Record<string, unknown>, id = 9) =>
		mcp(outside, token, "tools/call", { name: "thread_start", arguments: args }, id);
	const text = (answer: { body: McpAnswer }) => answer.body.result?.content?.[0]?.text ?? "";

	it("refuse limits that make no sense, and stop working when they expire", async () => {
		const { outside, keys } = setup();
		for (const bad of [
			{ expiresInDays: 0 },
			{ expiresInDays: 400 },
			{ projects: ["nowhere"] },
			{ budgetUsd: -1 },
		])
			expect(
				(await keysCall(outside, "POST", "/chat/agent-keys", { name: "x", ...bad })).status,
			).toBe(400);
		const made = await key(outside, { name: "Short", expiresInDays: 1 });
		expect(keys.byToken(made.token)?.expiresAt).toBeString();
		expect(keys.byToken(made.token, new Date(Date.now() + 2 * 86_400_000))).toBeNull();
		expect((await mcp(outside, made.token, "ping")).status).toBe(200);
	});

	it("keep a key to its projects and, when asked, to the threads it started", async () => {
		const { outside, hub, store, agent } = setup();
		store.setProjectFolder("me", "beta", tmpdir());
		const other = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		hub.rename("me", other.id, "Someone's work");
		const scoped = await key(outside, {
			name: "Scoped",
			write: true,
			provider: "hand",
			projects: ["alpha"],
			ownThreads: true,
		});
		expect(text(await start(outside, scoped.token, { prompt: "Go", project: "beta" }))).toContain(
			"works only in alpha",
		);
		const mine = await start(outside, scoped.token, {
			prompt: "Mine",
			project: "alpha",
			title: "Mine",
		});
		expect(text(mine)).toContain("[Mine](grid-thread://");
		await until(() => agent.prompts().length === 1);
		const listed = text(
			await mcp(
				outside,
				scoped.token,
				"tools/call",
				{ name: "thread_list", arguments: { project: "alpha" } },
				10,
			),
		);
		expect(listed).toContain("Mine");
		expect(listed).not.toContain("Someone's work");
		const read = await mcp(
			outside,
			scoped.token,
			"tools/call",
			{ name: "thread_read", arguments: { thread: other.id } },
			11,
		);
		expect(read.body.result?.isError).toBe(true);
		expect(text(read)).toContain("does not exist");
		await agent.finishAll();
	});

	it("stop a key from starting work once its 30-day budget is spent, and note what it did", async () => {
		const { outside, ledger, audit, agent, hub } = setup();
		const capped = await key(outside, {
			name: "Capped",
			write: true,
			provider: "hand",
			project: "alpha",
			budgetUsd: 1,
		});
		const first = text(await start(outside, capped.token, { prompt: "Work", title: "Paid work" }));
		const thread = /grid-thread:\/\/([\w-]+)/.exec(first)?.[1] ?? "";
		await until(() => agent.prompts().length === 1);
		const session = hub.thread("me", thread);
		ledger.report(
			{
				workspaceId: "me",
				ownerId: "me",
				project: "alpha",
				sessionId: thread,
				keyId: capped.key.id,
			},
			1.5,
		);
		expect(text(await start(outside, capped.token, { prompt: "More" }, 10))).toContain(
			"budget of $1.00",
		);
		const listed = (await (await keysCall(outside, "GET", "/chat/agent-keys")).json()) as {
			data: { name: string; spentUsd: number }[];
		};
		expect(listed.data.find((item) => item.name === "Capped")?.spentUsd).toBe(1.5);
		expect(audit.list("me").map((entry) => [entry.action, entry.actor.kind, entry.target])).toEqual(
			[
				["thread.start", "agent_key", session.title],
				["key.create", "person", "Capped"],
			],
		);
		await agent.finishAll();
	});
});

describe("spending limits on turns (F3)", () => {
	it("refuse a turn the gate refuses, and let a message wait while one is going on", async () => {
		const { hub, agent } = setup();
		const thread = hub.create(who, { project: "alpha", provider: "hand", cwd: tmpdir() });
		let limit: string | null = null;
		hub.setGate(() => limit);
		void hub.prompt("me", thread.id, "First");
		await until(() => agent.prompts().length === 1);
		limit = "The workspace's daily budget is used up";
		// While the turn goes on, a message only waits.
		await hub.prompt("me", thread.id, "Queued");
		await agent.finishAll();
		await until(() =>
			hub
				.events("me", thread.id)
				.some((event) => event.type === "error" && event.message.includes("used up")),
		);
		expect(agent.prompts()).toEqual(["First"]);
		await expect(hub.prompt("me", thread.id, "Again")).rejects.toThrow("used up");
		limit = null;
		void hub.prompt("me", thread.id, "Later");
		await until(() => agent.prompts().length === 2);
		await agent.finishAll();
	});
});
