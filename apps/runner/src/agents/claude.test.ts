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
