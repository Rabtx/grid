import { describe, expect, it } from "bun:test";

import { codexModelChoices, codexPolicy, codexProvider, codexTool } from "./codex";
import type { ChatEvent } from "./events";
import type { JsonProcess, Spawn } from "./stdio";

type Rpc = {
	id?: number | string;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
};

/**
 * A fake `codex app-server`: answers requests with `answer`, and lets the test push
 * notifications and server requests as Codex would.
 */
function fakeServer(answer: (message: Rpc, push: (message: unknown) => void) => unknown) {
	const sent: Rpc[] = [];
	let commands: string[] = [];
	let cwd = "";
	let push: (message: unknown) => void = () => undefined;
	const spawn: Spawn = (command, options) => {
		commands = command;
		cwd = options.cwd;
		push = (message) => queueMicrotask(() => options.onMessage(message));
		const proc: JsonProcess = {
			send: (raw) => {
				const message = raw as Rpc;
				sent.push(message);
				if (message.method && message.id !== undefined) {
					const result = answer(message, push);
					if (result !== undefined) push({ id: message.id, result });
				}
			},
			kill: () => undefined,
			exited: new Promise(() => undefined),
		};
		return proc;
	};
	return { spawn, sent, commands: () => commands, cwd: () => cwd, push: (m: unknown) => push(m) };
}

const MODELS = [
	{
		id: "gpt-5.5",
		displayName: "GPT-5.5",
		isDefault: false,
		supportedReasoningEfforts: [{ reasoningEffort: "high" }, { reasoningEffort: "low" }],
		defaultReasoningEffort: "low",
	},
	{
		id: "gpt-6-astra",
		displayName: "GPT-6-Astra",
		isDefault: true,
		supportedReasoningEfforts: [{ reasoningEffort: "ultra" }, { reasoningEffort: "medium" }],
		defaultReasoningEffort: "medium",
	},
	{ id: "secret", displayName: "Hidden", hidden: true },
];

describe("Codex catalog", () => {
	it("lists models with their efforts, the default first, hidden ones left out", async () => {
		const server = fakeServer((message) => {
			if (message.method === "initialize") return { userAgent: "codex" };
			if (message.method === "model/list") return { data: MODELS, nextCursor: null };
			return undefined;
		});
		const provider = codexProvider({ binary: "codex", available: () => true, spawn: server.spawn });
		const catalog = await provider.catalog?.();
		expect(server.commands()).toEqual(["codex", "app-server"]);
		expect(catalog?.models.map((model) => model.id)).toEqual(["gpt-6-astra", "gpt-5.5"]);
		expect(catalog?.models[0].efforts?.map((level) => level.id)).toEqual(["medium", "ultra"]);
		expect(catalog?.models[1].defaultEffort).toBe("low");
		expect(codexModelChoices(MODELS).find((model) => model.id === "secret")).toBeUndefined();
	});
});

describe("Codex modes", () => {
	it("maps each mode onto an approval policy and a sandbox rooted in the project", () => {
		expect(codexPolicy("supervised", "/p")).toMatchObject({
			approvalPolicy: "untrusted",
			sandbox: "read-only",
		});
		expect(codexPolicy("accept-edits", "/p").sandboxPolicy).toMatchObject({
			type: "workspaceWrite",
			writableRoots: ["/p"],
		});
		expect(codexPolicy("full-access", "/p")).toMatchObject({
			approvalPolicy: "never",
			sandbox: "danger-full-access",
		});
	});

	it("names tools from Codex items", () => {
		expect(
			codexTool({
				type: "commandExecution",
				id: "c1",
				command: "cat src/a.ts",
				status: "completed",
				exitCode: 0,
				commandActions: [{ type: "read", path: "src/a.ts" }],
			}),
		).toMatchObject({ kind: "read", status: "completed", title: "cat src/a.ts" });
		expect(
			codexTool({
				type: "fileChange",
				id: "f1",
				status: "inProgress",
				changes: [{ path: "src/a.ts" }],
			}),
		).toMatchObject({ kind: "edit", status: "running", title: "Edit src/a.ts" });
		expect(
			codexTool({
				type: "commandExecution",
				id: "c2",
				command: "false",
				status: "completed",
				exitCode: 1,
			})?.status,
		).toBe("failed");
		expect(codexTool({ type: "agentMessage", id: "m1", text: "hi" })).toBeNull();
	});
});

