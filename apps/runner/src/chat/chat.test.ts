import { describe, expect, it } from "bun:test";

import { acpProvider } from "../agents/acp";
import { claudeArgs, claudeProvider } from "../agents/claude";
import type { ChatEvent } from "../agents/events";
import type { Provider } from "../agents/provider";
import type { JsonProcess, Spawn } from "../agents/stdio";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";

/** A fake agent process: `script` sees what Grid sends and answers through `reply`. */
function fakeSpawn(
	script: (message: Record<string, unknown>, reply: (out: unknown) => void) => void,
) {
	const sent: Record<string, unknown>[] = [];
	const commands: string[][] = [];
	const spawn: Spawn = (command, { onMessage }) => {
		commands.push(command);
		let resolveExit: (code: number) => void = () => {};
		const proc: JsonProcess = {
			send: (message) => {
				sent.push(message as Record<string, unknown>);
				queueMicrotask(() => script(message as Record<string, unknown>, (out) => onMessage(out)));
			},
			kill: () => resolveExit(0),
			exited: new Promise((resolve) => {
				resolveExit = resolve;
			}),
		};
		return proc;
	};
	return { spawn, sent, commands };
}

function collector() {
	const events: ChatEvent[] = [];
	const tokens: string[] = [];
	return {
		events,
		tokens,
		context: {
			cwd: "/tmp",
			emit: (event: ChatEvent) => events.push(event),
			onResumeToken: (token: string) => tokens.push(token),
		},
	};
}

describe("ACP adapter", () => {
	const acp = fakeSpawn((message, reply) => {
		const { id, method } = message as { id: number; method: string };
		if (method === "initialize") reply({ jsonrpc: "2.0", id, result: { agentCapabilities: {} } });
		if (method === "session/new") {
			reply({
				jsonrpc: "2.0",
				id,
				result: {
					sessionId: "s1",
					configOptions: [
						{
							id: "model",
							category: "model",
							currentValue: "m1",
							options: [{ value: "m1", name: "Model One" }],
						},
					],
				},
			});
		}
		if (method === "session/prompt") {
			const update = (update: unknown) =>
				reply({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update } });
			update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Thinking" } });
			update({
				sessionUpdate: "tool_call",
				toolCallId: "t1",
				title: "ls",
				kind: "execute",
				status: "pending",
				rawInput: { command: "ls" },
			});
			// Ask permission; the test answers it below.
			reply({
				jsonrpc: "2.0",
				id: 99,
				method: "session/request_permission",
				params: {
					sessionId: "s1",
					toolCall: { toolCallId: "t1", title: "ls" },
					options: [
						{ optionId: "yes", name: "Allow", kind: "allow_once" },
						{ optionId: "no", name: "Reject", kind: "reject_once" },
					],
				},
			});
		}
		if ((message as { id?: number }).id === 99) {
			// The permission answer arrived: finish the tool and the turn.
			const update = (update: unknown) =>
				reply({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update } });
			update({
				sessionUpdate: "tool_call_update",
				toolCallId: "t1",
				status: "completed",
				content: [{ type: "content", content: { type: "text", text: "a.txt" } }],
			});
			update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done." } });
			reply({ jsonrpc: "2.0", id: 3, result: { stopReason: "end_turn" } });
		}
	});

	it("maps sessions, models, tool calls, approvals and replies onto chat events", async () => {
		const { events, tokens, context } = collector();
		const provider = acpProvider({
			id: "fake",
			name: "Fake",
			command: ["fake", "acp"],
			available: () => true,
			spawn: acp.spawn,
		});
		const session = await provider.start(context);
		expect(tokens).toEqual(["s1"]);
		expect(events[0]).toEqual({
			type: "info",
			models: [{ id: "m1", name: "Model One", description: undefined }],
			model: "m1",
		});

		const turn = session.prompt("list files");
		await Bun.sleep(5);
		const approval = events.find((event) => event.type === "approval");
		expect(approval).toMatchObject({
			type: "approval",
			title: "ls",
			options: [
				{ id: "yes", kind: "allow" },
				{ id: "no", kind: "deny" },
			],
		});
		session.approve((approval as { id: string }).id, "yes");
		expect(await turn).toEqual({ reason: "done" });

		const answer = acp.sent.find((message) => (message as { id?: number }).id === 99) as {
			result: unknown;
		};
		expect(answer.result).toEqual({ outcome: { outcome: "selected", optionId: "yes" } });
		expect(events.map((event) => event.type)).toEqual([
			"info",
			"reasoning",
			"tool",
			"approval",
			"approval_resolved",
			"tool",
			"message",
		]);
		expect(
			events.find((event) => event.type === "tool" && event.status === "completed"),
		).toMatchObject({ output: "a.txt" });
	});
});

