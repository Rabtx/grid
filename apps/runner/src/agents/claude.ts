import { homedir } from "node:os";

import { cached, effortChoices } from "./catalog";
import { agentCommands } from "./commands";
import { type AgentCommand, type Choice, clip, type PlanEntry, type ToolKind } from "./events";
import { diffTexts, type FileDiff } from "./diff";
import type { AgentContext, AgentSession, Provider, ProviderInfo, TurnResult } from "./provider";
import { type JsonProcess, type Spawn, spawnJsonProcess } from "./stdio";

/**
 * Claude Code over its stream-json mode: one long-lived process per session, messages in on
 * stdin, events out on stdout, and permission prompts as `control_request`s answered on stdin.
 * Model and mode changes restart the process on the same conversation (`--resume`).
 */

// Used only if Claude Code cannot be asked for its own list.
const FALLBACK_MODELS: Choice[] = [
	{ id: "default", name: "Default", description: "Whatever Claude Code is set to" },
	{ id: "opus", name: "Opus" },
	{ id: "sonnet", name: "Sonnet" },
	{ id: "haiku", name: "Haiku" },
];

type ListedModel = {
	value?: string;
	resolvedModel?: string;
	displayName?: string;
	description?: string;
	supportsEffort?: boolean;
	supportedEffortLevels?: string[];
	disabled?: boolean;
};

/**
 * Claude Code's own `list_models` row as a picker entry, named by exact model ("Opus 5.5 (1M
 * context)" rather than "Opus"), with the resolved model id and its effort levels.
 */
export function claudeModelChoice(row: ListedModel): Choice | null {
	if (!row.value || row.disabled || row.value.startsWith("cc-update-required")) return null;
	const [head = "", ...rest] = (row.description ?? "").split(" · ");
	const exact = head.replace(/ with 1M context$/, " (1M context)") || row.displayName || row.value;
	const name = row.value === "default" ? `Default · ${exact}` : exact;
	const resolved = row.resolvedModel?.replace(/\[1m\]$/, "");
	const levels = row.supportedEffortLevels ?? [];
	return {
		id: row.value,
		name,
		description: [resolved, ...rest].filter(Boolean).join(" · ") || undefined,
		...(levels.length
			? {
					efforts: effortChoices(levels),
					defaultEffort: levels.includes("high") ? "high" : levels[0],
				}
			: {}),
	};
}

/** Ask a short-lived Claude Code process for its models; no prompt is sent, nothing is spent. */
function listClaudeModels(binary: string, spawn: Spawn): Promise<Choice[]> {
	return new Promise((resolve, reject) => {
		let proc: JsonProcess | null = null;
		const timer = setTimeout(() => {
			proc?.kill();
			reject(new Error("Claude Code did not list its models in time"));
		}, 20_000);
		proc = spawn(claudeArgs(binary, {}), {
			cwd: homedir(),
			onMessage: (raw) => {
				const message = raw as {
					type?: string;
					response?: { request_id?: string; response?: { models?: ListedModel[] } };
				};
				if (
					message.type !== "control_response" ||
					message.response?.request_id !== "grid-list-models"
				)
					return;
				clearTimeout(timer);
				proc?.kill();
				const models = (message.response.response?.models ?? [])
					.map(claudeModelChoice)
					.filter((model): model is Choice => model !== null);
				if (models.length) resolve(models);
				else reject(new Error("Claude Code listed no models"));
			},
		});
		proc.send({
			type: "control_request",
			request_id: "grid-init",
			request: { subtype: "initialize" },
		});
		proc.send({
			type: "control_request",
			request_id: "grid-list-models",
			request: { subtype: "list_models" },
		});
	});
}

/** The commands Claude Code reports, as it reports them: name, description and argument hint. */
type ListedCommand = { name?: string; description?: string; argumentHint?: string };

/**
 * Claude Code's command list as menu entries. The CLI answers its `initialize` control request
 * with every command it can run in this folder — its own, the ones in `~/.claude`, and the
 * project's `.claude/commands` — so nothing is read off disk and nothing is made up here.
 */
export function claudeCommandChoices(commands: unknown): AgentCommand[] {
	return agentCommands(
		(Array.isArray(commands) ? commands : []).map((command) => {
			const listed = command as ListedCommand;
			return {
				name: listed?.name,
				description: listed?.description,
				hint: listed?.argumentHint,
			};
		}),
	);
}

