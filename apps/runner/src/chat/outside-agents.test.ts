import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent } from "../agents/events";
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
	const outside = new OutsideAgents(hub, keys, threads);
	return { agent, store, hub, keys, outside };
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
		const guests = new Guests(":memory:", context.hub, context.store, () => now);
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

	it("limit how much a guest can send", () => {
		const { guests, thread } = linked();
		const { token } = guests.create(who, thread.id);
		for (let i = 0; i < 5; i++) guests.ask(token, { text: `q${i}` });
		expect(() => guests.ask(token, { text: "one more" })).toThrow();
		expect(() => guests.ask(token, { text: "x".repeat(5000) })).toThrow();
	});
});
