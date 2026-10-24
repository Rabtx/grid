import { homedir } from "node:os";

import { cached, effortChoices } from "./catalog";
import {
	type AgentQuestion,
	type ApprovalOption,
	type Choice,
	clip,
	type ToolKind,
	type ToolStatus,
} from "./events";
import { diffFromPatch, diffTexts, type FileDiff } from "./diff";
import { gridToolTitle } from "./grid-titles";
import { codexRateLimits } from "./rate-limits";
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
	changes?: { path: string; kind?: { type?: string } | string; diff?: string }[];
	server?: string;
	tool?: string;
	query?: string;
	/** A sub-agent call (`collabAgentToolCall`): what it was asked, and the threads it runs in. */
	prompt?: string | null;
	receiverThreadIds?: string[];
};

/** `item/tool/requestUserInput`'s questions as Grid shows them; those it cannot show are left out. */
export function codexQuestions(params: Record<string, unknown>): AgentQuestion[] {
	const raw = Array.isArray(params.questions) ? params.questions : [];
	return raw.flatMap((entry): AgentQuestion[] => {
		const item = (entry ?? {}) as Record<string, unknown>;
		const id = typeof item.id === "string" ? item.id.trim() : "";
		const question = typeof item.question === "string" ? item.question.trim() : "";
		if (!id || !question) return [];
		const header = typeof item.header === "string" && item.header.trim() ? item.header.trim() : id;
		const options = (Array.isArray(item.options) ? item.options : []).flatMap((option) => {
			const fields = (option ?? {}) as Record<string, unknown>;
			const label = typeof fields.label === "string" ? fields.label.trim() : "";
			if (!label) return [];
			const description =
				typeof fields.description === "string" && fields.description.trim() !== label
					? fields.description.trim()
					: "";
			return [{ label, ...(description ? { description } : {}) }];
		});
		return [
			{
				id,
				header,
				question,
				options,
				...(item.multiSelect === true ? { multiSelect: true } : {}),
			},
		];
	});
}

/** The threads a sub-agent call runs its agents in, under whichever name Codex used. */
function receivers(item: Record<string, unknown>): string[] {
	for (const key of ["receiverThreadIds", "receiver_thread_ids"]) {
		const value = item[key];
		if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string");
	}
	for (const key of ["receiverThreadId", "receiver_thread_id", "newThreadId"]) {
		const value = item[key];
		if (typeof value === "string" && value) return [value];
	}
	return [];
}

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

/** A file change's diffs: a new file carries its content, anything else a unified patch. */
function changeDiffs(item: Item): { diffs?: FileDiff[] } {
	const diffs = (item.changes ?? [])
		.filter((change) => typeof change.diff === "string" && change.diff)
		.map((change) => {
			const kind = typeof change.kind === "string" ? change.kind : change.kind?.type;
			return kind === "add"
				? diffTexts(change.path, null, change.diff as string)
				: diffFromPatch(change.path, change.diff as string);
		});
	return diffs.length ? { diffs } : {};
}

