import { describe, expect, it } from "bun:test";
import type { OpenCodeClient, OpenCodeEvent } from "@opencode/client/promise";

import type { ChatEvent } from "./events";
import {
	opencodeError,
	opencodeEventHandler,
	opencodeFormAnswer,
	opencodeMajor,
	opencodeMcpName,
	opencodeModelChoices,
	opencodeModelRef,
	opencodeModes,
	opencodePlan,
	opencodeQuestions,
	opencodeServiceProvider,
	opencodeToolInput,
} from "./opencode-service";
import type { AgentContext, AgentSession, Provider } from "./provider";

const event = (type: string, data: Record<string, unknown>) =>
	({ id: "e", created: 0, type, data }) as unknown as OpenCodeEvent;

describe("opencode service: models and modes", () => {
	it("reads versions", () => {
		expect(opencodeMajor("opencode v2.2.5")).toBe(2);
		expect(opencodeMajor("1.19.5")).toBe(1);
		expect(opencodeMajor(null)).toBe(0);
	});

	it("lists enabled models by provider with names, context, free and efforts", () => {
		const choices = opencodeModelChoices([
			{
				id: "big-pickle",
				providerID: "opencode",
				name: "Big Pickle",
				status: "active",
				enabled: true,
				limit: { context: 200_000, output: 32_000 },
				variants: [],
				cost: [{ input: 0, output: 0 } as never],
			},
			{
				id: "gpt-6",
				providerID: "github-copilot",
				name: "GPT-6",
				status: "active",
				enabled: true,
				limit: { context: 1_050_000, output: 64_000 },
				variants: [{ id: "low" }, { id: "high" }, { id: "medium" }] as never,
				cost: [{ input: 2, output: 8 } as never],
			},
			{
				id: "old",
				providerID: "opencode",
				name: "Old",
				status: "deprecated",
				enabled: true,
				limit: { context: 0, output: 0 },
				variants: [],
				cost: [],
			},
		]);
		expect(choices).toEqual([
			{
				id: "opencode/big-pickle",
				name: "Big Pickle",
				group: "opencode",
				description: "opencode/big-pickle · free · 200K context",
				contextWindow: 200_000,
			},
			{
				id: "github-copilot/gpt-6",
				name: "GPT-6",
				group: "github-copilot",
				description: "github-copilot/gpt-6 · 1.1M context",
				contextWindow: 1_050_000,
				efforts: [
					{ id: "low", name: "Low" },
					{ id: "medium", name: "Medium" },
					{ id: "high", name: "High" },
				],
				defaultEffort: "medium",
			},
		]);
	});

	it("offers primary agents as modes", () => {
		expect(
			opencodeModes([
				{ id: "build", name: "build", mode: "primary", hidden: false },
				{ id: "plan", name: "plan", mode: "primary", hidden: false, description: "Read only" },
				{ id: "general", name: "general", mode: "subagent", hidden: false },
				{ id: "title", name: "title", mode: "primary", hidden: true },
			] as never),
		).toEqual([
			{ id: "build", name: "Build" },
			{ id: "plan", name: "Plan", description: "Read only" },
		]);
	});

	it("names a model the way the service takes it", () => {
		expect(opencodeModelRef("github-copilot/gpt-6", "high")).toEqual({
			providerID: "github-copilot",
			id: "gpt-6",
			variant: "high",
		});
		expect(opencodeModelRef("openrouter/qwen/qwen3-coder")).toEqual({
			providerID: "openrouter",
			id: "qwen/qwen3-coder",
		});
		expect(opencodeModelRef("default")).toBeNull();
	});
});