/** How long a command list is waited for before the agent is treated as having none. */
const TIMEOUT_MS = 30_000;

/**
 * Ask a short-lived Claude Code process, in the project's folder, which commands it offers. The
 * `initialize` control request answers with the list, so no conversation is started and nothing is
 * spent. A CLI that does not answer leaves the thread with Grid's commands only.
 */
function listClaudeCommands(binary: string, spawn: Spawn, cwd: string): Promise<AgentCommand[]> {
	return new Promise((resolve) => {
		let proc: JsonProcess | null = null;
		const done = (commands: AgentCommand[]) => {
			clearTimeout(timer);
			proc?.kill();
			resolve(commands);
		};
		// An agent that will not say in half a minute is one with no list to give; say so, so a
		// missing group can be told from a broken one.
		const timer = setTimeout(() => {
			console.warn(`[runner] Claude did not list its commands within ${TIMEOUT_MS}ms`);
			done([]);
		}, TIMEOUT_MS);
		proc = spawn(claudeArgs(binary, {}), {
			cwd,
			onMessage: (raw) => {
				const message = raw as {
					type?: string;
					response?: { request_id?: string; response?: { commands?: unknown } };
				};
				if (message.type !== "control_response" || message.response?.request_id !== "grid-init")
					return;
				done(claudeCommandChoices(message.response.response?.commands));
			},
		});
		proc.send({
			type: "control_request",
			request_id: "grid-init",
			request: { subtype: "initialize" },
		});
	});
}

const MODES: Choice[] = [
	{ id: "default", name: "Ask", description: "Ask before editing files or running commands" },
	{
		id: "acceptEdits",
		name: "Accept edits",
		description: "Edit files without asking; ask for commands",
	},
	{ id: "plan", name: "Plan", description: "Read and plan only; no changes" },
	{ id: "bypassPermissions", name: "Full access", description: "Never ask" },
];

export function claudeProvider(options: {
	binary: string;
	available: () => boolean;
	spawn?: Spawn;
}): Provider {
	const spawn = options.spawn ?? spawnJsonProcess;
	const info = (): ProviderInfo => ({
		id: "claude",
		name: "Claude Code",
		available: options.available(),
		models: FALLBACK_MODELS,
		modes: MODES,
		defaultMode: "default",
	});
	const models = cached(10 * 60 * 1000, () => listClaudeModels(options.binary, spawn));
	return {
		info,
		catalog: async (fresh) => ({ models: await models(fresh), modes: MODES }),
		start: async (context) => {
			const session = await startClaudeSession(options.binary, spawn, context);
			// Asked for beside the session, not before it: the thread opens at once and gains its
			// list when the CLI answers. A CLI that lists none gets Grid's commands only.
			void listClaudeCommands(options.binary, spawn, context.cwd)
				.then((list) => context.emit({ type: "commands", commands: list }))
				.catch((cause: unknown) => {
					console.warn(
						"[runner] Claude could not be asked for its commands:",
						cause instanceof Error ? cause.message : cause,
					);
				});
			return session;
		},
	};
}

export function claudeArgs(
	binary: string,
	input: {
		model?: string;
		mode?: string;
		effort?: string;
		resume?: string;
		mcpServers?: AgentContext["mcpServers"];
	},
): string[] {
	const args = [
		binary,
		"--print",
		"--output-format",
		"stream-json",
		"--input-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--permission-prompt-tool",
		"stdio",
	];
	if (input.model && input.model !== "default") args.push("--model", input.model);
	if (input.effort) args.push("--effort", input.effort);
	if (input.mode) args.push("--permission-mode", input.mode);
	if (input.mode === "bypassPermissions") args.push("--allow-dangerously-skip-permissions");
	if (input.resume) args.push("--resume", input.resume);
	if (input.mcpServers?.length)
		args.push(
			"--mcp-config",
			JSON.stringify({
				mcpServers: Object.fromEntries(
					input.mcpServers.map(({ name, command, args: serverArgs, env }) => [
						name,
						{ type: "stdio", command, args: serverArgs, env },
					]),
				),
			}),
		);
	return args;
}

function toolKind(name: string): ToolKind {
	if (name === "Read" || name === "NotebookRead") return "read";
	if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(name)) return "edit";
	if (name === "Bash" || name === "BashOutput" || name === "KillShell") return "execute";
	if (["Grep", "Glob", "LS"].includes(name)) return "search";
	if (name === "WebFetch" || name === "WebSearch") return "fetch";
	return "other";
}