describe("Codex session", () => {
	it("starts in the project folder, streams a turn, asks for approval and resumes by thread id", async () => {
		const events: ChatEvent[] = [];
		let token = "";
		const server = fakeServer((message, push) => {
			const params = message.params ?? {};
			switch (message.method) {
				case "initialize":
					return { userAgent: "codex" };
				case "thread/start":
				case "thread/resume":
					return {
						thread: { id: (params.threadId as string) ?? "t1" },
						model: "gpt-5.5",
						cwd: params.cwd,
					};
				case "turn/start":
					push({
						method: "turn/started",
						params: { threadId: params.threadId, turn: { id: "turn1" } },
					});
					push({
						method: "item/started",
						params: {
							threadId: params.threadId,
							item: { type: "commandExecution", id: "c1", command: "ls", status: "inProgress" },
						},
					});
					push({
						id: 900,
						method: "item/commandExecution/requestApproval",
						params: { threadId: params.threadId, itemId: "c1", command: "ls" },
					});
					return { turn: { id: "turn1" } };
				default:
					return undefined;
			}
		});
		const provider = codexProvider({ binary: "codex", available: () => true, spawn: server.spawn });
		const session = await provider.start({
			cwd: "/home/me/Projects/shop",
			mode: "accept-edits",
			effort: "high",
			emit: (event) => events.push(event),
			onResumeToken: (value) => {
				token = value;
			},
		});
		expect(server.cwd()).toBe("/home/me/Projects/shop");
		const start = server.sent.find((message) => message.method === "thread/start");
		expect(start?.params).toMatchObject({
			cwd: "/home/me/Projects/shop",
			sandbox: "workspace-write",
		});
		expect(token).toBe("t1");

		const turn = session.prompt("list the files");
		await Bun.sleep(5);
		const turnStart = server.sent.find((message) => message.method === "turn/start");
		expect(turnStart?.params).toMatchObject({
			threadId: "t1",
			effort: "high",
			cwd: "/home/me/Projects/shop",
		});
		const approval = events.find((event) => event.type === "approval");
		expect(approval).toMatchObject({ id: "c1", title: "Run a command", detail: "ls" });

		session.approve("c1", "accept");
		await Bun.sleep(5);
		expect(server.sent.find((message) => message.id === 900)).toMatchObject({
			result: { decision: "accept" },
		});

		server.push({
			method: "item/agentMessage/delta",
			params: { threadId: "t1", itemId: "m1", delta: "Two files." },
		});
		server.push({
			method: "item/completed",
			params: {
				threadId: "t1",
				item: {
					type: "commandExecution",
					id: "c1",
					command: "ls",
					status: "completed",
					exitCode: 0,
					aggregatedOutput: "a\nb",
				},
			},
		});
		server.push({
			method: "item/completed",
			params: { threadId: "t1", item: { type: "agentMessage", id: "m1", text: "Two files." } },
		});
		server.push({
			method: "turn/completed",
			params: { threadId: "t1", turn: { id: "turn1", status: "completed" } },
		});
		expect(await turn).toEqual({ reason: "done" });
		expect(
			events
				.filter((event) => event.type === "message")
				.map((event) => (event as { text: string }).text),
		).toEqual(["Two files."]);
		expect(events.findLast((event) => event.type === "tool")).toMatchObject({
			id: "c1",
			status: "completed",
			output: "a\nb",
		});

		// A later session resumes the same thread in the same folder.
		const resumed = fakeServer((message) => {
			if (message.method === "initialize") return {};
			if (message.method === "thread/resume")
				return { thread: { id: message.params?.threadId }, model: "gpt-5.5" };
			return undefined;
		});
		await codexProvider({ binary: "codex", available: () => true, spawn: resumed.spawn }).start({
			cwd: "/home/me/Projects/shop",
			resume: token,
			emit: () => undefined,
			onResumeToken: () => undefined,
		});
		expect(
			resumed.sent.find((message) => message.method === "thread/resume")?.params,
		).toMatchObject({
			threadId: "t1",
			cwd: "/home/me/Projects/shop",
		});
		expect(resumed.sent.some((message) => message.method === "thread/start")).toBe(false);
	});

	it("reports a failed turn with Codex's own message, ignoring retries", async () => {
		const events: ChatEvent[] = [];
		const server = fakeServer((message, push) => {
			if (message.method === "initialize") return {};
			if (message.method === "thread/start") return { thread: { id: "t2" } };
			if (message.method === "turn/start") {
				push({
					method: "error",
					params: { threadId: "t2", willRetry: true, error: { message: "Reconnecting... 1/5" } },
				});
				push({
					method: "error",
					params: {
						threadId: "t2",
						willRetry: false,
						error: { message: "workspace routing discovery failed" },
					},
				});
				push({
					method: "turn/completed",
					params: {
						threadId: "t2",
						turn: {
							id: "x",
							status: "failed",
							error: { message: "workspace routing discovery failed" },
						},
					},
				});
				return { turn: { id: "x" } };
			}
			return undefined;
		});
		const session = await codexProvider({
			binary: "codex",
			available: () => true,
			spawn: server.spawn,
		}).start({
			cwd: "/tmp",
			emit: (event) => events.push(event),
			onResumeToken: () => undefined,
		});
		expect(await session.prompt("hi")).toEqual({
			reason: "error",
			error: "workspace routing discovery failed",
		});
		expect(events.filter((event) => event.type === "error")).toHaveLength(1);
	});
});

