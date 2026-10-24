import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";

/** An agent that answers every message with a fixed reply, keeping what it was sent. */
function scripted(id: string, name: string, reply: string) {
	const prompts: string[] = [];
	const provider: Provider = {
		info: () => ({ id, name, available: true, models: [], modes: [] }),
		start: async (ctx: AgentContext): Promise<AgentSession> => ({
			prompt: async (text): Promise<TurnResult> => {
				prompts.push(text);
				ctx.emit({ type: "message", text: reply });
				return { reason: "done" };
			},
			cancel: () => undefined,
			approve: () => undefined,
			setModel: async () => undefined,
			setMode: async () => undefined,
			setEffort: async () => undefined,
			close: () => undefined,
		}),
	};
	return { provider, prompts };
}

const who = { userId: "me", workspace: "me" };

function setup() {
	const claude = scripted("claude", "Claude Code", "Claude's answer");
	const codex = scripted("codex", "Codex", "Codex's answer");
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(
		store,
		new Map([
			["claude", claude.provider],
			["codex", codex.provider],
		]),
		tmpdir(),
	);
	const session = hub.create(who, { project: "alpha", provider: "claude", cwd: tmpdir() });
	return { hub, store, session, claude, codex };
}

describe("handoff", () => {
	it("carries a thread on with another agent, which is told it is taking over", async () => {
		const { hub, store, session, codex } = setup();
		await hub.prompt("me", session.id, "plan the API");
		const moved = hub.handoff(who, session.id, { provider: "codex" });
		expect(moved.provider).toBe("codex");
		expect(store.events(session.id).at(-1)).toMatchObject({
			type: "handoff",
			from: { provider: "claude" },
			to: { provider: "codex" },
		});
		await hub.prompt("me", session.id, "now build it");
		expect(codex.prompts[0]).toContain("You are taking over this thread from Claude Code");
		expect(codex.prompts[0]).toContain("Claude's answer");
		expect(codex.prompts[0]).toContain("now build it");
		// The thread is the same one: its earlier turns are still there, under the agent who wrote them.
		expect(store.events(session.id).filter((event) => event.type === "user")).toHaveLength(2);
	});

	it("can carry on in a new thread instead, leaving this one as it was", async () => {
		const { hub, store, session } = setup();
		await hub.prompt("me", session.id, "plan the API");
		const copy = hub.handoff(who, session.id, { provider: "codex", newThread: true });
		expect(copy.id).not.toBe(session.id);
		expect(copy.provider).toBe("codex");
		expect(store.get(session.id)?.provider).toBe("claude");
		expect(store.events(copy.id).at(-1)).toMatchObject({ type: "handoff" });
	});

	it("is refused to the same agent, or one that is not installed", () => {
		const { hub, session } = setup();
		expect(() => hub.handoff(who, session.id, { provider: "claude" })).toThrow("already with");
		expect(() => hub.handoff(who, session.id, { provider: "gemini" })).toThrow("not installed");
	});
});

describe("side chats", () => {
	it("open beside a thread with its conversation, stay out of the list, and go with it", async () => {
		const { hub, store, session } = setup();
		await hub.prompt("me", session.id, "plan the API");
		const side = hub.side(who, session.id, { provider: "codex" });
		expect(side.parentId).toBe(session.id);
		expect(side.title).toContain("Side chat 1");
		expect(hub.list("me", "alpha").map((row) => row.id)).toEqual([session.id]);
		expect(hub.sides("me", session.id).map((row) => row.id)).toEqual([side.id]);
		expect(() => hub.side(who, side.id)).toThrow("cannot have side chats");
		hub.delete("me", session.id);
		expect(store.get(side.id)).toBeNull();
	});
});
