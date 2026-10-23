import { describe, expect, it } from "bun:test";

import { claudeProvider } from "./claude";
import type { ChatEvent } from "./events";
import type { AgentContext, TurnResult } from "./provider";
import type { JsonProcess, Spawn } from "./stdio";

type Sent = Record<string, unknown>;

/**
 * A stand-in for the Claude Code CLI. Every process is kept so the test can end one at the time
 * it chooses, which is the point: a process asked to stop takes a moment to, and whatever it
 * wrote before it went is still in the pipe.
 */
function fakeClaude() {
	const procs: {
		proc: JsonProcess;
		push: (message: unknown) => void;
		end: (code: number) => void;
		killed: boolean;
	}[] = [];
	const spawn: Spawn = (_command, options) => {
		let onEnd: (code: number) => void = () => undefined;
		const entry = {
			killed: false,
			push: (message: unknown) => queueMicrotask(() => options.onMessage(message)),
			end: (code: number) => onEnd(code),
			proc: null as unknown as JsonProcess,
		};
		entry.proc = {
			send: (raw: unknown) => {
				const message = raw as Sent;
				// The one-off process that lists commands is told so straight away, as the CLI does.
				if (message.type === "control_request" && message.request_id === "grid-init") {
					entry.push({
						type: "control_response",
						response: { request_id: "grid-init", response: { commands: [] } },
					});
				}
			},
			kill: () => {
				entry.killed = true;
			},
			exited: new Promise<number>((resolve) => {
				onEnd = resolve;
			}),
		};
		procs.push(entry);
		return entry.proc;
	};
	// The first process only ever lists the CLI's commands; the ones after it run the turns.
	const turns = () => procs.slice(1);
	return { spawn, procs, turns };
}

const context = (): AgentContext & { events: ChatEvent[] } => {
	const events: ChatEvent[] = [];
	return {
		cwd: "/tmp",
		emit: (event) => events.push(event),
		onResumeToken: () => undefined,
		events,
	};
};

describe("Claude Code turns", () => {
	it("does not end the next turn with the exit of the process before it", async () => {
		// Changing the model asks the running process to stop and starts another on the next
		// message. The old process's exit arrived after that next turn had begun, and its handler
		// ended the new turn with "Claude Code exited (code 143)", throwing away the real answer.
		const { spawn, turns } = fakeClaude();
		const provider = claudeProvider({ binary: "claude", available: () => true, spawn });
		const ctx = context();
		const session = await provider.start(ctx);
		const emitted = ctx.events;

		// The first turn, answered normally.
		const first = session.prompt("go");
		const one = turns()[0];
		expect(one).toBeDefined();
		one?.push({ type: "assistant", message: { content: [] } });
		one?.push({ type: "result", subtype: "success", is_error: false, result: "done" });
		expect(await first).toEqual({ reason: "done" } satisfies TurnResult);

		// The model changes while nothing is running, so nothing is in flight to claim.
		await session.setModel("another-model");
		expect(one?.killed).toBe(true);

		// The next turn begins on a new process...
		const second = session.prompt("go again");
		const two = turns()[1];
		expect(two).toBeDefined();
		// ...and only now does the old process finish dying.
		one?.end(143);
		await Bun.sleep(5);

		// The old exit must not have settled the new turn.
		let settled: TurnResult | null = null;
		void second.then((result: TurnResult) => {
			settled = result;
		});
		await Bun.sleep(5);
		expect(settled).toBeNull();

		// The new process still decides how its turn ends.
		two?.push({ type: "assistant", message: { content: [] } });
		two?.push({ type: "result", subtype: "success", is_error: false, result: "done" });
		expect(await second).toEqual({ reason: "done" } satisfies TurnResult);
		expect(emitted.some((event) => event.type === "turn_end" && event.reason === "error")).toBe(
			false,
		);
	});
});

