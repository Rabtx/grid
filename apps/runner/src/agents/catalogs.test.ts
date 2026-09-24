import { describe, expect, it } from "bun:test";

import { agyArgs, agyModelId, antigravityProvider, parseAgyModels } from "./antigravity";
import { claudeModelChoice } from "./claude";
import type { ChatEvent } from "./events";
import { parseOpencodeModels } from "./opencode";
import type { JsonProcess, Spawn } from "./stdio";

describe("Claude Code's model list", () => {
	it("names models exactly, with the resolved id and their effort levels", () => {
		expect(
			claudeModelChoice({
				value: "opus[1m]",
				resolvedModel: "claude-opus-5-5[1m]",
				displayName: "Opus (1M context)",
				description: "Opus 5.5 with 1M context · Best for everyday, complex tasks",
				supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
			}),
		).toEqual({
			id: "opus[1m]",
			name: "Opus 5.5 (1M context)",
			description: "claude-opus-5-5 · Best for everyday, complex tasks",
			efforts: [
				{ id: "low", name: "Low" },
				{ id: "medium", name: "Medium" },
				{ id: "high", name: "High" },
				{ id: "xhigh", name: "Extra high" },
				{ id: "max", name: "Max" },
			],
			defaultEffort: "high",
		});
		expect(
			claudeModelChoice({
				value: "haiku",
				resolvedModel: "claude-haiku-4-5-20251001",
				description: "Haiku 4.5 · Fastest for quick answers",
			}),
		).toEqual({
			id: "haiku",
			name: "Haiku 4.5",
			description: "claude-haiku-4-5-20251001 · Fastest for quick answers",
		});
		expect(
			claudeModelChoice({ value: "default", description: "Opus 5.5 with 1M context · Best" })?.name,
		).toBe("Default · Opus 5.5 (1M context)");
	});
});

describe("opencode's model list", () => {
	it("reads names, providers, cost, context and effort variants", () => {
		const text = [
			"opencode/big-pickle",
			JSON.stringify(
				{
					id: "big-pickle",
					providerID: "opencode",
					name: "Big Pickle",
					cost: { input: 0, output: 0 },
					limit: { context: 200000 },
					variants: {},
				},
				null,
				2,
			),
			"openai/gpt-6",
			JSON.stringify(
				{
					id: "gpt-6",
					providerID: "openai",
					name: "GPT-6",
					cost: { input: 2, output: 8 },
					limit: { context: 1_050_000 },
					variants: { high: {}, low: {}, minimal: {}, medium: {} },
				},
				null,
				2,
			),
		].join("\n");
		expect(parseOpencodeModels(text)).toEqual([
			{
				id: "opencode/big-pickle",
				name: "Big Pickle",
				group: "opencode",
				description: "opencode/big-pickle · free · 200K context",
			},
			{
				id: "openai/gpt-6",
				name: "GPT-6",
				group: "openai",
				description: "openai/gpt-6 · 1.1M context",
				efforts: [
					{ id: "minimal", name: "Minimal" },
					{ id: "low", name: "Low" },
					{ id: "medium", name: "Medium" },
					{ id: "high", name: "High" },
				],
				defaultEffort: "medium",
			},
		]);
	});
});

describe("Antigravity", () => {
	const listing = [
		"gemini-3.8-flash-high\tGemini 3.8 Flash (High)",
		"gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)",
		"gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
		"claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)",
	].join("\n");

	it("groups one model at several efforts into one entry with effort levels", () => {
		const models = parseAgyModels(listing);
		expect(
			models.map((model) => [model.id, model.name, model.efforts?.map((effort) => effort.id)]),
		).toEqual([
			["gemini-3.8-flash", "Gemini 3.8 Flash", ["low", "medium", "high"]],
			["claude-opus-4-6-thinking", "Claude Opus 4.6 (Thinking)", undefined],
		]);
		expect(agyModelId("gemini-3.8-flash", "low")).toBe("gemini-3.8-flash-low");
		expect(agyModelId("claude-opus-4-6-thinking", undefined)).toBe("claude-opus-4-6-thinking");
	});

	it("maps modes onto the CLI's flags", () => {
		expect(
			agyArgs("agy", { model: "gemini-3.8-flash-low", mode: "full-access", resume: "c1" }),
		).toEqual([
			"agy",
			"--input-format",
			"stream-json",
			"--output-format",
			"stream-json",
			"--print=",
			"--model",
			"gemini-3.8-flash-low",
			"--dangerously-skip-permissions",
			"--conversation",
			"c1",
		]);
		expect(agyArgs("agy", { mode: "plan" })).toContain("plan");
	});

	it("streams a turn: text, a tool, usage, and a note when a tool was refused", async () => {
		const sent: unknown[] = [];
		let commands: string[] = [];
		const spawn: Spawn = (command, { onMessage }) => {
			commands = command;
			const proc: JsonProcess = {
				send: (message) => {
					sent.push(message);
					queueMicrotask(() => {
						onMessage({ event: "init", conversation_id: "conv-1" });
						onMessage({
							event: "step_update",
							step_update: {
								step_index: 1,
								state: "DONE",
								step_type: "agent_response",
								text_delta: "Checking.",
							},
						});
						onMessage({
							event: "step_update",
							step_update: {
								step_index: 2,
								state: "ACTIVE",
								step_type: "tool",
								tool_info: { name: "run_command", parameters: { CommandLine: "ls" } },
							},
						});
						onMessage({
							event: "step_update",
							step_update: {
								step_index: 2,
								state: "ERROR",
								step_type: "tool",
								tool_info: {
									name: "run_command",
									parameters: { CommandLine: "ls" },
									error: { message: "denied" },
								},
							},
						});
						onMessage({
							event: "result",
							result: {
								status: "SUCCESS",
								conversation_id: "conv-1",
								usage: { input_tokens: 100, output_tokens: 5, thinking_tokens: 2 },
								denied_actions: [{ action: "command", display_name: "RunCommand" }],
							},
						});
					});
				},
				kill: () => {},
				exited: new Promise(() => {}),
			};
			return proc;
		};
		const events: ChatEvent[] = [];
		const tokens: string[] = [];
		const session = await antigravityProvider({
			binary: "agy",
			available: () => true,
			spawn,
		}).start({
			cwd: "/tmp",
			model: "gemini-3.8-flash",
			effort: "low",
			emit: (event) => events.push(event),
			onResumeToken: (token) => tokens.push(token),
		});
		expect(await session.prompt("list files")).toEqual({ reason: "done" });
		expect(commands).toContain("gemini-3.8-flash-low");
		expect(sent).toEqual([{ event: "user", message: { content: "list files" } }]);
		expect(tokens.at(-1)).toBe("conv-1");
		expect(events.filter((event) => event.type !== "info").map((event) => event.type)).toEqual([
			"message",
			"tool",
			"tool",
			"usage",
			"error",
		]);
		expect(
			events.find((event) => event.type === "tool" && event.status === "failed"),
		).toMatchObject({ title: "Run a command", input: "ls", output: "denied" });
		expect(events.find((event) => event.type === "usage")).toEqual({
			type: "usage",
			inputTokens: 100,
			outputTokens: 7,
		});
	});
});
