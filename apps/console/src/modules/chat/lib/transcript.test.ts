import { describe, expect, it } from "vitest";

import type { ChatEvent } from "../types/chat.types";
import { applyEvent, emptyTranscript } from "./transcript";
import {
	countWork,
	formatDuration,
	groupRows,
	groupTurns,
	pendingApprovals,
	replay,
	summariseTools,
	toolLabel,
	type Block,
} from "./transcript";

describe("replay", () => {
	it("joins streamed text into one reply and keeps reasoning apart", () => {
		const transcript = replay([
			{ type: "user", text: "hi" },
			{ type: "reasoning", text: "They said " },
			{ type: "reasoning", text: "hi." },
			{ type: "message", text: "Hel" },
			{ type: "message", text: "lo!" },
		]);
		expect(
			transcript.blocks.map((block) => [block.kind, "text" in block ? block.text : ""]),
		).toEqual([
			["user", "hi"],
			["reasoning", "They said hi."],
			["assistant", "Hello!"],
		]);
	});

	it("updates a tool in place as it runs and finishes", () => {
		const transcript = replay([
			{ type: "tool", id: "t1", title: "Run ls", kind: "execute", status: "running", input: "ls" },
			{ type: "message", text: "Looking…" },
			{ type: "tool", id: "t1", status: "completed", output: "a.txt" },
		]);
		expect(transcript.blocks[0]).toMatchObject({
			kind: "tool",
			title: "Run ls",
			tool: "execute",
			status: "completed",
			input: "ls",
			output: "a.txt",
		});
		expect(transcript.blocks).toHaveLength(2);
	});

	it("marks tools left running as done when the turn ends normally", () => {
		const transcript = replay([
			{ type: "turn_start" },
			{ type: "tool", id: "t1", title: "Read", status: "running" },
			{ type: "turn_end", reason: "done" },
		]);
		expect(transcript.blocks[0]).toMatchObject({ status: "completed" });
	});

	it("tracks approvals until they are answered", () => {
		const asked: ChatEvent[] = [
			{
				type: "approval",
				id: "a1",
				title: "Run rm",
				options: [{ id: "allow", label: "Allow", kind: "allow" }],
			},
		];
		expect(pendingApprovals(replay(asked))).toHaveLength(1);
		const answered = replay([...asked, { type: "approval_resolved", id: "a1", optionId: "allow" }]);
		expect(pendingApprovals(answered)).toHaveLength(0);
		expect(answered.blocks[0]).toMatchObject({ resolved: "allow" });
	});

	it("keeps one plan per turn, replaced as it progresses", () => {
		const transcript = replay([
			{ type: "user", text: "do it" },
			{ type: "plan", entries: [{ text: "Read", status: "in_progress" }] },
			{ type: "message", text: "ok" },
			{ type: "plan", entries: [{ text: "Read", status: "completed" }] },
			{ type: "user", text: "again" },
			{ type: "plan", entries: [{ text: "Write", status: "pending" }] },
		]);
		const plans = transcript.blocks.filter((block) => block.kind === "plan");
		expect(plans).toHaveLength(2);
		expect(plans[0]).toMatchObject({ entries: [{ text: "Read", status: "completed" }] });
	});

	it("collects models, modes and usage, and shows failed or stopped turns", () => {
		const transcript = replay([
			{
				type: "info",
				models: [{ id: "m1", name: "M1" }],
				model: "m1",
				modes: [{ id: "ask", name: "Ask" }],
				mode: "ask",
			},
			{ type: "info", model: "m2" },
			{ type: "usage", inputTokens: 10 },
			{ type: "usage", contextUsed: 500, contextWindow: 1000 },
			{ type: "turn_end", reason: "error", error: "Boom" },
			{ type: "turn_end", reason: "cancelled" },
		]);
		expect(transcript.model).toBe("m2");
		expect(transcript.models).toEqual([{ id: "m1", name: "M1" }]);
		expect(transcript.mode).toBe("ask");
		expect(transcript.usage).toMatchObject({
			inputTokens: 10,
			contextUsed: 500,
			contextWindow: 1000,
		});
		expect(transcript.blocks).toMatchObject([
			{ kind: "notice", tone: "error", text: "Boom" },
			{ kind: "notice", tone: "muted", text: "Stopped." },
		]);
	});

	it("marks only a turn the runner calls retryable as worth sending again", () => {
		const transcript = replay([
			{ type: "user", text: "Ship it" },
			// Said while working: worth reading, not worth resending the message for.
			{ type: "error", message: "Antigravity was not allowed to use: RunCommand." },
			{ type: "turn_end", reason: "error", error: "Codex is at capacity", retryable: true },
			{ type: "turn_end", reason: "cancelled" },
			// A failure resending cannot fix, however it ended.
			{ type: "turn_end", reason: "error", error: "Exit code 1: something broke" },
			{ type: "turn_end", reason: "error", error: "Boom", retryable: false },
		]);
		const notices = transcript.blocks.filter(
			(block): block is Extract<Block, { kind: "notice" }> => block.kind === "notice",
		);
		expect(notices.map((notice) => [notice.tone, notice.retry ?? false])).toEqual([
			["error", false],
			["error", true],
			["muted", false],
			["error", false],
			["error", false],
		]);
		expect(notices[1].text).toBe("Codex is at capacity");
	});
});

