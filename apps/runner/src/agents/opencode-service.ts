import { OpenCode, type OpenCodeClient, type OpenCodeEvent } from "@opencode/client/promise";
import { Service } from "@opencode/client/service";

import { cached, effortChoices, runCli } from "./catalog";
import {
	type AgentQuestion,
	type ApprovalOption,
	type ChatEvent,
	type Choice,
	clip,
	type PlanEntry,
	type ToolKind,
} from "./events";
import type { AgentContext, AgentSession, Provider, ProviderInfo, TurnResult } from "./provider";

/**
 * opencode 2 the way its own clients run it: through opencode's local background service
 * (`opencode serve --service`, shared by every thread and by the opencode CLI) and the official
 * `@opencode/client`, as t3code does. One service holds every session, so a thread costs no
 * process of its own, and a session outlives the connection: sending again picks it up.
 *
 * opencode 1 has no service, and a sandboxed thread must run inside its container: those, and any
 * thread whose service cannot be reached, run over ACP (`fallback`) as before.
 */
export function opencodeServiceProvider(options: {
	available: () => boolean;
	/** The ACP provider, for whatever the service cannot run. */
	fallback: Provider;
	/** opencode's version (`opencode --version`), or null when it cannot be read. */
	version?: () => Promise<string | null>;
	connect?: () => Promise<OpenCodeClient>;
}): Provider {
	const version = options.version ?? opencodeVersion;
	const connect = options.connect ?? connectService;
	const native = async () => opencodeMajor(await version()) >= 2;
	const info = (): ProviderInfo => ({
		...options.fallback.info(),
		capabilities: { steer: "native", resume: true, fork: true },
	});
	const catalog = cached(10 * 60 * 1000, async () => {
		if (!(await native())) throw new Error("opencode 1 has no service");
		const client = await connect();
		const [models, agents] = await Promise.all([client.model.list(), client.agent.list()]);
		return { models: opencodeModelChoices(models.data), modes: opencodeModes(agents.data) };
	});
	return {
		info,
		catalog: async (fresh) => {
			try {
				return await catalog(fresh);
			} catch {
				return (await options.fallback.catalog?.(fresh)) ?? { models: [] };
			}
		},
		start: async (context) => {
			if (!context.sandbox && (await native())) {
				try {
					return await startServiceSession(await connect(), context);
				} catch (error) {
					console.error(`[runner] opencode service unavailable, using ACP: ${String(error)}`);
				}
			}
			// ACP cannot branch a conversation: a fork starts afresh and is told the thread instead.
			return options.fallback.start(
				context.fork ? { ...context, resume: undefined, fork: undefined } : context,
			);
		},
	};
}

async function opencodeVersion(): Promise<string | null> {
	try {
		return (await runCli(["opencode", "--version"], 15_000)).trim();
	} catch {
		return null;
	}
}

/** The major version in `opencode --version` output ("opencode v2.2.5", "1.19.5"); 0 if none. */
export function opencodeMajor(version: string | null): number {
	const match = version?.match(/(\d+)\.\d+\.\d+/);
	return match ? Number(match[1]) : 0;
}

let shared: Promise<OpenCodeClient> | null = null;

/** The local service, started if it is not running, and a client for it (kept, shared). */
function connectService(): Promise<OpenCodeClient> {
	shared ??= Service.ensure({ version: (version) => opencodeMajor(version) >= 2 })
		.then((endpoint) =>
			OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) }),
		)
		.catch((error: unknown) => {
			shared = null;
			throw error;
		});
	return shared;
}

type ModelInfo = Awaited<ReturnType<OpenCodeClient["model"]["list"]>>["data"][number];
type AgentInfo = Awaited<ReturnType<OpenCodeClient["agent"]["list"]>>["data"][number];

function contextLabel(tokens: number | undefined): string | null {
	if (!tokens) return null;
	return tokens >= 1_000_000
		? `${Math.round(tokens / 100_000) / 10}M context`
		: `${Math.round(tokens / 1000)}K context`;
}

