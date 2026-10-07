import { describe, expect, it } from "bun:test";

import { agyArgs, agyModelId, antigravityProvider, parseAgyModels } from "./antigravity";
import { claudeModelChoice, claudeModels } from "./claude";
import { effortChoices } from "./catalog";
import type { ChatEvent, Choice } from "./events";
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

describe("every Claude model Claude Code can run", () => {
	// Rows as Claude Code 2.1.292 lists them: its picker signed in to Anthropic, and its full list.
	const picker = [
		{
			value: "default",
			resolvedModel: "claude-opus-5-5",
			description: "Opus 5.5 · Best for everyday, complex tasks",
		},
		{
			value: "opus",
			resolvedModel: "claude-opus-5-5",
			description: "Opus 5.5 · Best for everyday, complex tasks",
		},
		{
			value: "claude-fable-5-1[1m]",
			resolvedModel: "claude-fable-5-1",
			description: "Fable 5.1 · Most capable for your hardest and longest-running tasks",
		},
		{
			value: "claude-haiku-5-5",
			resolvedModel: "claude-haiku-5-5",
			description: "Update Claude Code to use this model",
			disabled: true,
		},
	];
	const lineup = [
		{ value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default" },
		{ value: "claude-opus-5-5", displayName: "Opus", description: "Opus 5.5 · Best" },
		{ value: "claude-fable-5-1", displayName: "Fable", description: "Fable 5.1 · Most capable" },
		{ value: "claude-opus-4-8", displayName: "Opus 4.8", description: "Opus 4.8 · Legacy" },
		{
			value: "claude-sonnet-4-6[1m]",
			displayName: "Sonnet 4.6 (1M context)",
			description: "Sonnet 4.6 for long sessions",
		},
		{ value: "claude-opus-4-1", displayName: "Opus 4.1", description: "Opus 4.1 · Legacy" },
		{ value: "haiku", resolvedModel: "claude-haiku-4-5@20251001", displayName: "Haiku" },
	];

	it("lists the picker's rows first, then every other version once, by version", () => {
		const models = claudeModels(picker, lineup);
		expect(models.map((model) => [model.group, model.id, model.name])).toEqual([
			["Claude Code", "default", "Default · Opus 5.5"],
			["Claude Code", "opus", "Opus 5.5"],
			["Claude Code", "claude-fable-5-1[1m]", "Fable 5.1 (1M context)"],
			["More versions", "claude-fable-5-1", "Fable 5.1"],
			["More versions", "claude-opus-4-8", "Opus 4.8"],
			["More versions", "claude-sonnet-4-6[1m]", "Sonnet 4.6 (1M context)"],
			["More versions", "claude-opus-4-1", "Opus 4.1"],
		]);
	});

	it("is the picker alone when the full list could not be had", () => {
		expect(claudeModels(picker, []).map((model) => model.id)).toEqual([
			"default",
			"opus",
			"claude-fable-5-1[1m]",
		]);
		expect(claudeModels(picker, [])[0].group).toBeUndefined();
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

	it("gives a model that needs an effort a valid one, never an empty one", () => {
		const models = parseAgyModels(listing);
		const flash = models.find((model) => model.id === "gemini-3.8-flash") as Choice;
		const thinking = models.find((model) => model.id === "claude-opus-4-6-thinking") as Choice;
		// The chat never chose one: the model's own default.
		expect(agyModelId("gemini-3.8-flash", undefined, flash)).toBe("gemini-3.8-flash-high");
		// A level the model still offers stands.
		expect(agyModelId("gemini-3.8-flash", "low", flash)).toBe("gemini-3.8-flash-low");
		// A level it no longer offers falls back to its default.
		expect(agyModelId("gemini-3.8-flash", "ultra", flash)).toBe("gemini-3.8-flash-high");
		// No default in sight: the middle of its levels.
		expect(
			agyModelId("gemini-3.8-flash", undefined, {
				id: "gemini-3.8-flash",
				name: "Gemini 3.8 Flash",
				efforts: effortChoices(["low", "medium", "high"]),
			}),
		).toBe("gemini-3.8-flash-medium");
		// A model with no levels takes no effort, a chosen one included.
		expect(agyModelId("claude-opus-4-6-thinking", "high", thinking)).toBe(
			"claude-opus-4-6-thinking",
		);
		// The list is not there to ask: the chosen effort is all we know.
		expect(agyModelId("gemini-3.8-flash", undefined)).toBe("gemini-3.8-flash");
	});

	it("builds a run whose model carries its effort, and never an empty one", () => {
		const flash = parseAgyModels(listing).find(
			(model) => model.id === "gemini-3.8-flash",
		) as Choice;
		const args = agyArgs("agy", { model: agyModelId("gemini-3.8-flash", undefined, flash) });
		expect(args.slice(args.indexOf("--model"))).toEqual(["--model", "gemini-3.8-flash-high"]);
		expect(args).not.toContain("");
		expect(args).not.toContain("--effort");
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

	it("opens the project's folder as Antigravity's workspace", () => {
		expect(agyArgs("agy", { cwd: "/home/me/Projects/grid" }).slice(-2)).toEqual([
			"--add-dir",
			"/home/me/Projects/grid",
		]);
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
			// Never touch the real `agy` from a test.
			loadModels: async () => parseAgyModels(listing),
		}).start({
			cwd: "/tmp",
			model: "gemini-3.8-flash",
			effort: "low",
			emit: (event) => events.push(event),
			onResumeToken: (token) => tokens.push(token),
		});
		expect(await session.prompt("list files")).toEqual({ reason: "done" });
		expect(commands).toContain("gemini-3.8-flash-low");
		expect(events[0]).toMatchObject({ type: "info", model: "gemini-3.8-flash", effort: "low" });
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

	it("settles the effort against the model's own list when a chat never chose one", async () => {
		let command: string[] = [];
		const spawn: Spawn = (cmd, { onMessage }) => {
			command = cmd;
			const proc: JsonProcess = {
				send: () => {
					queueMicrotask(() =>
						onMessage({ event: "result", result: { status: "SUCCESS", conversation_id: "c1" } }),
					);
				},
				kill: () => {},
				exited: new Promise(() => {}),
			};
			return proc;
		};
		const events: ChatEvent[] = [];
		const session = await antigravityProvider({
			binary: "agy",
			available: () => true,
			spawn,
			loadModels: async () => parseAgyModels(listing),
		}).start({
			cwd: "/tmp",
			model: "gemini-3.8-flash",
			emit: (event) => events.push(event),
			onResumeToken: () => {},
		});
		// No effort chosen: the model's own default, which `agy` will accept.
		expect(events[0]).toMatchObject({
			type: "info",
			model: "gemini-3.8-flash",
			effort: "high",
		});
		await session.prompt("hi");
		expect(command.slice(command.indexOf("--model"), command.indexOf("--model") + 2)).toEqual([
			"--model",
			"gemini-3.8-flash-high",
		]);
		// Switching to a model without levels takes the effort away instead of guessing one.
		await session.setModel("claude-opus-4-6-thinking");
		expect(events.at(-1)).toEqual({
			type: "info",
			model: "claude-opus-4-6-thinking",
		});
		// An effort asked of a model without levels is not kept, and never reported as "".
		await session.setEffort("low");
		expect(events.at(-1)).toEqual({ type: "info" });
		await session.prompt("hi");
		expect(command).toContain("claude-opus-4-6-thinking");
	});

	it("asks for the model list again after it failed, and never sends an empty effort", async () => {
		let command: string[] = [];
		const spawn: Spawn = (cmd, { onMessage }) => {
			command = cmd;
			const proc: JsonProcess = {
				send: () => {
					queueMicrotask(() =>
						onMessage({ event: "result", result: { status: "SUCCESS", conversation_id: "c1" } }),
					);
				},
				kill: () => {},
				exited: new Promise(() => {}),
			};
			return proc;
		};
		let asked = 0;
		const events: ChatEvent[] = [];
		const session = await antigravityProvider({
			binary: "agy",
			available: () => true,
			spawn,
			loadModels: async () => {
				asked++;
				if (asked === 1) throw new Error("agy models timed out");
				return parseAgyModels(listing);
			},
		}).start({
			cwd: "/tmp",
			model: "gemini-3.8-flash",
			effort: "",
			emit: (event) => events.push(event),
			onResumeToken: () => {},
		});
		// No list to settle against, and "" is no effort at all.
		expect(events[0]).not.toHaveProperty("effort");
		await session.prompt("hi");
		expect(command).not.toContain("");
		// The next change asks again, and this time the model's default comes back.
		await session.setEffort("");
		expect(asked).toBe(2);
		expect(events.at(-1)).toEqual({ type: "info", effort: "high" });
		await session.prompt("hi");
		expect(command).toContain("gemini-3.8-flash-high");
		// Once it has answered, it is not asked again.
		await session.setModel("gemini-3.8-flash");
		expect(asked).toBe(2);
	});
});