/** A Codex item as a tool call, or null for items that are not tools (messages, reasoning). */
export function codexTool(item: Item): {
	id: string;
	title: string;
	kind: ToolKind;
	status: ToolStatus;
	input?: string;
	output?: string;
	diffs?: FileDiff[];
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
				...changeDiffs(item),
			};
		}
		case "mcpToolCall":
			return {
				id: item.id,
				title:
					(item.server === "grid" ? gridToolTitle(`grid.${item.tool}`) : null) ??
					`${item.server}.${item.tool}`,
				kind: "other",
				status,
			};
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
	const questions = new Map<string, (result: unknown) => void>();
	// Sub-agents' own threads, each to the sub-agent call that started it.
	const children = new Map<string, string>();
	let stderr: string[] = [];
	let rpc: JsonRpc | null = null;

	const proc = spawn([binary, ...codexMcpArgs(context.mcpServers), "app-server"], {
		cwd: context.cwd,
		env: context.env,
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

	/** What a sub-agent's own thread reports: its steps, what it said, and how it ended. */
	function onChildNotification(parent: string, method: string, params: Record<string, unknown>) {
		if (method === "item/started" || method === "item/completed") {
			const item = params.item as Item;
			const tool = codexTool(item);
			if (tool) {
				context.emit({ type: "tool", ...tool, parent });
				context.emit({ type: "subagent", id: parent, activity: tool.title });
			} else if (method === "item/completed" && item.type === "agentMessage" && item.text) {
				context.emit({
					type: "subagent",
					id: parent,
					activity: clip(item.text, 280),
					result: clip(item.text, 8_000),
				});
			}
			return;
		}
		if (method === "turn/completed") {
			const turn = params.turn as { status?: string };
			context.emit({
				type: "subagent",
				id: parent,
				status:
					turn?.status === "failed"
						? "failed"
						: turn?.status === "interrupted"
							? "cancelled"
							: "completed",
				endedAt: new Date().toISOString(),
			});
		}
	}

	/** A sub-agent call: Grid shows each one Codex spawns as a subagent of the turn. */
	function onCollab(item: Item & Record<string, unknown>, started: boolean): void {
		if (item.tool !== "spawnAgent" && item.tool !== "spawn_agent") return;
		// Its completing is the spawn returning; the sub-agent's own thread says when it ends.
		if (started)
			context.emit({
				type: "subagent",
				id: item.id,
				status: "running",
				at: new Date().toISOString(),
			});
		for (const child of receivers(item)) children.set(child, item.id);
		const prompt = typeof item.prompt === "string" ? item.prompt : undefined;
		const title = prompt?.split("\n")[0]?.slice(0, 80) || "Sub-agent";
		context.emit({
			type: "subagent",
			id: item.id,
			title,
			...(prompt ? { prompt: clip(prompt, 8_000) } : {}),
			...(item.status === "failed" ? { status: "failed" } : {}),
		});
	}

	function onNotification(method: string, raw: unknown): void {
		const params = (raw ?? {}) as Record<string, unknown>;
		if (params.threadId && threadId && params.threadId !== threadId) {
			const parent = children.get(params.threadId as string);
			if (parent) onChildNotification(parent, method, params);
			return;
		}
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
				if (item.type === "collabAgentToolCall" || item.type === "collabToolCall") {
					onCollab(item as Item & Record<string, unknown>, method === "item/started");
					return;
				}
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
			case "account/rateLimits/updated": {
				const limits = codexRateLimits(params);
				if (limits.length) context.onRateLimits?.(limits);
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
		if (method === "item/tool/requestUserInput") {
			const asked = codexQuestions(params);
			if (asked.length) {
				const id = (params.itemId as string) || crypto.randomUUID();
				questions.set(id, respond);
				context.emit({ type: "question", id, questions: asked });
				return;
			}
		}
		// Anything else (MCP prompts) Grid cannot answer yet: say so, and decline.
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

	const policy = () => codexPolicy(mode, context.cwd);
	type Started = { thread: { id: string }; model?: string; reasoningEffort?: string | null };

	// The process is ours and, until this returns, nothing else holds it: a handshake that fails
	// must not leave `codex app-server` running with nothing left to close it.
	try {
		await rpc.request("initialize", { clientInfo: CLIENT_INFO, capabilities: null });
		rpc.notify("initialized", undefined);
		// What the account has used so far, before any turn reports it. Older Codex has no such
		// call; the next turn's update says it instead.
		if (context.onRateLimits)
			void rpc.request<Record<string, unknown>>("account/rateLimits/read", {}).then(
				(answer) => {
					const limits = codexRateLimits(answer ?? {});
					if (limits.length) context.onRateLimits?.(limits);
				},
				() => undefined,
			);

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
	} catch (cause) {
		proc.kill();
		throw cause;
	}

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
		steer: async (text) => {
			if (!threadId || !turnId || !finishTurn) return false;
			await rpc?.request("turn/steer", {
				threadId,
				input: [{ type: "text", text, text_elements: [] }],
				expectedTurnId: turnId,
			});
			return true;
		},
		answer: (id, answers) => {
			const respond = questions.get(id);
			if (!respond) return;
			questions.delete(id);
			respond({
				answers: Object.fromEntries(
					Object.entries(answers ?? {}).map(([question, picked]) => [
						question,
						{ answers: picked },
					]),
				),
			});
			context.emit({ type: "question_answered", id, answers });
		},
		cancel: () => {
			if (threadId && turnId)
				void rpc?.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
			for (const [id, respond] of questions) {
				respond({ answers: {} });
				context.emit({ type: "question_answered", id, answers: null });
			}
			questions.clear();
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

/** Connectors as Codex takes MCP servers: config overrides (`-c mcp_servers.<name>.…`) in TOML. */
export function codexMcpArgs(servers: AgentContext["mcpServers"]): string[] {
	const toml = (value: string) => JSON.stringify(value);
	return (servers ?? []).flatMap(({ name, command, args, env }) => {
		const key = `mcp_servers.${name.replace(/[^A-Za-z0-9_-]/g, "_")}`;
		const table = Object.entries(env)
			.map(([variable, value]) => `${JSON.stringify(variable)}=${toml(value)}`)
			.join(",");
		return [
			"-c",
			`${key}.command=${toml(command)}`,
			"-c",
			`${key}.args=[${args.map(toml).join(",")}]`,
			"-c",
			`${key}.env={${table}}`,
		];
	});
}