describe("opencode service: tools, plans, questions, errors", () => {
	it("summarises a tool's input", () => {
		expect(opencodeToolInput({ command: "bun test" })).toBe("bun test");
		expect(opencodeToolInput({ filePath: "/a/b.ts", offset: 1 })).toBe("/a/b.ts");
		expect(opencodeToolInput({})).toBeUndefined();
	});

	it("reads todos as a plan", () => {
		expect(
			opencodePlan({
				todos: [
					{ content: "Read", status: "completed" },
					{ content: "Write", status: "in_progress" },
					{ content: "Ship", status: "pending" },
					{ content: "Drop", status: "cancelled" },
					{ nope: true },
				],
			}),
		).toEqual([
			{ text: "Read", status: "completed" },
			{ text: "Write", status: "in_progress" },
			{ text: "Ship", status: "pending" },
			{ text: "Drop", status: "completed" },
		]);
		expect(opencodePlan({ todos: "x" })).toBeNull();
	});

	const form = {
		title: "Setup",
		fields: [
			{
				key: "db",
				type: "string",
				title: "Database",
				options: [
					{ value: "pg", label: "Postgres" },
					{ value: "lite", label: "SQLite" },
				],
			},
			{ key: "tests", type: "boolean", title: "Tests" },
			{ key: "parts", type: "multiselect", options: [{ value: "a", label: "A" }] },
			{ key: "n", type: "integer" },
			{ key: "login", type: "external", url: "https://x" },
		],
	} as never;

	it("asks a form's fields as questions and answers in its terms", () => {
		expect(opencodeQuestions(form).map((q) => [q.id, q.header, q.options.length])).toEqual([
			["db", "Database", 2],
			["tests", "Tests", 2],
			["parts", "parts", 1],
			["n", "n", 0],
		]);
		expect(
			opencodeFormAnswer(form, { db: ["Postgres"], tests: ["No"], parts: ["A"], n: ["3"] }),
		).toEqual({ db: "pg", tests: false, parts: ["a"], n: 3 });
	});

	it("says which failures are worth sending again", () => {
		expect(opencodeError({ type: "rate_limit", message: "slow down", status: 429 })).toEqual({
			error: "slow down",
			retryable: true,
		});
		expect(opencodeError({ type: "auth", message: "no key", status: 401 }).retryable).toBe(false);
	});

	it("names connectors per session", () => {
		expect(opencodeMcpName("ses_0123456789abcdef", "grid")).toBe("grid-89abcdef-grid");
	});
});

describe("opencode service: a session's events", () => {
	it("streams a turn: text, a tool call, usage, an approval, and how it ended", () => {
		const emitted: ChatEvent[] = [];
		const forms = new Map();
		const handle = opencodeEventHandler(
			() => "s1",
			(e) => emitted.push(e),
			{ forms },
		);
		const base = { sessionID: "s1", assistantMessageID: "m1" };
		expect(handle(event("session.text.delta", { ...base, ordinal: 0, delta: "Hi" }))).toBeNull();
		handle(event("session.text.delta", { ...base, sessionID: "other", ordinal: 0, delta: "x" }));
		handle(event("session.tool.input.started", { ...base, id: "t1", name: "bash" }));
		handle(
			event("session.tool.called", { ...base, id: "t1", input: { command: "ls" }, executed: true }),
		);
		handle(
			event("session.tool.success", {
				...base,
				id: "t1",
				content: [{ type: "text", text: "a.ts" }],
				executed: true,
			}),
		);
		handle(
			event("permission.asked", {
				id: "p1",
				sessionID: "s1",
				action: "edit",
				resources: ["src/a.ts"],
			}),
		);
		handle(
			event("session.usage.updated", {
				sessionID: "s1",
				cost: 0.01,
				tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } },
			}),
		);
		expect(emitted).toEqual([
			{ type: "message", text: "Hi" },
			{ type: "tool", id: "t1", title: "bash", kind: "execute", status: "pending" },
			{
				type: "tool",
				id: "t1",
				title: "bash ls",
				kind: "execute",
				status: "running",
				input: "ls",
			},
			{ type: "tool", id: "t1", status: "completed", output: "a.ts" },
			{
				type: "approval",
				id: "p1",
				title: "edit src/a.ts",
				detail: "src/a.ts",
				options: [
					{ id: "once", label: "Allow", kind: "allow" },
					{ id: "always", label: "Always allow", kind: "allow_always" },
					{ id: "reject", label: "Deny", kind: "deny" },
				],
			},
			{ type: "usage", inputTokens: 13, outputTokens: 7, costUsd: 0.01 },
		]);
		expect(handle(event("session.execution.succeeded", { sessionID: "s1" }))).toEqual({
			reason: "done",
		});
		expect(handle(event("session.execution.interrupted", { sessionID: "s1" }))).toEqual({
			reason: "cancelled",
		});
		expect(
			handle(
				event("session.execution.failed", {
					sessionID: "s1",
					error: { type: "provider", message: "Free usage limit reached", status: 429 },
				}),
			),
		).toEqual({ reason: "error", error: "Free usage limit reached", retryable: true });
	});

	it("asks a form as a question and keeps it to answer", () => {
		const emitted: ChatEvent[] = [];
		const forms = new Map();
		const handle = opencodeEventHandler(
			() => "s1",
			(e) => emitted.push(e),
			{ forms },
		);
		handle(
			event("form.created", {
				form: { id: "f1", sessionID: "s1", title: "Pick", fields: [{ key: "k", type: "boolean" }] },
			}),
		);
		expect(forms.has("f1")).toBe(true);
		expect(emitted[0]).toMatchObject({ type: "question", id: "f1" });
	});

	it("shows a todo list as the plan", () => {
		const emitted: ChatEvent[] = [];
		const handle = opencodeEventHandler(
			() => "s1",
			(e) => emitted.push(e),
			{ forms: new Map() },
		);
		const base = { sessionID: "s1", assistantMessageID: "m1" };
		handle(event("session.tool.input.started", { ...base, id: "t", name: "todowrite" }));
		handle(
			event("session.tool.called", {
				...base,
				id: "t",
				input: { todos: [{ content: "Do it", status: "pending" }] },
				executed: true,
			}),
		);
		expect(emitted).toContainEqual({
			type: "plan",
			entries: [{ text: "Do it", status: "pending" }],
		});
	});
});