/** A short, human line for what a tool call is about to do. */
export function toolTitle(
	name: string,
	input: Record<string, unknown>,
): { title: string; detail?: string } {
	const path = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
	switch (name) {
		case "Bash":
			return {
				title: (input.description as string) || "Run a command",
				detail: input.command as string,
			};
		case "Read":
			return { title: `Read ${path ?? "a file"}`, detail: path };
		case "Write":
			return { title: `Write ${path ?? "a file"}`, detail: path };
		case "Edit":
		case "MultiEdit":
			return { title: `Edit ${path ?? "a file"}`, detail: path };
		case "Grep":
			return {
				title: `Search for ${input.pattern as string}`,
				detail: (input.path as string) ?? undefined,
			};
		case "Glob":
			return { title: `Find ${input.pattern as string}` };
		case "WebFetch":
			return { title: `Fetch ${input.url as string}` };
		case "WebSearch":
			return { title: `Search the web for ${input.query as string}` };
		case "Task":
			return { title: (input.description as string) || "Run a sub-agent" };
		default:
			return { title: name };
	}
}

/** What an edit tool is changing, from its input: Edit and MultiEdit replace text, Write writes it. */
export function editDiffs(name: string, input: Record<string, unknown>): FileDiff[] {
	const path = (input.file_path ?? input.path) as string | undefined;
	if (!path) return [];
	const text = (value: unknown) => (typeof value === "string" ? value : "");
	if (name === "Edit")
		return [{ ...diffTexts(path, text(input.old_string), text(input.new_string)), snippet: true }];
	if (name === "MultiEdit" && Array.isArray(input.edits))
		return (input.edits as Record<string, unknown>[]).map((edit) => ({
			...diffTexts(path, text(edit.old_string), text(edit.new_string)),
			snippet: true,
		}));
	if (name === "Write") return [diffTexts(path, null, text(input.content))];
	return [];
}

function resultText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

type ControlRequest = {
	type: "control_request";
	request_id: string;
	request: {
		subtype: string;
		tool_name?: string;
		input?: Record<string, unknown>;
		tool_use_id?: string;
	};
};

