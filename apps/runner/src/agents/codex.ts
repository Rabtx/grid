import { homedir } from "node:os";

import { cached, effortChoices } from "./catalog";
import { type ApprovalOption, type Choice, clip, type ToolKind, type ToolStatus } from "./events";
import type { AgentContext, AgentSession, Provider, ProviderInfo, TurnResult } from "./provider";
import { JsonRpc, type Spawn, spawnJsonProcess } from "./stdio";

/**
 * Codex through `codex app-server`: JSON-RPC over stdio, the protocol Codex's own IDE clients
 * use. A thread starts (or resumes, from the stored thread id) in the project's folder; each
 * message is a turn; replies, commands and file changes stream back as items, and Codex asks
 * before acting according to the mode.
 */

const CLIENT_INFO = { name: "grid", title: "Grid", version: "0.1.0" };

const MODES: Choice[] = [
	{
		id: "supervised",
		name: "Supervised",
		description: "Read-only; ask before commands and file changes",
	},
	{
		id: "accept-edits",
		name: "Auto-accept edits",
		description: "Edit files in the project; ask before anything else",
	},
	{ id: "full-access", name: "Full access", description: "Run anything without asking" },
];

type ApprovalPolicy = "untrusted" | "on-request" | "never";
type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

/** How a mode maps onto Codex's approval policy and sandbox. */
export function codexPolicy(
	mode: string | undefined,
	cwd: string,
): {
	approvalPolicy: ApprovalPolicy;
	sandbox: SandboxMode;
	sandboxPolicy: Record<string, unknown>;
} {
	if (mode === "full-access") {
		return {
			approvalPolicy: "never",
			sandbox: "danger-full-access",
			sandboxPolicy: { type: "dangerFullAccess" },
		};
	}
	if (mode === "accept-edits") {
		return {
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			sandboxPolicy: {
				type: "workspaceWrite",
				writableRoots: [cwd],
				networkAccess: false,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			},
		};
	}
	return {
		approvalPolicy: "untrusted",
		sandbox: "read-only",
		sandboxPolicy: { type: "readOnly", networkAccess: false },
	};
}

type CodexModel = {
	id: string;
	displayName?: string;
	description?: string;
	hidden?: boolean;
	isDefault?: boolean;
	supportedReasoningEfforts?: { reasoningEffort: string }[];
	defaultReasoningEffort?: string;
};

/** Codex's model list as choices: exact names, their effort levels, the default first. */
export function codexModelChoices(models: CodexModel[]): Choice[] {
	return models
		.filter((model) => !model.hidden)
		.sort((a, b) => Number(b.isDefault ?? false) - Number(a.isDefault ?? false))
		.map((model) => {
			const levels = (model.supportedReasoningEfforts ?? []).map((level) => level.reasoningEffort);
			return {
				id: model.id,
				name: model.displayName || model.id,
				description: model.description || undefined,
				...(levels.length
					? { efforts: effortChoices(levels), defaultEffort: model.defaultReasoningEffort }
					: {}),
			};
		});
}

/** Start an app-server, say hello, run one request, and stop it. */
async function oneShot<T>(
	binary: string,
	spawn: Spawn,
	run: (rpc: JsonRpc) => Promise<T>,
): Promise<T> {
	let rpc: JsonRpc | null = null;
	const proc = spawn([binary, "app-server"], {
		cwd: homedir(),
		onMessage: (message) => rpc?.receive(message),
	});
	rpc = new JsonRpc(proc, {
		onNotification: () => undefined,
		onRequest: (_method, _params, respond) => respond({}),
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("Codex did not answer in time")), 30_000);
	});
	try {
		await Promise.race([
			rpc.request("initialize", { clientInfo: CLIENT_INFO, capabilities: null }),
			timeout,
		]);
		rpc.notify("initialized", undefined);
		return await Promise.race([run(rpc), timeout]);
	} finally {
		clearTimeout(timer);
		proc.kill();
	}
}

async function listCodexModels(binary: string, spawn: Spawn): Promise<Choice[]> {
	return oneShot(binary, spawn, async (rpc) => {
		const all: CodexModel[] = [];
		let cursor: string | null = null;
		do {
			const page: { data: CodexModel[]; nextCursor: string | null } = await rpc.request(
				"model/list",
				{
					cursor,
				},
			);
			all.push(...page.data);
			cursor = page.nextCursor;
		} while (cursor);
		const models = codexModelChoices(all);
		if (!models.length) throw new Error("Codex listed no models");
		return models;
	});
}

export function codexProvider(options: {
	binary: string;
	available: () => boolean;
	spawn?: Spawn;
}): Provider {
	const spawn = options.spawn ?? spawnJsonProcess;
	const info = (): ProviderInfo => ({
		id: "codex",
		name: "Codex",
		available: options.available(),
		models: [],
		modes: MODES,
		defaultMode: "supervised",
	});
	const models = cached(10 * 60 * 1000, () => listCodexModels(options.binary, spawn));
	return {
		info,
		catalog: async (fresh) => ({ models: await models(fresh), modes: MODES }),
		start: (context) => startCodexSession(options.binary, spawn, context),
	};
}