/** The service's models as picker entries: `provider/model` ids, names, context and efforts. */
export function opencodeModelChoices(
	models: readonly Pick<
		ModelInfo,
		"id" | "providerID" | "name" | "status" | "enabled" | "limit" | "variants" | "cost"
	>[],
): Choice[] {
	return models
		.filter((model) => model.enabled !== false && model.status !== "deprecated")
		.map((model) => {
			const id = `${model.providerID}/${model.id}`;
			const free = model.cost.length > 0 && model.cost.every((cost) => isFree(cost));
			const levels = model.variants.map((variant) => variant.id);
			return {
				id,
				name: model.name,
				group: model.providerID,
				description: [id, free ? "free" : null, contextLabel(model.limit.context)]
					.filter(Boolean)
					.join(" · "),
				...(model.limit.context ? { contextWindow: model.limit.context } : {}),
				...(levels.length
					? {
							efforts: effortChoices(levels),
							defaultEffort: levels.includes("medium") ? "medium" : levels[0],
						}
					: {}),
			};
		});
}

function isFree(cost: unknown): boolean {
	if (typeof cost !== "object" || cost === null) return false;
	const { input, output } = cost as { input?: number; output?: number };
	return !input && !output;
}

/** opencode's primary agents ("build", "plan") are the modes a thread picks from. */
export function opencodeModes(
	agents: readonly Pick<AgentInfo, "id" | "name" | "mode" | "hidden" | "description">[],
): Choice[] {
	return agents
		.filter((agent) => !agent.hidden && agent.mode !== "subagent")
		.map((agent) => ({
			id: agent.id,
			name: agent.name.charAt(0).toUpperCase() + agent.name.slice(1),
			...(agent.description ? { description: agent.description } : {}),
		}));
}

/** "provider/model" as the service names a model, with the effort as its variant. */
export function opencodeModelRef(
	model: string,
	effort?: string,
): { id: string; providerID: string; variant?: string } | null {
	const slash = model.indexOf("/");
	if (slash <= 0) return null;
	return {
		providerID: model.slice(0, slash),
		id: model.slice(slash + 1),
		...(effort ? { variant: effort } : {}),
	};
}

const TOOL_KINDS: Record<string, ToolKind> = {
	bash: "execute",
	shell: "execute",
	read: "read",
	edit: "edit",
	write: "edit",
	patch: "edit",
	apply_patch: "edit",
	multiedit: "edit",
	grep: "search",
	glob: "search",
	list: "search",
	codesearch: "search",
	webfetch: "fetch",
	websearch: "fetch",
	todowrite: "think",
	todoread: "think",
};

export function opencodeToolKind(name: string): ToolKind {
	return TOOL_KINDS[name.toLowerCase()] ?? "other";
}

/** What a tool was asked, in a line: its command, path, pattern or URL. */
export function opencodeToolInput(input: Record<string, unknown>): string | undefined {
	for (const key of ["command", "filePath", "path", "pattern", "url", "query", "description"]) {
		const value = input[key];
		if (typeof value === "string" && value) return clip(value, 400);
	}
	const text = JSON.stringify(input);
	return text === "{}" ? undefined : clip(text, 400);
}

/** opencode's todo list (`todowrite`) as the thread's plan. */
export function opencodePlan(input: Record<string, unknown>): PlanEntry[] | null {
	if (!Array.isArray(input.todos)) return null;
	return input.todos.flatMap((todo): PlanEntry[] => {
		if (typeof todo !== "object" || todo === null) return [];
		const { content, status } = todo as { content?: unknown; status?: unknown };
		if (typeof content !== "string") return [];
		return [
			{
				text: content,
				status:
					status === "completed" || status === "in_progress"
						? status
						: status === "cancelled"
							? "completed"
							: "pending",
			},
		];
	});
}

const APPROVAL_OPTIONS: ApprovalOption[] = [
	{ id: "once", label: "Allow", kind: "allow" },
	{ id: "always", label: "Always allow", kind: "allow_always" },
	{ id: "reject", label: "Deny", kind: "deny" },
];

type Form = Extract<OpenCodeEvent, { type: "form.created" }>["data"]["form"];