describe("the agent's command list", () => {
	const list: ChatEvent = {
		type: "commands",
		commands: [{ name: "compact", description: "Summarise the conversation" }],
	};

	it("is not a row in the conversation, and the latest list wins", () => {
		const first = applyEvent(emptyTranscript(), list);
		expect(first.blocks).toEqual([]);
		expect(first.commands).toEqual([
			{ name: "compact", description: "Summarise the conversation" },
		]);
		const second = applyEvent(first, { type: "commands", commands: [] });
		expect(second.commands).toEqual([]);
		// An agent with no commands of its own: nothing is offered under its name.
		expect(second.blocks).toEqual([]);
	});

	it("replays into the list rather than into the log's rows", () => {
		const transcript = replay([{ type: "user", text: "hi" }, list]);
		expect(transcript.blocks.map((block) => block.kind)).toEqual(["user"]);
		expect(transcript.commands).toHaveLength(1);
	});
});

describe("tool call summaries", () => {
	const tool = (event: Extract<ChatEvent, { type: "tool" }>): ChatEvent => event;
	const events: ChatEvent[] = [
		{ type: "user", text: "tighten the rows" },
		tool({
			type: "tool",
			id: "a",
			kind: "read",
			title: "Read src/lib/density.ts",
			status: "completed",
		}),
		tool({
			type: "tool",
			id: "b",
			kind: "edit",
			title: "Edit",
			input: JSON.stringify({ file_path: "/repo/src/lib/density.ts" }),
			status: "completed",
		}),
		tool({ type: "tool", id: "c", kind: "execute", title: "bun test", status: "completed" }),
		{ type: "message", text: "Done." },
		{ type: "approval", id: "p", title: "Run rm -rf dist?", options: [] },
		tool({ type: "tool", id: "d", kind: "search", title: "grep contrast", status: "completed" }),
	];

	it("groups consecutive tool calls and never folds approvals", () => {
		const rows = groupRows(replay(events).blocks);
		expect(
			rows.map((row) => (row.kind === "work" ? `work:${row.tools.length}` : row.block.kind)),
		).toEqual(["user", "work:3", "assistant", "approval", "work:1"]);
	});

	it("names each call by what it touched", () => {
		const blocks = replay(events).blocks.filter((block) => block.kind === "tool");
		expect(blocks.map((block) => (block.kind === "tool" ? toolLabel(block) : ""))).toEqual([
			"Read density.ts",
			"Edited density.ts",
			"Ran a command",
			"Searched the project",
		]);
	});

	it("joins distinct actions and counts long runs", () => {
		const rows = groupRows(replay(events).blocks);
		const first = rows[1];
		expect(first.kind === "work" && summariseTools(first.tools)).toBe(
			"Read density.ts · Edited density.ts · Ran a command",
		);
		const reads = ["a.ts", "b.ts", "c.ts", "d.ts"].map((file) => ({
			tool: "read" as const,
			title: `Read ${file}`,
		}));
		expect(summariseTools([...reads, { tool: "execute", title: "ls" }])).toBe(
			"Read 4 files · Ran a command",
		);
		expect(summariseTools([reads[0], reads[0]])).toBe("Read a.ts");
	});
});

