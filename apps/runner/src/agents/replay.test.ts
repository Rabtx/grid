import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { claudeProvider } from "./claude";
import type { ChatEvent } from "./events";
import type { AgentSession } from "./provider";
import { readRecording, replaySpawn, type Recording, scrubRecording } from "./replay";

/**
 * Real Claude Code sessions (recorded with `GRID_AGENT_RECORD_DIR`, kept with `scrubRecording`)
 * played back to Grid's Claude provider: a change to the CLI's output, or to how Grid reads it,
 * shows here before it shows in a person's thread.
 */

const fixture = (name: string) =>
	readRecording(join(import.meta.dir, "replay-fixtures", "claude", name, "process-1.ndjson"));
/** The conversation the resume scenario carried on: the one the simple scenario recorded. */
const recordedSession = (
	JSON.parse(
		readFileSync(
			join(import.meta.dir, "replay-fixtures", "claude", "resume", "expect.json"),
			"utf8",
		),
	) as { resume: string }
).resume;

/** Claude Code started beside each session to list its commands, answered with one. */
const commandsListing: Recording = [
	{
		t: 0,
		in: { type: "control_request", request_id: "grid-init", request: { subtype: "initialize" } },
	},
	{
		t: 1,
		out: {
			type: "control_response",
			response: {
				subtype: "success",
				request_id: "grid-init",
				response: {
					commands: [{ name: "review", description: "Review a change", argumentHint: "" }],
				},
			},
		},
	},
];

async function replayed(
	name: string,
	options: { resume?: string; respond?: (event: ChatEvent, session: AgentSession) => void } = {},
) {
	const replay = replaySpawn([fixture(name), commandsListing]);
	const provider = claudeProvider({ binary: "claude", available: () => true, spawn: replay.spawn });
	const events: ChatEvent[] = [];
	const tokens: string[] = [];
	let session: AgentSession | null = null;
	session = await provider.start({
		cwd: "/work",
		model: "haiku",
		...(options.resume ? { resume: options.resume } : {}),
		emit: (event) => {
			events.push(event);
			const current = session;
			if (current) queueMicrotask(() => options.respond?.(event, current));
		},
		onResumeToken: (token) => tokens.push(token),
	});
	const prompt = (
		fixture(name).find((entry) => "in" in entry) as {
			in: { message: { content: { text: string }[] } };
		}
	).in.message.content[0]?.text;
	const result = await session.prompt(prompt ?? "");
	await Bun.sleep(5);
	session.close();
	return { replay, events, tokens, result };
}

const text = (events: ChatEvent[]) =>
	events
		.filter((event): event is Extract<ChatEvent, { type: "message" }> => event.type === "message")
		.map((event) => event.text)
		.join("");

describe("recorded Claude Code sessions", () => {
	test("a plain turn answers, reports usage and its session id", async () => {
		const { replay, events, tokens, result } = await replayed("simple");
		expect(replay.mismatches).toEqual([]);
		expect(result).toEqual({ reason: "done" });
		expect(text(events)).toBe("hello");
		expect(events.some((event) => event.type === "usage")).toBe(true);
		expect(events.some((event) => event.type === "commands")).toBe(true);
		expect(tokens).toContain(recordedSession);
		expect(replay.finished()).toBe(true);
	});

	test("a command waits for approval, runs once allowed, and the turn finishes", async () => {
		const { replay, events, result } = await replayed("approval", {
			respond: (event, session) => {
				if (event.type === "approval") session.approve(event.id, "allow");
			},
		});
		expect(replay.mismatches).toEqual([]);
		expect(result).toEqual({ reason: "done" });
		const order = events
			.map((event) => event.type)
			.filter((type) => ["tool", "approval", "approval_resolved", "message"].includes(type));
		expect(order.indexOf("approval")).toBeLessThan(order.indexOf("approval_resolved"));
		expect(order.at(-1)).toBe("message");
		const tools = events.filter(
			(event): event is Extract<ChatEvent, { type: "tool" }> => event.type === "tool",
		);
		expect(tools.at(-1)).toMatchObject({ status: "completed" });
		expect(text(events).toLowerCase()).toContain("done");
		expect(replay.finished()).toBe(true);
	});

	test("a question is asked in Grid and its answer reaches the agent", async () => {
		const { replay, events, result } = await replayed("question", {
			respond: (event, session) => {
				if (event.type === "question")
					session.answer?.(event.id, { [event.questions[0]?.id ?? "q0"]: ["Red"] });
			},
		});
		expect(replay.mismatches).toEqual([]);
		expect(result).toEqual({ reason: "done" });
		const asked = events.find(
			(event): event is Extract<ChatEvent, { type: "question" }> => event.type === "question",
		);
		expect(asked?.questions[0]).toMatchObject({ question: "Which color?" });
		expect(asked?.questions[0]?.options.map((option) => option.label)).toEqual(["Red", "Blue"]);
		const answer = replay.sent.find(
			(message) => (message as { type?: string }).type === "control_response",
		) as { response: { response: { behavior: string; updatedInput: { answers: unknown } } } };
		expect(answer.response.response.behavior).toBe("allow");
		expect(JSON.stringify(answer.response.response.updatedInput.answers)).toContain("Red");
		expect(text(events)).toContain("Red");
		expect(replay.finished()).toBe(true);
	});

	test("a resumed session carries on the earlier conversation", async () => {
		const { replay, events, result } = await replayed("resume", {
			resume: recordedSession,
		});
		expect(replay.mismatches).toEqual([]);
		expect(result).toEqual({ reason: "done" });
		expect(text(events)).toBe("hello");
	});

	test("what Grid sends out of step with the recording is reported", async () => {
		const replay = replaySpawn([fixture("approval")]);
		const proc = replay.spawn(["claude"], { cwd: "/work", onMessage: () => {} });
		proc.send({ type: "user", message: { role: "user", content: [] } });
		await Bun.sleep(5);
		proc.send({ type: "control_request", request_id: "grid-1", request: { subtype: "interrupt" } });
		expect(replay.mismatches).toEqual([
			"expected control_response success allow, got control_request interrupt",
		]);
		proc.kill();
		expect(await proc.exited).toBe(143);
	});
});

describe("keeping a recording", () => {
	test("replaces paths, emails and credentials, and cuts Claude Code's init", () => {
		const raw = [
			JSON.stringify({ t: 0, start: { command: [], cwd: "/home/me/work/app" } }),
			JSON.stringify({
				t: 1,
				out: {
					type: "system",
					subtype: "init",
					cwd: "/home/me/work/app",
					session_id: "s",
					tools: ["Secret"],
					plugins: [],
				},
			}),
			JSON.stringify({ t: 2, out: { text: "me@corp.io wrote sk-ant-abc123 in /home/me/notes" } }),
		].join("\n");
		const kept = scrubRecording(raw, { "/home/me": "/home/person", "/home/me/work/app": "/work" });
		expect(kept).not.toContain("/home/me");
		expect(kept).toContain('"cwd":"/work"');
		expect(kept).not.toContain("Secret");
		expect(kept).toContain("person@example.com");
		expect(kept).toContain("[credential]");
		expect(kept).toContain("/home/person/notes");
	});
});