/** An opencode form as questions: one per field the person can answer here. */
export function opencodeQuestions(form: Pick<Form, "title" | "fields">): AgentQuestion[] {
	return form.fields.flatMap((field): AgentQuestion[] => {
		if (field.type === "external" || ("hidden" in field && field.hidden)) return [];
		const header = clip(field.title ?? field.key, 40);
		const question = field.description ?? field.title ?? form.title;
		if (field.type === "boolean")
			return [{ id: field.key, header, question, options: [{ label: "Yes" }, { label: "No" }] }];
		const options =
			field.type === "string" || field.type === "multiselect"
				? (field.options ?? []).map((option) => ({
						label: option.label || option.value,
						...(option.description ? { description: option.description } : {}),
					}))
				: [];
		return [
			{
				id: field.key,
				header,
				question,
				options,
				...(field.type === "multiselect" ? { multiSelect: true } : {}),
			},
		];
	});
}

/** The person's answers in the form's own terms: option values, numbers, true/false. */
export function opencodeFormAnswer(
	form: Pick<Form, "fields">,
	answers: Record<string, string[]>,
): Record<string, string | number | boolean | string[]> {
	const answer: Record<string, string | number | boolean | string[]> = {};
	for (const field of form.fields) {
		const picked = answers[field.key];
		if (!picked?.length || field.type === "external") continue;
		const value = (label: string) =>
			(field.type === "string" || field.type === "multiselect"
				? field.options?.find((option) => (option.label || option.value) === label)?.value
				: undefined) ?? label;
		if (field.type === "boolean") answer[field.key] = picked[0] === "Yes";
		else if (field.type === "number" || field.type === "integer")
			answer[field.key] = Number(picked[0]);
		else if (field.type === "multiselect") answer[field.key] = picked.map(value);
		else answer[field.key] = value(picked[0] as string);
	}
	return answer;
}

type ToolState = { name: string; input?: Record<string, unknown> };

/** What a structured error means for the thread: its message, and whether sending again may fix it. */
export function opencodeError(error: { type?: string; message?: string; status?: number }): {
	error: string;
	retryable: boolean;
} {
	const status = error.status ?? 0;
	return {
		error: error.message || error.type || "opencode failed",
		retryable: status === 429 || status >= 500 || /rate|overload|timeout/i.test(error.type ?? ""),
	};
}

/**
 * The service's events for one session as Grid's chat events. Returns how a turn ended when the
 * event ends one.
 */
export function opencodeEventHandler(
	sessionID: () => string | null,
	emit: (event: ChatEvent) => void,
	pending: { forms: Map<string, Form> },
): (event: OpenCodeEvent) => TurnResult | (TurnResult & { retryable?: boolean }) | null {
	const tools = new Map<string, ToolState>();
	return (event) => {
		const data = (event as { data?: Record<string, unknown> }).data ?? {};
		const id = sessionID();
		if (event.type === "form.created") {
			const form = event.data.form;
			if (form.sessionID !== id) return null;
			pending.forms.set(form.id, form);
			emit({ type: "question", id: form.id, questions: opencodeQuestions(form) });
			return null;
		}
		if (data.sessionID !== id) return null;
		switch (event.type) {
			case "session.text.delta":
				emit({ type: "message", text: event.data.delta });
				return null;
			case "session.reasoning.delta":
				emit({ type: "reasoning", text: event.data.delta });
				return null;
			case "session.tool.input.started":
				tools.set(event.data.id, { name: event.data.name });
				emit({
					type: "tool",
					id: event.data.id,
					title: event.data.name,
					kind: opencodeToolKind(event.data.name),
					status: "pending",
				});
				return null;
			case "session.tool.called": {
				const tool = tools.get(event.data.id) ?? { name: "tool" };
				tool.input = event.data.input;
				tools.set(event.data.id, tool);
				const plan = tool.name === "todowrite" ? opencodePlan(event.data.input) : null;
				if (plan) emit({ type: "plan", entries: plan });
				const input = opencodeToolInput(event.data.input);
				emit({
					type: "tool",
					id: event.data.id,
					title: input ? `${tool.name} ${clip(input, 80)}` : tool.name,
					kind: opencodeToolKind(tool.name),
					status: "running",
					...(input ? { input } : {}),
				});
				return null;
			}
			case "session.tool.success":
			case "session.tool.failed": {
				const text = (event.data.content ?? [])
					.map((part) => (part.type === "text" ? part.text : (part.name ?? part.uri)))
					.join("\n");
				const failed = event.type === "session.tool.failed";
				const output = failed ? [event.data.error.message, text].filter(Boolean).join("\n") : text;
				emit({
					type: "tool",
					id: event.data.id,
					status: failed ? "failed" : "completed",
					...(output ? { output: clip(output, 8_000) } : {}),
				});
				tools.delete(event.data.id);
				return null;
			}
			case "permission.asked":
				emit({
					type: "approval",
					id: event.data.id,
					title: event.data.message ?? `${event.data.action} ${event.data.resources.join(", ")}`,
					...(event.data.resources.length ? { detail: event.data.resources.join("\n") } : {}),
					options: APPROVAL_OPTIONS,
				});
				return null;
			case "session.usage.updated":
				emit({
					type: "usage",
					inputTokens: event.data.tokens.input + event.data.tokens.cache.read,
					outputTokens: event.data.tokens.output + event.data.tokens.reasoning,
					costUsd: event.data.cost,
				});
				return null;
			case "session.retry.scheduled":
				emit({ type: "error", message: "opencode is retrying the model request" });
				return null;
			case "session.execution.succeeded":
				return { reason: "done" };
			case "session.execution.interrupted":
				return { reason: "cancelled" };
			case "session.execution.failed":
				return { reason: "error", ...opencodeError(event.data.error) };
			default:
				return null;
		}
	};
}