describe("Claude Code subagents, questions and steering", () => {
	async function started() {
		const { spawn, turns } = fakeClaude();
		const sent: Sent[] = [];
		const watched: Spawn = (command, options) => {
			const proc = spawn(command, options);
			const send = proc.send;
			proc.send = (message) => {
				sent.push(message as Sent);
				send(message);
			};
			return proc;
		};
		const provider = claudeProvider({ binary: "claude", available: () => true, spawn: watched });
		const ctx = context();
		const session = await provider.start(ctx);
		return { session, ctx, turns, sent };
	}

	it("shows a Task as a subagent, with its own steps, and not its text as the reply", async () => {
		const { session, ctx, turns } = await started();
		const turn = session.prompt("look around");
		const proc = turns()[0];
		proc?.push({
			type: "assistant",
			message: {
				content: [
					{
						type: "tool_use",
						id: "task1",
						name: "Task",
						input: {
							description: "Map the routes",
							prompt: "Find every route",
							subagent_type: "Explore",
						},
					},
				],
			},
		});
		proc?.push({
			type: "stream_event",
			parent_tool_use_id: "task1",
			event: { type: "content_block_delta", delta: { type: "text_delta", text: "child text" } },
		});
		proc?.push({
			type: "assistant",
			parent_tool_use_id: "task1",
			message: {
				content: [{ type: "tool_use", id: "read1", name: "Read", input: { file_path: "a.ts" } }],
			},
		});
		proc?.push({
			type: "user",
			message: {
				content: [{ type: "tool_result", tool_use_id: "task1", content: "Found 4 routes" }],
			},
		});
		proc?.push({ type: "result", subtype: "success", is_error: false });
		await turn;
		const events = ctx.events;
		expect(events.some((event) => event.type === "message")).toBe(false);
		expect(events.find((event) => event.type === "subagent")).toMatchObject({
			id: "task1",
			title: "Map the routes",
			agent: "Explore",
			status: "running",
		});
		expect(events.find((event) => event.type === "tool")).toMatchObject({
			id: "read1",
			parent: "task1",
		});
		expect(events.findLast((event) => event.type === "subagent")).toMatchObject({
			id: "task1",
			status: "completed",
			result: "Found 4 routes",
		});
	});

	it("asks AskUserQuestion of the person and answers with the labels picked", async () => {
		const { session, ctx, turns, sent } = await started();
		const turn = session.prompt("plan");
		const proc = turns()[0];
		proc?.push({
			type: "control_request",
			request_id: "r1",
			request: {
				subtype: "can_use_tool",
				tool_name: "AskUserQuestion",
				input: {
					questions: [
						{
							question: "Which database?",
							header: "Database",
							options: [{ label: "Postgres", description: "Relational" }, { label: "SQLite" }],
							multiSelect: false,
						},
					],
				},
			},
		});
		await Bun.sleep(5);
		expect(ctx.events.find((event) => event.type === "question")).toMatchObject({
			id: "r1",
			questions: [{ id: "q0", header: "Database", question: "Which database?" }],
		});
		expect(ctx.events.some((event) => event.type === "approval")).toBe(false);
		session.answer?.("r1", { q0: ["Postgres"] });
		const reply = sent.findLast((message) => message.type === "control_response") as {
			response: {
				response: { behavior: string; updatedInput: { answers: Record<string, string> } };
			};
		};
		expect(reply.response.response.behavior).toBe("allow");
		expect(reply.response.response.updatedInput.answers).toEqual({ "Which database?": "Postgres" });
		proc?.push({ type: "result", subtype: "success", is_error: false });
		await turn;
	});

	it("keeps a turn going when its result comes before Claude read a steer", async () => {
		const { session, turns, sent } = await started();
		let ended = false;
		const turn = session.prompt("build").then((result) => {
			ended = true;
			return result;
		});
		const proc = turns()[0];
		expect(await session.steer?.("use tabs")).toBe(true);
		const steer = sent.findLast((message) => message.type === "user") as { uuid: string };
		// The answer to the first message ends, but the steer was never echoed back as read.
		proc?.push({ type: "result", subtype: "success", is_error: false });
		await Bun.sleep(5);
		expect(ended).toBe(false);
		// Claude reads it and answers it: that answer ends the turn.
		proc?.push({
			type: "user",
			uuid: steer.uuid,
			message: { content: [{ type: "text", text: "use tabs" }] },
		});
		proc?.push({ type: "assistant", message: { content: [] } });
		proc?.push({ type: "result", subtype: "success", is_error: false });
		expect(await turn).toEqual({ reason: "done" });
	});
});

describe("Claude Code and Grid's own tools", () => {
	it("lets the agent show a visual without asking the person", async () => {
		const { spawn, turns } = fakeClaude();
		const sent: Sent[] = [];
		const watched: Spawn = (command, options) => {
			const proc = spawn(command, options);
			const send = proc.send;
			proc.send = (message) => {
				sent.push(message as Sent);
				send(message);
			};
			return proc;
		};
		const provider = claudeProvider({ binary: "claude", available: () => true, spawn: watched });
		const ctx = context();
		const session = await provider.start(ctx);
		const turn = session.prompt("chart it");
		const proc = turns()[0];
		proc?.push({
			type: "control_request",
			request_id: "v1",
			request: {
				subtype: "can_use_tool",
				tool_name: "mcp__grid__show_visual",
				input: { title: "x" },
			},
		});
		await Bun.sleep(5);
		expect(ctx.events.some((event) => event.type === "approval")).toBe(false);
		expect(sent.findLast((message) => message.type === "control_response")).toMatchObject({
			response: { request_id: "v1", response: { behavior: "allow" } },
		});
		proc?.push({ type: "result", subtype: "success", is_error: false });
		await turn;
	});

	it("knows a steer was read when Claude echoes it back under another uuid", async () => {
		const { spawn, turns } = fakeClaude();
		const provider = claudeProvider({ binary: "claude", available: () => true, spawn });
		const session = await provider.start(context());
		const turn = session.prompt("build");
		const proc = turns()[0];
		await session.steer?.("use tabs");
		proc?.push({
			type: "user",
			uuid: "other",
			message: { content: [{ type: "text", text: "use tabs" }] },
		});
		proc?.push({ type: "result", subtype: "success", is_error: false });
		expect(await turn).toEqual({ reason: "done" });
	});
});
