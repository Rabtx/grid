import { cached, effortChoices, resolveEffort, runCli } from "./catalog";
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

/**
 * The id `agy --model` takes for a model and effort: `gemini-3.8-flash` + `low` →
 * `gemini-3.8-flash-low`. With the model's own entry the effort resolves through
 * `resolveEffort`, so a model that has levels always carries a valid one — `agy` refuses
 * `--model gemini-3.8-flash` with `requires --effort`, and never sees an empty one here.
 */
export function agyModelId(
	model: string | undefined,
	effort: string | undefined,
	modelChoice?: Choice,
): string | undefined {
	if (!model) return undefined;
	const resolved = modelChoice ? resolveEffort(modelChoice, effort) : effort;
	return resolved ? `${model}-${resolved}` : model;
}

export function agyArgs(
	binary: string,
	input: { model?: string; mode?: string; resume?: string; cwd?: string },
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
	// Antigravity ignores the process's folder: without this it works with no workspace at all.
	if (input.cwd) args.push("--add-dir", input.cwd);
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
	/** The model list to settle effort against; the CLI's own `agy models` by default. */
	loadModels?: () => Promise<Choice[]>;
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
		catalog: async (fresh) => ({ models: await models(fresh), modes: MODES }),
		start: async (context) =>
			startAgySession(options.binary, spawn, context, options.loadModels ?? models),
	};
}

async function startAgySession(
	binary: string,
	spawn: Spawn,
	context: AgentContext,
	loadModels: () => Promise<Choice[]>,
): Promise<AgentSession> {
	let model = context.model;
	let effort = context.effort;
	let mode = context.mode;
	let resume = context.resume;
	/** The current model's entry in the agent's list, once we have asked for it. */
	let choice: Choice | undefined;
	let listed: Choice[] | undefined;
	let proc: JsonProcess | null = null;
	let finishTurn: ((result: TurnResult) => void) | null = null;
	let stderr: string[] = [];

	// A model with effort levels needs one, or `agy` refuses the run: settle it against the
	// agent's own list before the process starts — the chosen effort, else the model's default,
	// else its middle level. The list is kept for the session once it has answered; a list that
	// failed is asked for again on the next model or effort change.
	async function settleEffort(): Promise<void> {
		if (!model) {
			effort = effort || undefined;
			return;
		}
		if (!listed) {
			listed = await loadModels().catch((cause: unknown) => {
				console.warn(
					"[runner] Antigravity did not list its models:",
					cause instanceof Error ? cause.message : cause,
				);
				return undefined;
			});
		}
		choice = listed?.find((entry) => entry.id === model);
		effort = resolveEffort(choice, effort);
	}

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
		const started = spawn(
			agyArgs(binary, { model: agyModelId(model, effort, choice), mode, resume, cwd: context.cwd }),
			{
				cwd: context.cwd,
				env: context.env,
				onMessage: (message) => handle(message as Record<string, unknown>),
				onStderr: (line) => {
					stderr.push(line);
					if (stderr.length > 20) stderr.shift();
				},
			},
		);
		void started.exited.then((code) => {
			// Only the process still in charge may end the turn. `restart` asks one to stop and the
			// next starts another, and being asked to stop takes a moment: the old exit arrives
			// after the new turn has begun, and ending that one instead threw its real result away.
			if (proc !== started) return;
			proc = null;
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
		// The turn in flight did not crash, we asked for this exit: claim its result first, or the
		// `exited` handler above would report it as "Antigravity exited (code 143)".
		const stopping = finishTurn;
		finishTurn = null;
		proc?.kill();
		proc = null;
		stopping?.({ reason: "cancelled" });
	}

	await settleEffort();
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
			restart();
		},
		approve: () => {},
		setModel: async (next) => {
			model = next;
			// The new model may want another effort, or none at all.
			await settleEffort();
			restart();
			context.emit({ type: "info", model: next, ...(effort ? { effort } : {}) });
		},
		setMode: async (next) => {
			mode = next;
			restart();
			context.emit({ type: "info", mode: next });
		},
		setEffort: async (next) => {
			effort = next;
			// Kept as it will be sent: a level the model has, never "".
			await settleEffort();
			restart();
			context.emit({ type: "info", ...(effort ? { effort } : {}) });
		},
		close: () => proc?.kill(),
	};
}
