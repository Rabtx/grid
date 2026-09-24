import { cached, effortChoices, runCli } from "./catalog";
import { type Choice, clip, type ToolKind } from "./events";
import type { AgentContext, AgentSession, Provider, ProviderInfo, TurnResult } from "./provider";
import { type JsonProcess, type Spawn, spawnJsonProcess } from "./stdio";

/**
 * Antigravity's CLI (`agy`) in its headless stream-json mode: one long-lived process per chat,
 * a `{"event":"user"}` line per turn in, typed `step_update` / `result` events out. Headless
 * `agy` cannot ask for permission, so the modes decide up front what it may do.
 */

const MODES: Choice[] = [
	{
		id: "default",
		name: "Default",
		description: "Tools your Antigravity settings allow; others are refused",
	},
	{ id: "accept-edits", name: "Accept edits", description: "Edit files without asking" },
	{ id: "plan", name: "Plan", description: "Read and plan only; no changes" },
	{ id: "full-access", name: "Full access", description: "Allow every tool, commands included" },
];

/**
 * `agy models` prints `id<TAB>Name (Effort)`. The same model at several efforts becomes one entry
 * with effort levels ("Gemini 3.8 Flash" · High / Medium / Low); the chosen id is `base-effort`.
 */
export function parseAgyModels(text: string): Choice[] {
	const byBase = new Map<string, { name: string; levels: string[] }>();
	const order: string[] = [];
	for (const line of text.split("\n")) {
		const [id, label] = line.split("\t").map((part) => part?.trim());
		if (!id || !label) continue;
		const match = label.match(/^(.*?) \((High|Medium|Low)\)$/);
		const effort = match?.[2]?.toLowerCase();
		const base = effort && id.endsWith(`-${effort}`) ? id.slice(0, -effort.length - 1) : id;
		const name = match && effort ? match[1] : label;
		let entry = byBase.get(base);
		if (!entry) {
			entry = { name, levels: [] };
			byBase.set(base, entry);
			order.push(base);
		}
		if (effort) entry.levels.push(effort);
	}
	return order.map((base) => {
		const { name, levels } = byBase.get(base) as { name: string; levels: string[] };
		return {
			id: base,
			name,
			description: levels.length ? undefined : base,
			...(levels.length
				? {
						efforts: effortChoices(levels),
						defaultEffort: levels.includes("high") ? "high" : levels[0],
					}
				: {}),
		};
	});
}

/** The id `agy --model` takes for a model and effort: `gemini-3.8-flash` + `low` → `gemini-3.8-flash-low`. */
export function agyModelId(
	model: string | undefined,
	effort: string | undefined,
): string | undefined {
	if (!model) return undefined;
	return effort ? `${model}-${effort}` : model;
}

export function agyArgs(
	binary: string,
	input: { model?: string; mode?: string; resume?: string },
): string[] {
	const args = [
		binary,
		"--input-format",
		"stream-json",
		"--output-format",
		"stream-json",
		"--print=",
	];
	if (input.model) args.push("--model", input.model);
	if (input.mode === "accept-edits" || input.mode === "plan") args.push("--mode", input.mode);
	if (input.mode === "full-access") args.push("--dangerously-skip-permissions");
	if (input.resume) args.push("--conversation", input.resume);
	return args;
}

function toolKind(name: string): ToolKind {
	if (/^(view_file|read|list_dir|find_by_name)/.test(name)) return "read";
	if (/(write|edit|replace|create)_?file|write_to_file|replace_file_content/.test(name))
		return "edit";
	if (/command|shell|terminal/.test(name)) return "execute";
	if (/search|grep|find/.test(name)) return "search";
	if (/browser|url|web|fetch/.test(name)) return "fetch";
	return "other";
}

/** "run_command" + {CommandLine: "ls"} → a title and the detail worth showing. */
function describeTool(
	name: string,
	parameters: Record<string, unknown>,
): { title: string; detail?: string } {
	const first = (...keys: string[]) =>
		keys.map((key) => parameters[key]).find((value) => typeof value === "string") as
			| string
			| undefined;
	const command = first("CommandLine", "command");
	if (command) return { title: "Run a command", detail: command };
	const path = first("AbsolutePath", "TargetFile", "FilePath", "path", "DirectoryPath");
	const readable = name.replace(/_/g, " ");
	if (path)
		return {
			title: `${readable.charAt(0).toUpperCase()}${readable.slice(1)} ${path}`,
			detail: path,
		};
	const query = first("Query", "query", "Pattern", "SearchPath", "Url", "url");
	return { title: readable.charAt(0).toUpperCase() + readable.slice(1), detail: query };
}

type StepUpdate = {
	step_index?: number;
	state?: string;
	step_type?: string;
	text_delta?: string;
	tool_name?: string;
	tool_info?: {
		name?: string;
		parameters?: Record<string, unknown>;
		output?: unknown;
		error?: { message?: string };
	};
};

type ResultEvent = {
	status?: string;
	error?: string;
	conversation_id?: string;
	usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number };
	denied_actions?: { action?: string; display_name?: string }[];
};

