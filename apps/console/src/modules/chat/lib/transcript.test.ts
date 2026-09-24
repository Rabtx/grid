import { describe, expect, it } from "vitest";

import type { ChatEvent } from "../types/chat.types";
import { pendingApprovals, replay } from "./transcript";

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
});