const EVENT_TYPES = [
	"session.text.delta",
	"session.reasoning.delta",
	"session.tool.input.started",
	"session.tool.called",
	"session.tool.success",
	"session.tool.failed",
	"session.usage.updated",
	"session.retry.scheduled",
	"session.execution.succeeded",
	"session.execution.interrupted",
	"session.execution.failed",
	"permission.asked",
	"form.created",
] as const;

/** A per-session name for each connector, so threads in one folder never share or clash. */
export function opencodeMcpName(sessionID: string, server: string): string {
	return `grid-${sessionID.slice(-8)}-${server}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function startServiceSession(
	client: OpenCodeClient,
	context: AgentContext,
): Promise<AgentSession> {
	const location = { directory: context.cwd };
	let model = context.model;
	let effort = context.effort;
	let mode = context.mode;
	let sessionID: string | null = null;
	let resumed: boolean | undefined;

	if (context.resume) {
		try {
			const found = await client.session.get({ sessionID: context.resume });
			sessionID = context.fork ? (await client.session.fork({ sessionID: found.id })).id : found.id;
			resumed = true;
		} catch {
			resumed = false;
		}
	}
	const ref = model ? opencodeModelRef(model, effort) : null;
	if (!sessionID) {
		const created = await client.session.create({
			location,
			...(mode ? { agent: mode } : {}),
			...(ref ? { model: ref } : {}),
		});
		sessionID = created.id;
	}
	const id = sessionID;
	context.onResumeToken(id);
	if (resumed) {
		if (ref) await client.session.switchModel({ sessionID: id, model: ref }).catch(() => undefined);
		if (mode)
			await client.session.switchAgent({ sessionID: id, agent: mode }).catch(() => undefined);
	}
	if (context.env && Object.keys(context.env).length)
		await client.session
			.environment({ sessionID: id, variables: context.env })
			.catch(() => undefined);

	const connectors = (context.mcpServers ?? []).map((server) => ({
		...server,
		name: opencodeMcpName(id, server.name),
	}));
	// Each turn adds them again: opencode drops runtime servers from an idle folder.
	async function addConnectors(): Promise<void> {
		await Promise.all(
			connectors.map((server) =>
				client.mcp
					.add({
						server: server.name,
						location,
						config: {
							type: "local",
							command: [server.command, ...server.args],
							environment: server.env,
						},
					})
					.catch((error: unknown) =>
						console.error(`[runner] opencode could not add ${server.name}: ${String(error)}`),
					),
			),
		);
	}
	// Last match wins: no thread uses another thread's connectors, and its own need no asking.
	if (connectors.length)
		await client.session
			.update({
				sessionID: id,
				permissions: [
					{ action: "grid-*", resource: "*", effect: "deny" },
					...connectors.map((server) => ({
						action: `${server.name}_*`,
						resource: "*",
						effect: "allow" as const,
					})),
				],
			})
			.catch(() => undefined);

	const pending = { forms: new Map<string, Form>() };
	let finishTurn: ((result: TurnResult) => void) | null = null;
	const finish = (result: TurnResult) => {
		finishTurn?.(result);
		finishTurn = null;
	};
	const handle = opencodeEventHandler(() => id, context.emit, pending);
	const stop = new AbortController();
	void (async () => {
		while (!stop.signal.aborted) {
			try {
				for await (const event of client.event.subscribe({
					types: EVENT_TYPES,
					signal: stop.signal,
				})) {
					const ended = handle(event as OpenCodeEvent);
					if (ended) finish(ended);
				}
			} catch (error) {
				if (stop.signal.aborted) return;
				console.error(`[runner] opencode event stream dropped, reconnecting: ${String(error)}`);
			}
			// The service restarted or the stream dropped: listen again; the session lives on.
			await Bun.sleep(1_000);
		}
	})();

	context.emit({
		type: "info",
		...(model ? { model } : {}),
		...(mode ? { mode } : {}),
		...(effort ? { effort } : {}),
	});

	const files = (images?: { mimeType: string; data: string }[]) =>
		images?.length
			? {
					files: images.map((image) => ({
						uri: `data:${image.mimeType};base64,${image.data}`,
						source: { type: "inline" as const },
					})),
				}
			: {};

	return {
		...(resumed !== undefined ? { resumed } : {}),
		prompt: (text, images) =>
			new Promise<TurnResult>((resolve) => {
				finishTurn = resolve;
				addConnectors()
					.then(() => client.session.prompt({ sessionID: id, text, ...files(images) }))
					.catch((cause: unknown) =>
						finish({
							reason: "error",
							error: cause instanceof Error ? cause.message : String(cause),
						}),
					);
			}),
		steer: async (text, images) => {
			if (!finishTurn) return false;
			await client.session.prompt({ sessionID: id, text, delivery: "steer", ...files(images) });
			return true;
		},
		cancel: () => {
			void client.session.interrupt({ sessionID: id }).catch(() => undefined);
			for (const formID of pending.forms.keys()) {
				void client.session.form.cancel({ sessionID: id, formID }).catch(() => undefined);
				context.emit({ type: "question_answered", id: formID, answers: null });
			}
			pending.forms.clear();
		},
		approve: (requestID, optionId) => {
			const decision = optionId === "once" || optionId === "always" ? optionId : "reject";
			void client.permission.reply({ sessionID: id, requestID, decision }).catch(() => undefined);
			context.emit({ type: "approval_resolved", id: requestID, optionId });
		},
		answer: (formID, answers) => {
			const form = pending.forms.get(formID);
			if (!form) return;
			pending.forms.delete(formID);
			void (
				answers
					? client.session.form.reply({
							sessionID: id,
							formID,
							answer: opencodeFormAnswer(form, answers),
						})
					: client.session.form.cancel({ sessionID: id, formID })
			).catch(() => undefined);
			context.emit({ type: "question_answered", id: formID, answers });
		},
		setModel: async (next) => {
			model = next;
			const nextRef = opencodeModelRef(next, effort);
			if (nextRef) await client.session.switchModel({ sessionID: id, model: nextRef });
			context.emit({ type: "info", model: next });
		},
		setEffort: async (next) => {
			effort = next;
			const nextRef = model ? opencodeModelRef(model, next) : null;
			if (nextRef) await client.session.switchModel({ sessionID: id, model: nextRef });
			context.emit({ type: "info", effort: next });
		},
		setMode: async (next) => {
			mode = next;
			await client.session.switchAgent({ sessionID: id, agent: next });
			context.emit({ type: "info", mode: next });
		},
		close: () => {
			stop.abort();
			for (const server of connectors)
				void client.mcp.remove({ server: server.name, location }).catch(() => undefined);
		},
	};
}