describe("Codex start failures", () => {
	/** A spawn that reports whether the process it made was killed. */
	function trackedSpawn(answer: (message: Rpc) => unknown) {
		let killed = 0;
		const spawn: Spawn = (_command, options) => {
			const proc: JsonProcess = {
				send: (raw) => {
					const message = raw as Rpc;
					if (message.method && message.id !== undefined) {
						const result = answer(message);
						if (result !== undefined)
							queueMicrotask(() => options.onMessage({ id: message.id, result }));
					}
				},
				kill: () => {
					killed++;
				},
				exited: new Promise(() => undefined),
			};
			return proc;
		};
		return { spawn, killed: () => killed };
	}

	const context = { cwd: "/tmp", emit: () => undefined, onResumeToken: () => undefined };

	it("ends the process when the handshake fails", async () => {
		// The process is spawned before the handshake and nothing else holds it until `start`
		// returns. Throwing from it left `codex app-server` running with no handle to close it.
		const tracked = trackedSpawn(() => {
			throw new Error("the agent refused to start");
		});
		const provider = codexProvider({
			binary: "codex",
			available: () => true,
			spawn: tracked.spawn,
		});
		await expect(provider.start(context)).rejects.toThrow("the agent refused to start");
		expect(tracked.killed()).toBe(1);
	});

	it("ends the process when the thread will not start", async () => {
		const tracked = trackedSpawn((message) => {
			if (message.method === "initialize") return { userAgent: "codex" };
			throw new Error("no thread for you");
		});
		const provider = codexProvider({
			binary: "codex",
			available: () => true,
			spawn: tracked.spawn,
		});
		await expect(provider.start(context)).rejects.toThrow("no thread for you");
		expect(tracked.killed()).toBe(1);
	});

	it("leaves a started session running", async () => {
		const tracked = trackedSpawn((message) => {
			if (message.method === "initialize") return { userAgent: "codex" };
			if (message.method === "thread/start") return { thread: { id: "t1" } };
			return undefined;
		});
		const session = await codexProvider({
			binary: "codex",
			available: () => true,
			spawn: tracked.spawn,
		}).start(context);
		expect(tracked.killed()).toBe(0);
		session.close();
		expect(tracked.killed()).toBe(1);
	});
});
