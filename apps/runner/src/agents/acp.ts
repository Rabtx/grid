import {
	type ApprovalOption,
	type Choice,
	clip,
	type PlanEntry,
	type ToolKind,
	type ToolStatus,
} from "./events";
import { diffTexts, type FileDiff } from "./diff";
import type { AgentContext, AgentSession, Provider, ProviderInfo } from "./provider";
import { JsonRpc, type Spawn, spawnJsonProcess } from "./stdio";

/**
 * Agents that speak the Agent Client Protocol (JSON-RPC over stdio): opencode, and any other ACP
 * agent. The protocol already has sessions, streamed updates, tool calls, plans and permission
 * requests, so this adapter mostly renames fields.
 */
export function acpProvider(options: {
	id: string;
	name: string;
	command: string[];
	available: () => boolean;
	/** The agent's model list with names, groups and effort levels, when it offers one. */
	catalog?: Provider["catalog"];
	spawn?: Spawn;
}): Provider {
	const spawn = options.spawn ?? spawnJsonProcess;
	const info = (): ProviderInfo => ({
		id: options.id,
		name: options.name,
		available: options.available(),
		// Models and modes come from the agent itself once a session starts.
		models: [],
		modes: [],
	});
	return {
		info,
		catalog: options.catalog,
		start: (context) => startAcpSession(options.command, spawn, context),
	};
}

type ConfigOption = {
	id: string;
	category?: string;
	currentValue?: string;
	options?: { value: string; name: string; description?: string }[];
};

type NewSessionResult = {
	sessionId: string;
	configOptions?: ConfigOption[];
	models?: { currentModelId?: string; availableModels?: { modelId: string; name: string }[] };
	modes?: {
		currentModeId?: string;
		availableModes?: { id: string; name: string; description?: string }[];
	};
};

type AcpToolCall = {
	toolCallId: string;
	title?: string;
	kind?: string;
	status?: string;
	rawInput?: unknown;
	rawOutput?: unknown;
	content?: {
		type: string;
		content?: { type: string; text?: string };
		path?: string;
		oldText?: string | null;
		newText?: string;
	}[];
	locations?: { path: string }[];
};

const TOOL_KINDS = new Set<ToolKind>([
	"read",
	"edit",
	"execute",
	"search",
	"fetch",
	"think",
	"other",
]);

function toolKind(kind: string | undefined): ToolKind | undefined {
	if (!kind) return undefined;
	if (kind === "delete" || kind === "move") return "edit";
	return TOOL_KINDS.has(kind as ToolKind) ? (kind as ToolKind) : "other";
}

function toolStatus(status: string | undefined): ToolStatus | undefined {
	if (status === "in_progress") return "running";
	if (status === "pending" || status === "completed" || status === "failed") return status;
	return undefined;
}

function describeInput(call: AcpToolCall): string | undefined {
	const raw = call.rawInput as Record<string, unknown> | undefined;
	if (raw && typeof raw === "object") {
		for (const key of [
			"command",
			"cmd",
			"filePath",
			"file_path",
			"path",
			"pattern",
			"query",
			"url",
		]) {
			if (typeof raw[key] === "string") return raw[key] as string;
		}
	}
	return call.locations?.map((location) => location.path).join(", ") || undefined;
}

/** The files a call changed, from its `diff` content (whole old and new text). */
export function diffsOf(call: AcpToolCall): { diffs?: FileDiff[] } {
	const diffs = (call.content ?? [])
		.filter((item) => item.type === "diff" && item.path)
		.map((item) => diffTexts(item.path as string, item.oldText ?? null, item.newText ?? ""));
	return diffs.length ? { diffs } : {};
}

function describeOutput(call: AcpToolCall): string | undefined {
	const parts: string[] = [];
	for (const item of call.content ?? []) {
		if (item.type === "content" && item.content?.type === "text" && item.content.text) {
			parts.push(item.content.text);
		} else if (item.type === "diff" && item.path) {
			const before = item.oldText?.split("\n").length ?? 0;
			const after = item.newText?.split("\n").length ?? 0;
			parts.push(`${item.path} (${before ? `${before} → ` : "new, "}${after} lines)`);
		}
	}
	if (parts.length === 0 && typeof call.rawOutput === "string") parts.push(call.rawOutput);
	return parts.length ? clip(parts.join("\n")) : undefined;
}