describe("opencode service: which way a thread runs", () => {
	const context = (extra: Partial<AgentContext> = {}): AgentContext => ({
		cwd: "/tmp",
		emit: () => {},
		onResumeToken: () => {},
		...extra,
	});
	function fallback(started: AgentContext[]): Provider {
		return {
			info: () => ({ id: "opencode", name: "opencode", available: true, models: [], modes: [] }),
			catalog: async () => ({ models: [{ id: "acp/model", name: "ACP model" }] }),
			start: async (ctx) => {
				started.push(ctx);
				return {} as AgentSession;
			},
		};
	}

	it("runs opencode 1 and sandboxed threads over ACP", async () => {
		const started: AgentContext[] = [];
		let connected = 0;
		const connect = async () => {
			connected++;
			throw new Error("not used");
		};
		const v1 = opencodeServiceProvider({
			available: () => true,
			fallback: fallback(started),
			version: async () => "1.19.5",
			connect,
		});
		await v1.start(context());
		const v2 = opencodeServiceProvider({
			available: () => true,
			fallback: fallback(started),
			version: async () => "opencode v2.2.5",
			connect,
		});
		await v2.start(context({ sandbox: {} as never }));
		expect(started).toHaveLength(2);
		expect(connected).toBe(0);
		expect((await v1.catalog?.())?.models[0]?.id).toBe("acp/model");
	});

	it("falls back to ACP when the service is out of reach, and a fork starts afresh there", async () => {
		const started: AgentContext[] = [];
		const provider = opencodeServiceProvider({
			available: () => true,
			fallback: fallback(started),
			version: async () => "opencode v2.2.5",
			connect: async () => {
				throw new Error("service down");
			},
		});
		await provider.start(context({ resume: "ses_1", fork: true }));
		expect(started[0]?.resume).toBeUndefined();
		expect(started[0]?.fork).toBeUndefined();
		expect(provider.info().capabilities).toEqual({ steer: "native", resume: true, fork: true });
	});

	it("reads the catalog from the service", async () => {
		const client = {
			model: {
				list: async () => ({
					data: [
						{
							id: "m",
							providerID: "p",
							name: "M",
							status: "active",
							enabled: true,
							limit: { context: 0, output: 0 },
							variants: [],
							cost: [],
						},
					],
				}),
			},
			agent: {
				list: async () => ({
					data: [{ id: "build", name: "build", mode: "primary", hidden: false }],
				}),
			},
		} as unknown as OpenCodeClient;
		const provider = opencodeServiceProvider({
			available: () => true,
			fallback: fallback([]),
			version: async () => "2.2.5",
			connect: async () => client,
		});
		expect(await provider.catalog?.()).toEqual({
			models: [{ id: "p/m", name: "M", group: "p", description: "p/m" }],
			modes: [{ id: "build", name: "Build" }],
		});
	});
});
