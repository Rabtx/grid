import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import { acpProvider } from "../agents/acp";
import { claudeArgs, claudeProvider } from "../agents/claude";
import type { AgentCommand, ChatEvent } from "../agents/events";
import type { Provider } from "../agents/provider";
import { policyOf } from "../agents/policy";
import type { JsonProcess, Spawn } from "../agents/stdio";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";

/** A fake agent process: `script` sees what Grid sends and answers through `reply`. */
function fakeSpawn(
	script: (message: Record<string, unknown>, reply: (out: unknown) => void) => void,
) {
	const sent: Record<string, unknown>[] = [];
	const commands: string[][] = [];
	const folders: string[] = [];
	let push: (message: unknown) => void = () => undefined;
	const spawn: Spawn = (command, { onMessage, cwd }) => {
		commands.push(command);
		folders.push(cwd);
		push = (message) => onMessage(message);
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
	return {
		spawn,
		sent,
		commands,
		folders,
		/** Something the agent says on its own, as a running agent would. */
		push: (message: unknown) => push(message),
	};
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

	it("reports the commands the agent offers, and nothing for an agent that offers none", async () => {
		const { events, context } = collector();
		const session = await acpProvider({
			id: "fake",
			name: "Fake",
			command: ["fake", "acp"],
			available: () => true,
			spawn: acp.spawn,
		}).start(context);

		acp.push({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "s1",
				update: {
					sessionUpdate: "available_commands_update",
					availableCommands: [
						{ name: "compact", description: "Summarise the conversation" },
						{
							name: "design",
							description: "Make a new Design artifact",
							input: { hint: "[what]" },
						},
						{ name: "compact", description: "Listed twice" },
						{ name: "not a command", description: "A space is not typeable" },
						{ name: "quiet" },
					],
				},
			},
		});
		// A list that is not an array, or is empty, is an agent with no commands — not a failure.
		acp.push({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: "s1",
				update: { sessionUpdate: "available_commands_update", availableCommands: "nonsense" },
			},
		});
		await Bun.sleep(5);

		expect(events.filter((event) => event.type === "commands")).toEqual([
			{
				type: "commands",
				commands: [
					{ name: "compact", description: "Summarise the conversation" },
					{ name: "design", description: "Make a new Design artifact", hint: "[what]" },
				],
			},
			{ type: "commands", commands: [] },
		]);
		session.close();
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
			efforts: [],
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

	it("reports the commands from the initialize response, with their argument hints", async () => {
		// What Claude Code 2.1.280 answers to `initialize` (recorded, then trimmed here): its own
		// commands, a user's, a plugin's, and what each one takes.
		const claude = fakeSpawn((message, reply) => {
			if (message.type !== "control_request") return;
			const { request_id, request } = message as {
				request_id: string;
				request: { subtype: string };
			};
			if (request.subtype !== "initialize") return;
			reply({
				type: "control_response",
				response: {
					subtype: "success",
					request_id,
					response: {
						commands: [
							{ name: "compact", description: "Compact the conversation", argumentHint: "" },
							{
								name: "design",
								description: "Make a new Design artifact from a brief",
								argumentHint: "[what to design]",
								builtin: true,
							},
							{
								name: "diagnose-crash",
								description: "Diagnose why a program crashed (user)",
								argumentHint: "",
							},
							{ name: "anthropic-skills:pdf", description: "PDFs", builtin: true },
							{ name: "bad name", description: "A space is not typeable" },
						],
					},
				},
			});
		});
		const { events, context } = collector();
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: claude.spawn,
		}).start(context);
		await Bun.sleep(5);

		expect(events.find((event) => event.type === "commands")).toEqual({
			type: "commands",
			commands: [
				{ name: "compact", description: "Compact the conversation" },
				{
					name: "design",
					description: "Make a new Design artifact from a brief",
					hint: "[what to design]",
				},
				{ name: "diagnose-crash", description: "Diagnose why a program crashed (user)" },
				{ name: "anthropic-skills:pdf", description: "PDFs" },
			],
		});
		// One short-lived process, in the project's folder so the project's own commands are in the
		// answer. The thread's own process is not started by asking, so a list costs no session.
		expect(claude.commands).toEqual([claudeArgs("claude", {})]);
		expect(claude.folders).toEqual(["/tmp"]);
		session.close();
	});

	it("asks for nothing in particular, or an answer that is not a list, and offers nothing", async () => {
		const claude = fakeSpawn((message, reply) => {
			if (message.type !== "control_request") return;
			const { request_id } = message as { request_id: string };
			reply({
				type: "control_response",
				response: { subtype: "success", request_id, response: { commands: "nonsense" } },
			});
		});
		const { events, context } = collector();
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: claude.spawn,
		}).start(context);
		await Bun.sleep(5);
		expect(events.find((event) => event.type === "commands")).toEqual({
			type: "commands",
			commands: [],
		});
		session.close();
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

	it("ends a turn as cancelled when the model is changed under it, not as a crash", async () => {
		// Changing the model restarts the process, and the exit that follows was reported as
		// "Claude Code exited (code 143)" with the turn failed, because the exit handler still
		// held the turn. Changing a model is not something to apologise for.
		const claude = fakeSpawn(() => undefined);
		const { events, context } = collector();
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: claude.spawn,
		}).start(context);
		const turn = session.prompt("what is here?");
		await Bun.sleep(5);
		await session.setModel("claude-sonnet-5");
		expect(await turn).toEqual({ reason: "cancelled" });
		expect(events.filter((event) => event.type === "error")).toEqual([]);
		session.close();
	});

	it("ends a turn as cancelled when the effort is changed under it, not as a crash", async () => {
		const claude = fakeSpawn(() => undefined);
		const { context } = collector();
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: claude.spawn,
		}).start(context);
		const turn = session.prompt("what is here?");
		await Bun.sleep(5);
		await session.setEffort("high");
		expect(await turn).toEqual({ reason: "cancelled" });
		session.close();
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
			setEffort: async () => {},
			close: () => {},
		}),
	};

	function hub() {
		return new ChatHub(new ChatStore(":memory:"), new Map([["echo", echo]]), tmpdir());
	}

	it("asks for attention when a turn ends only if no device is looking", async () => {
		const chat = hub();
		const heard: string[] = [];
		chat.onUnwatchedAttention((session, event) => heard.push(`${session.id}:${event.type}`));
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);

		let visible = true;
		const device = chat.attach("me", session.id, {
			event: () => {},
			state: () => {},
			watching: () => visible,
		});
		await chat.prompt("me", session.id, "one");
		expect(heard).toEqual([]);

		visible = false;
		await chat.prompt("me", session.id, "two");
		expect(heard).toEqual([`${session.id}:turn_end`]);

		device.detach();
		await chat.prompt("me", session.id, "three");
		expect(heard).toHaveLength(2);
	});

	it("catches a returning device up with only the events it missed", async () => {
		const chat = hub();
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		const first = chat.attach("me", session.id, { event: () => {}, state: () => {} });
		expect(first.missed).toBeNull();
		first.detach();

		// Away: a whole turn happens.
		await chat.prompt("me", session.id, "while you were gone");

		const back = chat.attach("me", session.id, { event: () => {}, state: () => {} }, first.cursor);
		expect(back.history).toEqual([]);
		expect(back.missed?.map((event) => event.type)).toEqual([
			"user",
			"turn_start",
			"message",
			"message",
			"turn_end",
		]);
		expect(back.cursor.next).toBe(first.cursor.next + 5);

		// Up to date: nothing missed. Another run of the runner (or a made-up cursor): the full log.
		const again = chat.attach("me", session.id, { event: () => {}, state: () => {} }, back.cursor);
		expect(again.missed).toEqual([]);
		const stranger = chat.attach(
			"me",
			session.id,
			{ event: () => {}, state: () => {} },
			{
				epoch: "another-run",
				next: 0,
			},
		);
		expect(stranger.missed).toBeNull();
		expect(stranger.history.length).toBeGreaterThan(0);
	});

	/** A provider that reports a command list on the first turn, and says what it was sent. */
	function commandsProvider(list: AgentCommand[] | null) {
		const sent: string[] = [];
		const provider: Provider = {
			info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
			start: async (context) => {
				if (list) context.emit({ type: "commands", commands: list });
				return {
					prompt: async (text) => {
						sent.push(text);
						return { reason: "done" };
					},
					cancel: () => {},
					approve: () => {},
					setModel: async () => {},
					setMode: async () => {},
					setEffort: async () => {},
					close: () => {},
				};
			},
		};
		return { provider, sent };
	}

	it("gives a role's brief with the first message that gets through, and only that one", async () => {
		const { provider, sent } = commandsProvider(null);
		let fail = true;
		const flaky: Provider = {
			...provider,
			start: async (context) => {
				const agent = await provider.start(context);
				return {
					...agent,
					prompt: async (text, images) => {
						if (fail) {
							sent.push(text);
							return { reason: "error", error: "busy" };
						}
						return agent.prompt(text, images);
					},
				};
			},
		};
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", flaky]]), tmpdir());
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{
				project: "alpha",
				provider: "echo",
				cwd: "/tmp",
				role: { id: "r1", name: "Engineer", icon: "code", brief: "Builds features." },
			},
		);
		// A command first goes as typed; the brief waits.
		fail = false;
		await chat.prompt("me", session.id, "/compact");
		// A turn that fails does not count as briefed.
		fail = true;
		await chat.prompt("me", session.id, "Add a retry");
		fail = false;
		await chat.prompt("me", session.id, "Add a retry");
		await chat.prompt("me", session.id, "Thanks");
		expect(sent).toEqual([
			"/compact",
			"You are working as the team's Engineer. What this role does:\nBuilds features.\n\n---\n\nAdd a retry",
			"You are working as the team's Engineer. What this role does:\nBuilds features.\n\n---\n\nAdd a retry",
			"Thanks",
		]);
		// The transcript keeps what the person typed.
		const typed = chat
			.attach("me", session.id, { event: () => {}, state: () => {} })
			.history.filter((event) => event.type === "user")
			.map((event) => (event as { text: string }).text);
		expect(typed).toEqual(["/compact", "Add a retry", "Add a retry", "Thanks"]);
	});

	it("gives the project's shared notes with the first message, under a role's brief, and keeps them", async () => {
		const { provider, sent } = commandsProvider(null);
		const store = new ChatStore(":memory:");
		const chat = new ChatHub(store, new Map([["echo", provider]]), tmpdir());
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{
				project: "alpha",
				provider: "echo",
				cwd: "/tmp",
				role: { id: "r1", name: "Engineer", icon: "code", brief: "" },
				notes: { text: "# ETA rules\n\n- Round to 5 min" },
			},
		);
		await chat.prompt("me", session.id, "Fix the ETA");
		await chat.prompt("me", session.id, "Thanks");
		expect(sent).toEqual([
			"You are working as the team's Engineer.\n\n---\n\nNotes the team shares with agents working on this project. Follow them unless the message says otherwise:\n\n# ETA rules\n\n- Round to 5 min\n\n---\n\nFix the ETA",
			"Thanks",
		]);
		// The thread keeps the notes it started with, marked as given.
		expect(store.get(session.id)?.notes).toEqual({
			text: "# ETA rules\n\n- Round to 5 min",
			briefed: true,
		});
		// Blank notes are not kept at all.
		const plain = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp", notes: { text: "  " } },
		);
		expect(plain.notes).toBeNull();
	});

	const COMMANDS: AgentCommand[] = [
		{ name: "compact", description: "Summarise the conversation" },
		{ name: "clear", description: "Clear the screen" },
	];

	it("keeps the agent's commands out of the log, and sends the list to a device that attaches", async () => {
		const chat = new ChatHub(
			new ChatStore(":memory:"),
			new Map([["echo", commandsProvider(COMMANDS).provider]]),
			tmpdir(),
		);
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		// A device that was here for the first turn: the list arrived, unnumbered.
		const first: { event: ChatEvent; n?: number }[] = [];
		const watching = chat.attach("me", session.id, {
			event: (event, n) => first.push({ event, n }),
			state: () => {},
		});
		await chat.prompt("me", session.id, "hello");
		expect(first.filter((item) => item.event.type === "commands")).toEqual([
			{ event: { type: "commands", commands: COMMANDS }, n: undefined },
		]);
		watching.detach();

		// A second device, and one after the agent is parked: both are given the current list.
		const late: ChatEvent[] = [];
		const back = chat.attach("me", session.id, {
			event: (event) => late.push(event),
			state: () => {},
		});
		expect(late).toEqual([{ type: "commands", commands: COMMANDS }]);
		// The list is not part of the conversation, so it is not in the log the device replays.
		expect(back.history.map((event) => event.type)).toEqual(["user", "turn_start", "turn_end"]);
	});

	it("tells every device watching when the list changes, and a thread whose agent offers none gets none", async () => {
		const { provider } = commandsProvider(null);
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", provider]]), tmpdir());
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		const one: ChatEvent[] = [];
		const two: ChatEvent[] = [];
		chat.attach("me", session.id, { event: (event) => one.push(event), state: () => {} });
		chat.attach("me", session.id, { event: (event) => two.push(event), state: () => {} });
		await chat.prompt("me", session.id, "hello");
		expect(one.some((event) => event.type === "commands")).toBe(false);
		expect(two.some((event) => event.type === "commands")).toBe(false);
	});

	it("sends an agent command the menu prefixed as the agent typed it", async () => {
		const { provider, sent } = commandsProvider(COMMANDS);
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", provider]]), tmpdir());
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		chat.attach("me", session.id, { event: () => {}, state: () => {} });
		await chat.prompt("me", session.id, "/echo:clear");
		await chat.prompt("me", session.id, "/compact the first ten messages");
		await chat.prompt("me", session.id, "ask /echo:compact about this");
		expect(sent).toEqual([
			"/clear",
			"/compact the first ten messages",
			// A prefix in the middle of a message is the person's own text, not a command.
			"ask /echo:compact about this",
		]);
	});

	it("numbers live events for the devices watching", async () => {
		const chat = hub();
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		const numbers: number[] = [];
		const watching = chat.attach("me", session.id, {
			event: (_event, n) => numbers.push(n ?? -1),
			state: () => {},
		});
		await chat.prompt("me", session.id, "count");
		expect(numbers).toEqual([0, 1, 2, 3, 4].map((step) => watching.cursor.next + step));
	});

	it("keeps each person's chats to themselves", () => {
		const chat = hub();
		const mine = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		expect(chat.list("me", "alpha").map((session) => session.id)).toEqual([mine.id]);
		expect(chat.list("you", "alpha")).toEqual([]);
		expect(() => chat.attach("you", mine.id, { event: () => {}, state: () => {} })).toThrow(
			"does not exist",
		);
	});

	it("refuses an agent that is not installed and a folder that does not exist", () => {
		const chat = hub();
		expect(() =>
			chat.create({ userId: "me", workspace: "me" }, { project: "alpha", provider: "nope" }),
		).toThrow("not installed");
		expect(() =>
			chat.create(
				{ userId: "me", workspace: "me" },
				{ project: "alpha", provider: "echo", cwd: "/no/such/dir" },
			),
		).toThrow("not a folder");
	});

	it("logs a turn, merging streamed text, and titles the chat from the first message", async () => {
		const chat = hub();
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		const live: ChatEvent[] = [];
		chat.attach("me", session.id, { event: (event) => live.push(event), state: () => {} });
		await chat.prompt("me", session.id, "say hello");

		// Live watchers see each piece; the log keeps one message.
		expect(live.filter((event) => event.type === "message")).toHaveLength(2);
		const replay = chat.attach("me", session.id, { event: () => {}, state: () => {} });
		// The log's shape is the point of this test, so `at` is matched loosely: the turn stamps
		// itself with a time for the console's "Worked for…" line, and that clock is not pinned here.
		expect(replay.history).toEqual([
			{ type: "user", text: "say hello" },
			{ type: "turn_start", at: expect.any(String) },
			{ type: "message", text: "Hello" },
			{ type: "turn_end", reason: "done", error: undefined, at: expect.any(String) },
		]);
		// The two stamps are real times, and the turn ends after it starts.
		const started = replay.history[1] as { at?: string };
		const ended = replay.history[3] as { at?: string };
		expect(Number.isFinite(Date.parse(started.at ?? ""))).toBe(true);
		expect(Date.parse(ended.at ?? "")).toBeGreaterThanOrEqual(Date.parse(started.at ?? ""));
		expect(chat.list("me", "alpha")[0].title).toBe("say hello");
	});

	it("closes a turn the runner never finished (it restarted mid-turn)", () => {
		const store = new ChatStore(":memory:");
		const before = new ChatHub(store, new Map([["echo", echo]]), tmpdir());
		const session = before.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		store.append(session.id, [
			{ type: "user", text: "go" },
			{ type: "turn_start" },
			{ type: "approval", id: "a1", title: "Run ls", options: [] },
		]);
		const after = new ChatHub(store, new Map([["echo", echo]]), tmpdir());
		const { history } = after.attach("me", session.id, { event: () => {}, state: () => {} });
		expect(history.slice(-2)).toEqual([
			{ type: "approval_resolved", id: "a1", optionId: null },
			{ type: "turn_end", reason: "error", error: "Interrupted: the runner restarted." },
		]);
	});
});