export function antigravityProvider(options: {
	binary: string;
	available: () => boolean;
	spawn?: Spawn;
}): Provider {
	const spawn = options.spawn ?? spawnJsonProcess;
	const info = (): ProviderInfo => ({
		id: "antigravity",
		name: "Antigravity",
		available: options.available(),
		models: [],
		modes: MODES,
		defaultMode: "default",
	});
	const models = cached(10 * 60 * 1000, async () =>
		parseAgyModels(await runCli([options.binary, "models"], 30_000)),
	);
	return {
		info,
		catalog: async () => ({ models: await models(), modes: MODES }),
		start: async (context) => startAgySession(options.binary, spawn, context),
	};
}

async function startAgySession(
	binary: string,
	spawn: Spawn,
	context: AgentContext,
): Promise<AgentSession> {
	let model = context.model;
	let effort = context.effort;
	let mode = context.mode;
	let resume = context.resume;
	let proc: JsonProcess | null = null;
	let finishTurn: ((result: TurnResult) => void) | null = null;
	let stderr: string[] = [];

	function handle(message: Record<string, unknown>): void {
		const event = message.event;
		if (event === "init" && typeof message.conversation_id === "string") {
			resume = message.conversation_id;
			context.onResumeToken(message.conversation_id);
			return;
		}
		if (event === "step_update") {
			const step = message.step_update as StepUpdate;
			if (step.step_type === "agent_response" && step.text_delta) {
				context.emit({ type: "message", text: step.text_delta });
			} else if (step.step_type === "tool") {
				const name = step.tool_info?.name ?? step.tool_name ?? "tool";
				const { title, detail } = describeTool(name, step.tool_info?.parameters ?? {});
				const output =
					step.tool_info?.error?.message ??
					(typeof step.tool_info?.output === "string" ? step.tool_info.output : undefined);
				context.emit({
					type: "tool",
					id: `step-${step.step_index ?? 0}`,
					title,
					kind: toolKind(name),
					status:
						step.state === "ERROR" ? "failed" : step.state === "DONE" ? "completed" : "running",
					input: detail,
					output: output ? clip(output) : undefined,
				});
			}
			return;
		}
		if (event === "result") {
			const result = message.result as ResultEvent;
			if (typeof result.conversation_id === "string" && result.conversation_id) {
				resume = result.conversation_id;
				context.onResumeToken(result.conversation_id);
			}
			if (result.usage) {
				context.emit({
					type: "usage",
					inputTokens: result.usage.input_tokens,
					outputTokens: (result.usage.output_tokens ?? 0) + (result.usage.thinking_tokens ?? 0),
				});
			}
			if (result.denied_actions?.length) {
				const names = result.denied_actions
					.map((action) => action.display_name ?? action.action)
					.join(", ");
				context.emit({
					type: "error",
					message: `Antigravity was not allowed to use: ${names}. It cannot ask in chat — switch the mode to Full access, or allow it in your Antigravity settings.`,
				});
			}
			finishTurn?.(
				result.status === "ERROR"
					? { reason: "error", error: result.error ?? "Antigravity failed" }
					: { reason: "done" },
			);
			finishTurn = null;
		}
	}

	function ensureProcess(): JsonProcess {
		if (proc) return proc;
		stderr = [];
		const started = spawn(agyArgs(binary, { model: agyModelId(model, effort), mode, resume }), {
			cwd: context.cwd,
			onMessage: (message) => handle(message as Record<string, unknown>),
			onStderr: (line) => {
				stderr.push(line);
				if (stderr.length > 20) stderr.shift();
			},
		});
		void started.exited.then((code) => {
			if (proc === started) proc = null;
			finishTurn?.({
				reason: "error",
				error: `Antigravity exited (code ${code}). ${stderr.slice(-3).join(" ")}`.trim(),
			});
			finishTurn = null;
		});
		proc = started;
		return started;
	}

	function restart(): void {
		// Takes effect on the next message; `--conversation` continues the same chat.
		proc?.kill();
		proc = null;
	}

	context.emit({
		type: "info",
		modes: MODES,
		mode: mode ?? "default",
		...(model ? { model } : {}),
		...(effort ? { effort } : {}),
	});

	return {
		prompt: (text) =>
			new Promise<TurnResult>((resolve) => {
				finishTurn = resolve;
				ensureProcess().send({ event: "user", message: { content: text } });
			}),
		// Headless agy has no interrupt message; stopping ends the process, and the next message resumes.
		cancel: () => {
			if (!proc) return;
			const stopping = finishTurn;
			finishTurn = null;
			restart();
			stopping?.({ reason: "cancelled" });
		},
		approve: () => {},
		setModel: async (next) => {
			model = next;
			restart();
			context.emit({ type: "info", model: next });
		},
		setMode: async (next) => {
			mode = next;
			restart();
			context.emit({ type: "info", mode: next });
		},
		setEffort: async (next) => {
			effort = next;
			restart();
			context.emit({ type: "info", effort: next });
		},
		close: () => proc?.kill(),
	};
}