describe("turns", () => {
	it("keeps each turn's start, end and outcome on the message that started it", () => {
		const transcript = replay([
			{ type: "user", text: "Fix it" },
			{ type: "turn_start", at: "2026-09-27T10:00:00.000Z" },
			{ type: "message", text: "Done." },
			{ type: "turn_end", reason: "done", at: "2026-09-27T10:00:48.000Z" },
			{ type: "user", text: "Again" },
			{ type: "turn_start" },
		]);
		const turns = groupTurns(transcript.blocks);
		expect(turns).toHaveLength(2);
		expect(turns[0].user).toMatchObject({
			text: "Fix it",
			startedAt: "2026-09-27T10:00:00.000Z",
			endedAt: "2026-09-27T10:00:48.000Z",
			outcome: "done",
		});
		expect(turns[0].rows).toHaveLength(1);
		// An older log without times leaves them unset; the turn is still going.
		expect(turns[1].user?.startedAt).toBeUndefined();
		expect(turns[1].user?.outcome).toBeUndefined();
	});

	it("restates a turn read off a screen with its exact reply, keeping its tools", () => {
		const transcript = replay([
			{ type: "user", text: "Earlier" },
			{ type: "message", text: "Kept as it was." },
			{ type: "user", text: "Say hello" },
			{ type: "turn_start" },
			{ type: "tool", id: "notes", title: "Session notes", status: "completed" },
			{ type: "reasoning", text: "Rea" },
			{ type: "message", text: "hello - one\n" },
			{
				type: "turn_rewrite",
				events: [
					{ type: "reasoning", text: "Reading." },
					{ type: "message", text: "**hello**\n\n- one" },
				],
			},
			{ type: "turn_end", reason: "done" },
		]);
		expect(transcript.blocks.map((block) => [block.key, block.kind])).toEqual([
			["b0", "user"],
			["b1", "assistant"],
			["b2", "user"],
			["b3", "tool"],
			["b4", "reasoning"],
			["b5", "assistant"],
		]);
		expect(transcript.blocks[1]).toMatchObject({ text: "Kept as it was." });
		expect(transcript.blocks[4]).toMatchObject({ text: "Reading." });
		expect(transcript.blocks[5]).toMatchObject({ text: "**hello**\n\n- one" });
	});

	it("restates a turn's tools too, in order, when the rewrite says so", () => {
		const transcript = replay([
			{ type: "user", text: "Look around" },
			{ type: "turn_start" },
			{ type: "tool", id: "notes", title: "Session notes", status: "completed" },
			{ type: "message", text: "I'll read it.\n" },
			{ type: "tool", id: "screen-1", title: "Read", kind: "read", input: "a.ts, b." },
			{ type: "message", text: "Both are" },
			{
				type: "turn_rewrite",
				replaceTools: true,
				events: [
					{ type: "tool", id: "notes", title: "Session notes", status: "completed" },
					{ type: "message", text: "I'll read it." },
					{ type: "tool", id: "ai-1-2", title: "read files", kind: "read", status: "completed" },
					{ type: "message", text: "Both are short." },
				],
			},
		]);
		expect(transcript.blocks.map((block) => block.kind)).toEqual([
			"user",
			"tool",
			"assistant",
			"tool",
			"assistant",
		]);
		expect(transcript.blocks[3]).toMatchObject({ id: "ai-1-2", title: "read files" });
		expect(
			transcript.blocks.some((block) => block.kind === "tool" && block.id === "screen-1"),
		).toBe(false);
		expect(transcript.blocks[4]).toMatchObject({ text: "Both are short." });
	});

	it("reads durations the short way", () => {
		expect(formatDuration(48_000)).toBe("48s");
		expect(formatDuration(88_000)).toBe("1m 28s");
		expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe("2h 5m");
	});

	it("counts a long run of steps, edits by distinct file", () => {
		const tool = (kind: "read" | "edit" | "execute", path: string) => ({
			tool: kind,
			title: path,
			input: JSON.stringify({ path }),
		});
		expect(
			countWork([
				tool("edit", "a.ts"),
				tool("edit", "a.ts"),
				tool("edit", "b.ts"),
				tool("execute", "bun test"),
				tool("read", "c.ts"),
			]),
		).toBe("5 steps, edited 2 files, ran 1 command");
	});
});

it("replays attachment metadata on its user turn", () => {
	const attachments = [{ id: "file", name: "shot.png", mimeType: "image/png", size: 12 }];
	expect(replay([{ type: "user", text: "see this", attachments }]).blocks[0]).toMatchObject({
		kind: "user",
		text: "see this",
		attachments,
	});
});