async function startClaudeSession(
	binary: string,
	spawn: Spawn,
	context: AgentContext,
): Promise<AgentSession> {
	let model = context.model;
	let mode = context.mode;
	let effort = context.effort;
	let resume = context.resume;
	let proc: JsonProcess | null = null;
	let finishTurn: ((result: TurnResult) => void) | null = null;
	let controlId = 0;
	const approvals = new Map<string, ControlRequest>();
	// Tool names by id, to map a later tool_result back to its kind.
	const tools = new Map<string, string>();
	let stderr: string[] = [];

	function handle(message: Record<string, unknown>): void {
		const type = message.type;
		if (type === "system" && message.subtype === "init") {
			if (typeof message.session_id === "string") {
				resume = message.session_id;
				context.onResumeToken(message.session_id);
			}
			return;
		}
		if (type === "stream_event") {
			const event = message.event as {
				type?: string;
				delta?: { type?: string; text?: string; thinking?: string };
			};
			if (event?.type === "content_block_delta") {
				if (event.delta?.type === "text_delta" && event.delta.text) {
					context.emit({ type: "message", text: event.delta.text });
				} else if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
					context.emit({ type: "reasoning", text: event.delta.thinking });
				}
			}
			return;
		}
		if (type === "assistant") {
			const content = (message.message as { content?: Record<string, unknown>[] })?.content ?? [];
			for (const block of content) {
				if (block.type !== "tool_use") continue;
				const name = String(block.name);
				const input = (block.input as Record<string, unknown>) ?? {};
				tools.set(String(block.id), name);
				if (name === "TodoWrite" && Array.isArray(input.todos)) {
					context.emit({
						type: "plan",
						entries: (input.todos as { content: string; status: string }[]).map(
							(todo): PlanEntry => ({
								text: todo.content,
								status:
									todo.status === "completed" || todo.status === "in_progress"
										? todo.status
										: "pending",
							}),
						),
					});
					continue;
				}
				const { title, detail } = toolTitle(name, input);
				const diffs = editDiffs(name, input);
				context.emit({
					type: "tool",
					id: String(block.id),
					title,
					kind: toolKind(name),
					status: "running",
					input: detail,
					...(diffs.length ? { diffs } : {}),
				});
			}
			return;
		}
		if (type === "user") {
			const content = (message.message as { content?: Record<string, unknown>[] })?.content ?? [];
			for (const block of content) {
				if (block.type !== "tool_result") continue;
				const id = String(block.tool_use_id);
				if (tools.get(id) === "TodoWrite") continue;
				context.emit({
					type: "tool",
					id,
					status: block.is_error ? "failed" : "completed",
					output: clip(resultText(block.content)),
				});
			}
			return;
		}
		if (type === "control_request") {
			const request = message as unknown as ControlRequest;
			if (request.request.subtype !== "can_use_tool") {
				// Unknown control requests: answer so Claude does not wait forever.
				proc?.send({
					type: "control_response",
					response: { subtype: "success", request_id: request.request_id, response: {} },
				});
				return;
			}
			approvals.set(request.request_id, request);
			const { title, detail } = toolTitle(
				request.request.tool_name ?? "Tool",
				request.request.input ?? {},
			);
			context.emit({
				type: "approval",
				id: request.request_id,
				title,
				detail,
				options: [
					{ id: "allow", label: "Allow", kind: "allow" },
					{ id: "deny", label: "Deny", kind: "deny" },
				],
			});
			return;
		}
		if (type === "result") {
			const usage = message.usage as
				| {
						input_tokens?: number;
						output_tokens?: number;
						cache_read_input_tokens?: number;
						cache_creation_input_tokens?: number;
				  }
				| undefined;
			if (usage) {
				context.emit({
					type: "usage",
					inputTokens:
						(usage.input_tokens ?? 0) +
						(usage.cache_read_input_tokens ?? 0) +
						(usage.cache_creation_input_tokens ?? 0),
					outputTokens: usage.output_tokens,
					costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : undefined,
				});
			}
			const failed =
				message.is_error === true ||
				(typeof message.subtype === "string" && message.subtype.startsWith("error"));
			finishTurn?.(
				failed
					? {
							reason: "error",
							error: String(message.result ?? message.subtype ?? "Claude Code failed"),
						}
					: { reason: "done" },
			);
			finishTurn = null;
		}
	}

	function ensureProcess(): JsonProcess {
		if (proc) return proc;
		stderr = [];
		const started = spawn(
			claudeArgs(binary, { model, mode, effort, resume, mcpServers: context.mcpServers }),
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
			if (proc === started) proc = null;
			finishTurn?.({
				reason: "error",
				error: `Claude Code exited (code ${code}). ${stderr.slice(-3).join(" ")}`.trim(),
			});
			finishTurn = null;
		});
		proc = started;
		return started;
	}

	function restart(): void {
		// Takes effect on the next message; the conversation continues through --resume.
		// The turn in flight did not crash, we asked for this exit: claim its result first, or the
		// `exited` handler above would report it as "Claude Code exited (code 143)".
		const stopping = finishTurn;
		finishTurn = null;
		proc?.kill();
		proc = null;
		stopping?.({ reason: "cancelled" });
	}

	context.emit({
		type: "info",
		model: model ?? "default",
		modes: MODES,
		mode: mode ?? "default",
		...(effort ? { effort } : {}),
	});

	return {
		prompt: (text, images = []) =>
			new Promise<TurnResult>((resolve) => {
				finishTurn = resolve;
				ensureProcess().send({
					type: "user",
					session_id: "",
					parent_tool_use_id: null,
					message: {
						role: "user",
						content: [
							{ type: "text", text },
							...images.map((image) => ({
								type: "image",
								source: { type: "base64", media_type: image.mimeType, data: image.data },
							})),
						],
					},
				});
			}),
		cancel: () => {
			if (!proc) return;
			for (const id of approvals.keys())
				context.emit({ type: "approval_resolved", id, optionId: null });
			approvals.clear();
			proc.send({
				type: "control_request",
				request_id: `grid-${++controlId}`,
				request: { subtype: "interrupt" },
			});
		},
		approve: (id, optionId) => {
			const request = approvals.get(id);
			if (!request || !proc) return;
			approvals.delete(id);
			const allowed = optionId === "allow";
			proc.send({
				type: "control_response",
				response: {
					subtype: "success",
					request_id: id,
					response: allowed
						? { behavior: "allow", updatedInput: request.request.input ?? {} }
						: { behavior: "deny", message: "The person declined this in Grid." },
				},
			});
			context.emit({ type: "approval_resolved", id, optionId });
		},
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