function choicesFrom(
	options: { value: string; name: string; description?: string }[] = [],
): Choice[] {
	return options.map((option) => ({
		id: option.value,
		name: option.name,
		description: option.description,
	}));
}

async function startAcpSession(
	command: string[],
	spawn: Spawn,
	context: AgentContext,
): Promise<AgentSession> {
	const stderr: string[] = [];
	let rpc: JsonRpc | null = null;
	const proc = spawn(command, {
		cwd: context.cwd,
		onMessage: (message) => rpc?.receive(message),
		onStderr: (line) => {
			stderr.push(line);
			if (stderr.length > 20) stderr.shift();
		},
	});

	let sessionId = "";
	// While the agent replays an old conversation (session/load) we already have it in our log.
	let replaying = false;
	const approvals = new Map<string, (result: unknown) => void>();
	// Config option ids the agent uses for model, mode and effort (ACP `configOptions`).
	let modelConfigId: string | null = null;
	let modeConfigId: string | null = null;
	let effortConfigId: string | null = null;

	rpc = new JsonRpc(proc, {
		onNotification: (method, params) => {
			if (method !== "session/update" || replaying) return;
			handleUpdate((params as { update: Record<string, unknown> }).update);
		},
		onRequest: (method, params, respond) => {
			if (method === "session/request_permission") {
				const request = params as {
					toolCall: AcpToolCall;
					options: { optionId: string; name: string; kind: string }[];
				};
				const id = `perm-${crypto.randomUUID()}`;
				approvals.set(id, respond);
				const options: ApprovalOption[] = request.options.map((option) => ({
					id: option.optionId,
					label: option.name,
					kind: option.kind.startsWith("reject")
						? "deny"
						: option.kind === "allow_always"
							? "allow_always"
							: "allow",
				}));
				context.emit({
					type: "approval",
					id,
					title: request.toolCall.title ?? "The agent wants to use a tool",
					detail: describeInput(request.toolCall),
					options,
				});
				return;
			}
			// No client-side file system or terminal capabilities were offered; say so.
			respond(null);
		},
	});
	void proc.exited.then((code) =>
		rpc?.failAll(`The agent exited (code ${code}). ${stderr.slice(-3).join(" ")}`.trim()),
	);

	function handleUpdate(update: Record<string, unknown>): void {
		const kind = update.sessionUpdate;
		if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
			const content = update.content as { type?: string; text?: string } | undefined;
			if (content?.type === "text" && content.text) {
				context.emit({
					type: kind === "agent_message_chunk" ? "message" : "reasoning",
					text: content.text,
				});
			}
		} else if (kind === "tool_call" || kind === "tool_call_update") {
			const call = update as unknown as AcpToolCall;
			context.emit({
				type: "tool",
				id: call.toolCallId,
				title: call.title,
				kind: toolKind(call.kind),
				status: toolStatus(call.status) ?? (kind === "tool_call" ? "running" : undefined),
				input: describeInput(call),
				output: describeOutput(call),
				...diffsOf(call),
			});
		} else if (kind === "plan") {
			const entries = (update.entries as { content: string; status: string }[]) ?? [];
			context.emit({
				type: "plan",
				entries: entries.map((entry): PlanEntry => ({
					text: entry.content,
					status:
						entry.status === "completed" || entry.status === "in_progress"
							? entry.status
							: "pending",
				})),
			});
		} else if (kind === "current_mode_update") {
			context.emit({ type: "info", mode: String(update.currentModeId ?? "") });
		} else if (kind === "config_option_update" || kind === "config_options_update") {
			reportConfig((update.configOptions as ConfigOption[] | undefined) ?? []);
		} else if (kind === "usage_update") {
			context.emit({
				type: "usage",
				contextUsed: typeof update.used === "number" ? update.used : undefined,
				contextWindow: typeof update.size === "number" ? update.size : undefined,
			});
		}
	}

	function reportConfig(configOptions: ConfigOption[]): void {
		const find = (...keys: string[]) =>
			configOptions.find(
				(option) => keys.includes(option.category ?? "") || keys.includes(option.id),
			);
		const model = find("model");
		const mode = find("mode");
		// opencode calls it `effort`; the ACP draft calls the category `thought_level`.
		const effort = find("effort", "thought_level", "reasoning", "variant");
		if (model) modelConfigId = model.id;
		if (mode) modeConfigId = mode.id;
		effortConfigId = effort?.id ?? null;
		if (!model && !mode && !effort) return;
		context.emit({
			type: "info",
			...(model ? { models: choicesFrom(model.options), model: model.currentValue } : {}),
			...(mode ? { modes: choicesFrom(mode.options), mode: mode.currentValue } : {}),
			// Always sent, so a model without levels clears the previous model's.
			efforts: effort ? choicesFrom(effort.options) : [],
			...(effort ? { effort: effort.currentValue } : {}),
		});
	}

	async function setOption(configId: string, value: string): Promise<void> {
		const result = await (rpc as JsonRpc).request<{ configOptions?: ConfigOption[] }>(
			"session/set_config_option",
			{
				sessionId,
				configId,
				value,
			},
		);
		if (result?.configOptions) reportConfig(result.configOptions);
	}

	function report(result: NewSessionResult): void {
		if (result.configOptions?.length) {
			reportConfig(result.configOptions);
			return;
		}
		context.emit({
			type: "info",
			models: result.models?.availableModels?.map((model) => ({
				id: model.modelId,
				name: model.name,
			})),
			model: result.models?.currentModelId,
			modes: result.modes?.availableModes?.map((mode) => ({
				id: mode.id,
				name: mode.name,
				description: mode.description,
			})),
			mode: result.modes?.currentModeId,
		});
	}

	const init = await rpc.request<{
		agentCapabilities?: { loadSession?: boolean; promptCapabilities?: { image?: boolean } };
	}>("initialize", {
		protocolVersion: 1,
		clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
		clientInfo: { name: "grid", version: "0.1.0" },
	});

	let session: NewSessionResult | null = null;
	if (context.resume && init.agentCapabilities?.loadSession) {
		replaying = true;
		try {
			session = await rpc.request<NewSessionResult>("session/load", {
				sessionId: context.resume,
				cwd: context.cwd,
				mcpServers: [],
			});
			session = { ...session, sessionId: context.resume };
		} catch {
			// The agent no longer has it; start fresh below.
			session = null;
		} finally {
			replaying = false;
		}
	}
	session ??= await rpc.request<NewSessionResult>("session/new", {
		cwd: context.cwd,
		mcpServers: [],
	});
	sessionId = session.sessionId;
	context.onResumeToken(sessionId);
	report(session);

	const setModel = async (model: string) => {
		if (modelConfigId) {
			await setOption(modelConfigId, model);
		} else {
			await rpc.request("session/set_model", { sessionId, modelId: model });
			context.emit({ type: "info", model });
		}
	};
	const setMode = async (mode: string) => {
		if (modeConfigId) {
			await setOption(modeConfigId, mode);
		} else {
			await rpc.request("session/set_mode", { sessionId, modeId: mode });
			context.emit({ type: "info", mode });
		}
	};
	const setEffort = async (effort: string) => {
		// Only models with levels have the option; the picker hides effort for the rest.
		if (effortConfigId) await setOption(effortConfigId, effort);
	};
	if (context.model) await setModel(context.model).catch(() => undefined);
	if (context.effort) await setEffort(context.effort).catch(() => undefined);
	if (context.mode) await setMode(context.mode).catch(() => undefined);

	return {
		prompt: async (text, images = []) => {
			try {
				const result = await rpc.request<{ stopReason?: string }>("session/prompt", {
					sessionId,
					prompt: [
						{ type: "text", text },
						...(init.agentCapabilities?.promptCapabilities?.image
							? images.map((image) => ({ type: "image", ...image }))
							: []),
					],
				});
				return { reason: result?.stopReason === "cancelled" ? "cancelled" : "done" };
			} catch (cause) {
				return { reason: "error", error: cause instanceof Error ? cause.message : String(cause) };
			}
		},
		cancel: () => {
			rpc.notify("session/cancel", { sessionId });
			// Pending permission prompts are void once the turn is cancelled.
			for (const [id, respond] of approvals) {
				respond({ outcome: { outcome: "cancelled" } });
				context.emit({ type: "approval_resolved", id, optionId: null });
			}
			approvals.clear();
		},
		approve: (id, optionId) => {
			const respond = approvals.get(id);
			if (!respond) return;
			approvals.delete(id);
			respond(
				optionId
					? { outcome: { outcome: "selected", optionId } }
					: { outcome: { outcome: "cancelled" } },
			);
			context.emit({ type: "approval_resolved", id, optionId });
		},
		setModel,
		setMode,
		setEffort,
		close: () => proc.kill(),
	};
}