type Item = {
	type: string;
	id: string;
	text?: string;
	command?: string;
	aggregatedOutput?: string | null;
	exitCode?: number | null;
	status?: string;
	commandActions?: { type: string; path?: string | null; query?: string | null; name?: string }[];
	changes?: { path: string; kind?: unknown }[];
	server?: string;
	tool?: string;
	query?: string;
};

const STATUS: Record<string, ToolStatus> = {
	inProgress: "running",
	completed: "completed",
	failed: "failed",
	declined: "failed",
};

function commandKind(item: Item): ToolKind {
	const actions = item.commandActions ?? [];
	if (actions.length && actions.every((action) => action.type === "read")) return "read";
	if (
		actions.length &&
		actions.every((action) => action.type === "search" || action.type === "listFiles")
	)
		return "search";
	return "execute";
}

/** A Codex item as a tool call, or null for items that are not tools (messages, reasoning). */
export function codexTool(item: Item): {
	id: string;
	title: string;
	kind: ToolKind;
	status: ToolStatus;
	input?: string;
	output?: string;
} | null {
	const status = STATUS[item.status ?? "inProgress"] ?? "running";
	switch (item.type) {
		case "commandExecution": {
			const output = item.aggregatedOutput ? clip(item.aggregatedOutput) : undefined;
			return {
				id: item.id,
				title: item.command ?? "Command",
				kind: commandKind(item),
				status: item.exitCode && item.exitCode !== 0 ? "failed" : status,
				input: item.command,
				output,
			};
		}
		case "fileChange": {
			const paths = (item.changes ?? []).map((change) => change.path);
			return {
				id: item.id,
				title: paths.length === 1 ? `Edit ${paths[0]}` : `Edit ${paths.length} files`,
				kind: "edit",
				status,
				input: JSON.stringify({ path: paths[0] ?? "", paths }),
			};
		}
		case "mcpToolCall":
			return { id: item.id, title: `${item.server}.${item.tool}`, kind: "other", status };
		case "webSearch":
			return {
				id: item.id,
				title: item.query ? `Search the web: ${item.query}` : "Search the web",
				kind: "fetch",
				status,
			};
		default:
			return null;
	}
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
	{ id: "accept", label: "Allow", kind: "allow" },
	{ id: "acceptForSession", label: "Allow for this chat", kind: "allow_always" },
	{ id: "decline", label: "Deny", kind: "deny" },
];