describe("Claude adapter", () => {
	it("builds the stream-json command line, resuming and with the chosen mode", () => {
		expect(claudeArgs("claude", { model: "opus", mode: "acceptEdits", resume: "abc" })).toEqual([
			"claude",
			"--print",
			"--output-format",
			"stream-json",
			"--input-format",
			"stream-json",
			"--verbose",
			"--include-partial-messages",
			"--permission-prompt-tool",
			"stdio",
			"--model",
			"opus",
			"--permission-mode",
			"acceptEdits",
			"--resume",
			"abc",
		]);
		expect(claudeArgs("claude", { model: "default" })).not.toContain("--model");
	});

	it("streams text, asks before tools, and ends the turn with usage", async () => {
		const claude = fakeSpawn((message, reply) => {
			if (message.type === "user") {
				reply({ type: "system", subtype: "init", session_id: "claude-session" });
				reply({
					type: "stream_event",
					event: {
						type: "content_block_delta",
						delta: { type: "text_delta", text: "Let me look." },
					},
				});
				reply({
					type: "assistant",
					message: {
						content: [
							{
								type: "tool_use",
								id: "tu1",
								name: "Bash",
								input: { command: "ls", description: "List files" },
							},
						],
					},
				});
				reply({
					type: "control_request",
					request_id: "r1",
					request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } },
				});
			}
			if (message.type === "control_response") {
				reply({
					type: "user",
					message: {
						content: [{ type: "tool_result", tool_use_id: "tu1", content: "a.txt\nb.txt" }],
					},
				});
				reply({
					type: "result",
					subtype: "success",
					usage: { input_tokens: 10, output_tokens: 5 },
					total_cost_usd: 0.01,
				});
			}
		});
		const { events, tokens, context } = collector();
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: claude.spawn,
		}).start(context);
		const turn = session.prompt("what is here?");
		await Bun.sleep(5);
		expect(events.find((event) => event.type === "approval")).toMatchObject({
			id: "r1",
			title: "Run a command",
			detail: "ls",
		});
		session.approve("r1", "allow");
		expect(await turn).toEqual({ reason: "done" });
		expect(tokens).toEqual(["claude-session"]);
		expect(claude.sent.at(-1)).toEqual({
			type: "control_response",
			response: {
				subtype: "success",
				request_id: "r1",
				response: { behavior: "allow", updatedInput: { command: "ls" } },
			},
		});
		expect(events.filter((event) => event.type === "tool")).toEqual([
			{
				type: "tool",
				id: "tu1",
				title: "List files",
				kind: "execute",
				status: "running",
				input: "ls",
			},
			{ type: "tool", id: "tu1", status: "completed", output: "a.txt\nb.txt" },
		]);
		expect(events.find((event) => event.type === "usage")).toEqual({
			type: "usage",
			inputTokens: 10,
			outputTokens: 5,
			costUsd: 0.01,
		});
	});
});

describe("ChatHub", () => {
	/** A provider whose every turn replies "Hel" + "lo" and finishes. */
	const echo: Provider = {
		info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
		start: async (context) => ({
			prompt: async () => {
				context.emit({ type: "message", text: "Hel" });
				context.emit({ type: "message", text: "lo" });
				return { reason: "done" };
			},
			cancel: () => {},
			approve: () => {},
			setModel: async () => {},
			setMode: async () => {},
			close: () => {},
		}),
	};

	function hub() {
		return new ChatHub(new ChatStore(":memory:"), new Map([["echo", echo]]));
	}

	it("keeps each person's chats to themselves", () => {
		const chat = hub();
		const mine = chat.create("me", { project: "alpha", provider: "echo", cwd: "/tmp" });
		expect(chat.list("me", "alpha").map((session) => session.id)).toEqual([mine.id]);
		expect(chat.list("you", "alpha")).toEqual([]);
		expect(() => chat.attach("you", mine.id, { event: () => {}, state: () => {} })).toThrow(
			"does not exist",
		);
	});

	it("refuses an agent that is not installed and a folder that does not exist", () => {
		const chat = hub();
		expect(() => chat.create("me", { project: "alpha", provider: "nope" })).toThrow(
			"not installed",
		);
		expect(() =>
			chat.create("me", { project: "alpha", provider: "echo", cwd: "/no/such/dir" }),
		).toThrow("not a folder");
	});

	it("logs a turn, merging streamed text, and titles the chat from the first message", async () => {
		const chat = hub();
		const session = chat.create("me", { project: "alpha", provider: "echo", cwd: "/tmp" });
		const live: ChatEvent[] = [];
		chat.attach("me", session.id, { event: (event) => live.push(event), state: () => {} });
		await chat.prompt("me", session.id, "say hello");

		// Live watchers see each piece; the log keeps one message.
		expect(live.filter((event) => event.type === "message")).toHaveLength(2);
		const replay = chat.attach("me", session.id, { event: () => {}, state: () => {} });
		expect(replay.history).toEqual([
			{ type: "user", text: "say hello" },
			{ type: "turn_start" },
			{ type: "message", text: "Hello" },
			{ type: "turn_end", reason: "done", error: undefined },
		]);
		expect(chat.list("me", "alpha")[0].title).toBe("say hello");
	});

	it("closes a turn the runner never finished (it restarted mid-turn)", () => {
		const store = new ChatStore(":memory:");
		const before = new ChatHub(store, new Map([["echo", echo]]));
		const session = before.create("me", { project: "alpha", provider: "echo", cwd: "/tmp" });
		store.append(session.id, [
			{ type: "user", text: "go" },
			{ type: "turn_start" },
			{ type: "approval", id: "a1", title: "Run ls", options: [] },
		]);
		const after = new ChatHub(store, new Map([["echo", echo]]));
		const { history } = after.attach("me", session.id, { event: () => {}, state: () => {} });
		expect(history.slice(-2)).toEqual([
			{ type: "approval_resolved", id: "a1", optionId: null },
			{ type: "turn_end", reason: "error", error: "Interrupted: the runner restarted." },
		]);
	});
});
