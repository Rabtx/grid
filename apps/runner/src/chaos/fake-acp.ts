/**
 * A stand-in for an ACP agent (Gemini CLI, opencode), speaking the Agent Client Protocol over
 * stdio, for the console's end-to-end tests and for trying the console against agents other than
 * Claude Code without their accounts. `FAKE_ACP_AS` says which: `opencode` (with its `opencode
 * models --verbose` catalog: many providers, effort variants, context sizes) or `gemini` (two
 * models with thinking levels). A turn streams some thinking, then its answer a word at a time,
 * then reports how much of its context it used; `SLOW:<ms>` makes it think that long.
 *
 *   FAKE_ACP_AS=opencode bun fake-acp.ts acp
 *   FAKE_ACP_AS=opencode bun fake-acp.ts models --verbose
 */
import { createInterface } from "node:readline";

type Option = { value: string; name: string; description?: string };

const as = process.env.FAKE_ACP_AS === "gemini" ? "gemini" : "opencode";

/** Each agent's models, their effort levels and context windows. */
const MODELS: Record<
	string,
	{ id: string; name: string; provider: string; context: number; levels: string[] }[]
> = {
	opencode: [
		{
			id: "opencode/big-pickle",
			name: "Big Pickle",
			provider: "opencode",
			context: 200_000,
			levels: [],
		},
		{
			id: "deepseek/deepseek-v3.2",
			name: "DeepSeek V3.2",
			provider: "deepseek",
			context: 128_000,
			levels: ["low", "medium", "high"],
		},
		{
			id: "google/gemini-3-pro",
			name: "Gemini 3 Pro",
			provider: "google",
			context: 1_000_000,
			levels: ["low", "high"],
		},
		{
			id: "openai/gpt-6",
			name: "GPT-6",
			provider: "openai",
			context: 400_000,
			levels: ["minimal", "low", "medium", "high"],
		},
		{
			id: "openrouter/qwen/qwen3-coder",
			name: "Qwen3 Coder",
			provider: "openrouter",
			context: 256_000,
			levels: [],
		},
	],
	gemini: [
		{
			id: "gemini-3-pro",
			name: "Gemini 3 Pro",
			provider: "google",
			context: 1_000_000,
			levels: ["low", "high"],
		},
		{
			id: "gemini-3-flash",
			name: "Gemini 3 Flash",
			provider: "google",
			context: 1_000_000,
			levels: ["low", "medium", "high"],
		},
	],
};

const models = MODELS[as] ?? [];

// `opencode models --verbose`: an id line, then that model's JSON, as the real CLI prints it.
if (process.argv[2] === "models") {
	for (const model of models) {
		const variants = Object.fromEntries(model.levels.map((level) => [level, {}]));
		process.stdout.write(
			`${model.id}\n${JSON.stringify(
				{
					id: model.id.split("/").slice(1).join("/"),
					providerID: model.provider,
					name: model.name,
					cost:
						model.id === "opencode/big-pickle" ? { input: 0, output: 0 } : { input: 1, output: 4 },
					limit: { context: model.context },
					variants,
				},
				null,
				2,
			)}\n`,
		);
	}
	process.exit(0);
}

let model = models[0]?.id ?? "";
let effort = models[0]?.levels.at(-1) ?? "";
let mode = "build";
let used = 18_000;
let cancelled = false;

const send = (message: Record<string, unknown>) =>
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
const update = (sessionId: string, value: Record<string, unknown>) =>
	send({ method: "session/update", params: { sessionId, update: value } });

function configOptions(): Record<string, unknown>[] {
	const current = models.find((item) => item.id === model);
	const options: Record<string, unknown>[] = [
		{
			id: "model",
			category: "model",
			currentValue: model,
			options: models.map((item): Option => ({ value: item.id, name: item.name })),
		},
		{
			id: "mode",
			category: "mode",
			currentValue: mode,
			options: [
				{ value: "build", name: "Build", description: "Edits files and runs commands" },
				{ value: "plan", name: "Plan", description: "Reads and plans; changes nothing" },
			],
		},
	];
	if (current?.levels.length)
		options.push({
			id: "effort",
			category: "thought_level",
			currentValue: current.levels.includes(effort) ? effort : current.levels.at(-1),
			options: current.levels.map((level): Option => ({
				value: level,
				name: level[0]?.toUpperCase() + level.slice(1),
			})),
		});
	return options;
}

async function prompt(id: number | string, sessionId: string, text: string): Promise<void> {
	cancelled = false;
	const slow = Number(/SLOW:(\d+)/.exec(text)?.[1] ?? 0);
	const name = models.find((item) => item.id === model)?.name ?? model;
	for (const thought of [
		"Reading the question. ",
		"Looking at the project. ",
		"Planning the answer.",
	]) {
		update(sessionId, {
			sessionUpdate: "agent_thought_chunk",
			content: { type: "text", text: thought },
		});
		await Bun.sleep(slow / 3 || 40);
		if (cancelled) {
			send({ id, result: { stopReason: "cancelled" } });
			return;
		}
	}
	const asked = text.trim().split("\n").at(-1)?.slice(0, 60) ?? "";
	const answer = `${name} (${as}) here: ${asked}`;
	for (const word of answer.split(/(?<= )/)) {
		update(sessionId, {
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: word },
		});
		await Bun.sleep(15);
	}
	used += 6_000;
	const context = models.find((item) => item.id === model)?.context ?? 200_000;
	update(sessionId, { sessionUpdate: "usage_update", used, size: context });
	send({ id, result: { stopReason: "end_turn" } });
}

for await (const line of createInterface({ input: process.stdin })) {
	if (!line.trim()) continue;
	const message = JSON.parse(line) as {
		id?: number | string;
		method?: string;
		params?: Record<string, unknown>;
	};
	const { id, method, params = {} } = message;
	if (method === "initialize") {
		send({
			id,
			result: {
				protocolVersion: 1,
				agentCapabilities: { loadSession: true, promptCapabilities: { image: false } },
				authMethods: [],
			},
		});
	} else if (method === "session/new" || method === "session/load") {
		const sessionId = String(params.sessionId ?? crypto.randomUUID());
		send({ id, result: { sessionId, configOptions: configOptions() } });
		update(sessionId, {
			sessionUpdate: "available_commands_update",
			availableCommands: [{ name: "compact", description: "Summarise the conversation" }],
		});
	} else if (method === "session/set_config_option") {
		const value = String(params.value ?? "");
		if (params.configId === "model") model = value;
		else if (params.configId === "mode") mode = value;
		else if (params.configId === "effort") effort = value;
		send({ id, result: { configOptions: configOptions() } });
	} else if (method === "session/prompt") {
		const blocks = (params.prompt as { type: string; text?: string }[] | undefined) ?? [];
		const text = blocks.map((block) => block.text ?? "").join("\n");
		void prompt(id ?? 0, String(params.sessionId ?? ""), text);
	} else if (method === "session/cancel") {
		cancelled = true;
	} else if (id !== undefined) {
		send({ id, error: { code: -32601, message: `${method} is not supported` } });
	}
}