describe("attachment content blocks", () => {
	const images = [{ mimeType: "image/png", data: "aW1hZ2U=" }];
	it("sends Claude native image blocks beside the path-bearing text", async () => {
		const fake = fakeSpawn((message, reply) => {
			if (message.type === "user") reply({ type: "result", subtype: "success" });
		});
		const session = await claudeProvider({
			binary: "claude",
			available: () => true,
			spawn: fake.spawn,
		}).start(collector().context);
		await session.prompt("Read /data/attachments/file", images);
		expect(fake.sent.find((message) => message.type === "user")).toMatchObject({
			message: {
				content: [
					{ type: "text", text: "Read /data/attachments/file" },
					{ type: "image", source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" } },
				],
			},
		});
		session.close();
	});
	for (const capable of [true, false])
		it(`respects ACP image capability: ${capable}`, async () => {
			const fake = fakeSpawn((message, reply) => {
				const result =
					message.method === "initialize"
						? { agentCapabilities: { promptCapabilities: { image: capable } } }
						: message.method === "session/new"
							? { sessionId: "images" }
							: { stopReason: "end_turn" };
				if (message.id) reply({ jsonrpc: "2.0", id: message.id, result });
			});
			const session = await acpProvider({
				id: "fake",
				name: "Fake",
				command: ["fake"],
				available: () => true,
				spawn: fake.spawn,
			}).start(collector().context);
			await session.prompt("Read /data/attachments/file", images);
			expect(fake.sent.find((message) => message.method === "session/prompt")).toMatchObject({
				params: {
					prompt: [
						{ type: "text", text: "Read /data/attachments/file" },
						...(capable ? [{ type: "image", ...images[0] }] : []),
					],
				},
			});
			session.close();
		});
});

describe("a person's setup for their agents", () => {
	it("starts agents with their environment and gives the note with the first message only", async () => {
		const sent: string[] = [];
		const envs: (Record<string, string> | undefined)[] = [];
		const provider: Provider = {
			info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
			start: async (context) => {
				envs.push(context.env);
				return {
					prompt: async (text) => {
						sent.push(text);
						return { reason: "done" };
					},
					cancel: () => {},
					approve: () => {},
					setModel: async () => {},
					setMode: async () => {},
					setEffort: async () => {},
					close: () => {},
				};
			},
		};
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", provider]]), tmpdir());
		chat.setPersonal((ownerId) => ({
			env: { GIT_AUTHOR_NAME: ownerId },
			note: "No co-author lines.",
		}));
		const session = chat.create(
			{ userId: "me", workspace: "me" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		await chat.prompt("me", session.id, "/compact");
		await chat.prompt("me", session.id, "Add a retry");
		await chat.prompt("me", session.id, "Thanks");
		expect(sent).toEqual(["/compact", "No co-author lines.\n\n---\n\nAdd a retry", "Thanks"]);
		expect(envs).toEqual([{ GIT_AUTHOR_NAME: "me" }]);
	});
});

describe("workspace settings for threads", () => {
	const echo = (): Provider => ({
		info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
		start: async () => ({
			prompt: async () => ({ reason: "done" }),
			cancel: () => {},
			approve: () => {},
			setModel: async () => {},
			setMode: async () => {},
			setEffort: async () => {},
			close: () => {},
		}),
	});
	it("keeps an agent to admins when the workspace says so", () => {
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", echo()]]), tmpdir());
		const input = { project: "alpha", provider: "echo", cwd: "/tmp" };
		const settings = { agentAccess: { echo: "admins" as const } };
		expect(() =>
			chat.create({ userId: "me", workspace: "w", role: "member", settings }, input),
		).toThrow("Only admins can start Echo in this workspace");
		expect(
			chat.create({ userId: "me", workspace: "w", role: "admin", settings }, input).provider,
		).toBe("echo");
		expect(chat.create({ userId: "me", workspace: "w", role: "member" }, input).provider).toBe(
			"echo",
		);
	});
	it("clears threads untouched past the retention, and counts who uses each agent", () => {
		const store = new ChatStore(":memory:");
		const chat = new ChatHub(store, new Map([["echo", echo()]]), tmpdir());
		const old = chat.create(
			{ userId: "me", workspace: "w" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		chat.create(
			{ userId: "you", workspace: "w" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		expect(chat.agentUsage("w")).toEqual({ echo: 2 });
		// Ninety-one days on, both are past ninety days; a thread from today stays.
		const later = Date.now() + 91 * 86_400_000;
		expect(chat.prune("w", 0, later)).toBe(0);
		expect(chat.prune("other", 90, later)).toBe(0);
		expect(chat.prune("w", 90, later)).toBe(2);
		expect(store.get(old.id)).toBeNull();
	});
});

describe("agents on this machine", () => {
	function asking(approvals: { id: string; title: string }[]) {
		const answered: [string, string | null][] = [];
		const provider: Provider = {
			info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
			start: async (context) => ({
				prompt: async () => {
					for (const approval of approvals) {
						context.emit({ type: "tool", id: approval.id, title: approval.title, kind: "execute" });
						context.emit({
							type: "approval",
							id: approval.id,
							title: approval.title,
							options: [
								{ id: "yes", label: "Allow", kind: "allow" },
								{ id: "no", label: "Deny", kind: "deny" },
							],
						});
					}
					await Bun.sleep(5);
					return { reason: "done" };
				},
				cancel: () => {},
				approve: (id, optionId) => answered.push([id, optionId]),
				setModel: async () => {},
				setMode: async () => {},
				setEffort: async () => {},
				close: () => {},
			}),
		};
		return { provider, answered };
	}
	it("answers permission requests the workspace has decided, and leaves the rest", async () => {
		const { provider, answered } = asking([
			{ id: "a", title: "bun test" },
			{ id: "b", title: "git push origin main" },
			{ id: "c", title: "bun add zod" },
		]);
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", provider]]), tmpdir());
		chat.setPolicy(() => ({
			policy: policyOf({ agentPolicy: { rules: { commands: "allow", push: "never" } } }),
			defaultBranch: "main",
		}));
		const session = chat.create(
			{ userId: "me", workspace: "w" },
			{ project: "alpha", provider: "echo", cwd: "/tmp" },
		);
		await chat.prompt("w", session.id, "Go");
		expect(answered).toEqual([
			["a", "yes"],
			["b", "no"],
		]);
	});
	it("lets only so many agents work at once", async () => {
		let working = 0;
		let most = 0;
		const provider: Provider = {
			info: () => ({ id: "echo", name: "Echo", available: true, models: [], modes: [] }),
			start: async () => ({
				prompt: async () => {
					working++;
					most = Math.max(most, working);
					await Bun.sleep(10);
					working--;
					return { reason: "done" };
				},
				cancel: () => {},
				approve: () => {},
				setModel: async () => {},
				setMode: async () => {},
				setEffort: async () => {},
				close: () => {},
			}),
		};
		const chat = new ChatHub(new ChatStore(":memory:"), new Map([["echo", provider]]), tmpdir());
		chat.setTurnLimit(1);
		const threads = [1, 2, 3].map(() =>
			chat.create(
				{ userId: "me", workspace: "w" },
				{ project: "alpha", provider: "echo", cwd: "/tmp" },
			),
		);
		await Promise.all(threads.map((thread) => chat.prompt("w", thread.id, "Go")));
		expect(most).toBe(1);
	});
});