async function startCodexSession(
	binary: string,
	spawn: Spawn,
	context: AgentContext,
): Promise<AgentSession> {
	let model = context.model;
	let effort = context.effort;
	let mode = context.mode ?? "supervised";
	let threadId: string | null = null;
	let turnId: string | null = null;
	let finishTurn: ((result: TurnResult) => void) | null = null;
	const streamed = new Set<string>();
	const approvals = new Map<string, (result: unknown) => void>();
	let stderr: string[] = [];
	let rpc: JsonRpc | null = null;

	const proc = spawn([binary, "app-server"], {
		cwd: context.cwd,
		onMessage: (message) => rpc?.receive(message),
		onStderr: (line) => {
			stderr.push(line);
			if (stderr.length > 20) stderr = stderr.slice(-20);
		},
	});

	function finish(result: TurnResult): void {
		turnId = null;
		finishTurn?.(result);
		finishTurn = null;
	}

	function onNotification(method: string, raw: unknown): void {
		const params = (raw ?? {}) as Record<string, unknown>;
		if (params.threadId && threadId && params.threadId !== threadId) return;
		switch (method) {
			case "turn/started":
				turnId = (params.turn as { id?: string })?.id ?? turnId;
				return;
			case "item/agentMessage/delta":
				streamed.add(params.itemId as string);
				context.emit({ type: "message", text: params.delta as string });
				return;
			case "item/reasoning/summaryTextDelta":
			case "item/reasoning/textDelta":
				context.emit({ type: "reasoning", text: params.delta as string });
				return;
			case "item/started":
			case "item/completed": {
				const item = params.item as Item;
				const tool = codexTool(item);
				if (tool) context.emit({ type: "tool", ...tool });
				// A reply that arrived whole rather than as deltas.
				if (
					method === "item/completed" &&
					item.type === "agentMessage" &&
					!streamed.has(item.id) &&
					item.text
				) {
					context.emit({ type: "message", text: item.text });
				}
				return;
			}
			case "turn/plan/updated": {
				const plan = (params.plan as { step: string; status: string }[]) ?? [];
				context.emit({
					type: "plan",
					entries: plan.map((step) => ({
						text: step.step,
						status:
							step.status === "inProgress"
								? "in_progress"
								: (step.status as "pending" | "completed"),
					})),
				});
				return;
			}
			case "thread/tokenUsage/updated": {
				const usage = params.tokenUsage as {
					total: { inputTokens: number; outputTokens: number; totalTokens: number };
					last: { totalTokens: number };
					modelContextWindow: number | null;
				};
				context.emit({
					type: "usage",
					inputTokens: usage.total.inputTokens,
					outputTokens: usage.total.outputTokens,
					contextUsed: usage.last.totalTokens,
					contextWindow: usage.modelContextWindow ?? undefined,
				});
				return;
			}
			case "error": {
				// Codex retries on its own and says so; only the final failure is worth showing.
				if (params.willRetry) return;
				const error = params.error as { message?: string; additionalDetails?: string | null };
				context.emit({
					type: "error",
					message:
						[error?.message, error?.additionalDetails].filter(Boolean).join(" — ") ||
						"Codex failed",
				});
				return;
			}
			case "turn/completed": {
				const turn = params.turn as { status?: string; error?: { message?: string } | null };
				if (turn.status === "interrupted") finish({ reason: "cancelled" });
				else if (turn.status === "failed")
					finish({ reason: "error", error: turn.error?.message ?? "Codex failed" });
				else finish({ reason: "done" });
				return;
			}
			default:
				return;
		}
	}

	function onRequest(method: string, raw: unknown, respond: (result: unknown) => void): void {
		const params = (raw ?? {}) as Record<string, unknown>;
		if (
			method === "item/commandExecution/requestApproval" ||
			method === "item/fileChange/requestApproval"
		) {
			const id = (params.approvalId as string) || (params.itemId as string) || crypto.randomUUID();
			const isCommand = method === "item/commandExecution/requestApproval";
			approvals.set(id, respond);
			context.emit({
				type: "approval",
				id,
				title: isCommand ? "Run a command" : "Change files",
				detail: [params.command, params.reason].filter(Boolean).join("\n") || undefined,
				options: APPROVAL_OPTIONS,
			});
			return;
		}
		// Anything else (questions, MCP prompts) Grid cannot answer yet: say so, and decline.
		context.emit({
			type: "error",
			message: `Codex asked for something Grid cannot answer yet (${method}); it was declined.`,
		});
		respond({ decision: "decline" });
	}

	rpc = new JsonRpc(proc, { onNotification, onRequest });
	void proc.exited.then((code) => {
		rpc?.failAll("Codex stopped");
		finish({
			reason: "error",
			error: `Codex exited (code ${code}). ${stderr.slice(-3).join(" ")}`.trim(),
		});
	});

	await rpc.request("initialize", { clientInfo: CLIENT_INFO, capabilities: null });
	rpc.notify("initialized", undefined);

	const policy = () => codexPolicy(mode, context.cwd);
	type Started = { thread: { id: string }; model?: string; reasoningEffort?: string | null };
	let started: Started | null = null;
	if (context.resume) {
		started = await rpc
			.request<Started>("thread/resume", {
				threadId: context.resume,
				cwd: context.cwd,
				approvalPolicy: policy().approvalPolicy,
				sandbox: policy().sandbox,
			})
			.catch(() => null);
	}
	started ??= await rpc.request<Started>("thread/start", {
		cwd: context.cwd,
		model: model ?? null,
		approvalPolicy: policy().approvalPolicy,
		sandbox: policy().sandbox,
	});
	threadId = started.thread.id;
	context.onResumeToken(threadId);
	model ??= started.model;
	context.emit({
		type: "info",
		modes: MODES,
		mode,
		...(model ? { model } : {}),
		...(effort ? { effort } : {}),
	});

	return {
		prompt: (text) =>
			new Promise<TurnResult>((resolve) => {
				finishTurn = resolve;
				const { approvalPolicy, sandboxPolicy } = policy();
				rpc
					?.request<{ turn?: { id?: string } }>("turn/start", {
						threadId,
						input: [{ type: "text", text, text_elements: [] }],
						cwd: context.cwd,
						approvalPolicy,
						sandboxPolicy,
						...(model ? { model } : {}),
						...(effort ? { effort } : {}),
					})
					.then((result) => {
						turnId = result?.turn?.id ?? turnId;
					})
					.catch((cause: unknown) =>
						finish({
							reason: "error",
							error: cause instanceof Error ? cause.message : String(cause),
						}),
					);
			}),
		cancel: () => {
			if (threadId && turnId)
				void rpc?.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
			for (const [id, respond] of approvals) {
				respond({ decision: "cancel" });
				context.emit({ type: "approval_resolved", id, optionId: null });
			}
			approvals.clear();
		},
		approve: (id, optionId) => {
			const respond = approvals.get(id);
			if (!respond) return;
			approvals.delete(id);
			respond({ decision: optionId ?? "decline" });
			context.emit({ type: "approval_resolved", id, optionId });
		},
		// Model, effort and mode apply from the next turn: `turn/start` carries them.
		setModel: async (next) => {
			model = next;
			context.emit({ type: "info", model: next });
		},
		setEffort: async (next) => {
			effort = next;
			context.emit({ type: "info", effort: next });
		},
		setMode: async (next) => {
			mode = next;
			context.emit({ type: "info", mode: next });
		},
		close: () => proc.kill(),
	};
}
