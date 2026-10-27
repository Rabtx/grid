import type { AgentQuestion, ChatEvent, MessageOrigin } from "../agents/events";
import type { Who } from "../auth";
import { may } from "../permissions";
import { RateLog } from "../rate-log";
import { turnsOf, type TurnRecord } from "./history-brief";
import { ChatError, type ChatHub, type GridTool, type ToolAnswer } from "./hub";
import type { ChatSessionRow } from "./store";

/**
 * Grid's thread tools: every thread's agent can start other threads (on any agent), send them
 * messages, wait for them, read them, stop them, and answer their questions. They are Grid's own
 * operations, not an agent's subagents: each thread started is a thread of its own in the
 * project, which the person can open, and it gets only the prompt it was sent.
 *
 * What keeps it safe:
 *
 * - A thread acts as its person: it starts only what they may start, and changes (messages,
 *   stops, answers) only their own threads. Any thread of the workspace can be read.
 * - It never hands out more than it has: a thread it starts, or one it messages, may not run in a
 *   broader permission mode than its own (see `MODE_RANK`).
 * - Runaways stop: threads started from threads go `MAX_DEPTH` deep at most, and one turn starts
 *   `STARTS_PER_TURN` at most.
 * - A `requestId` makes a call safe to repeat: the same id gets the same result, not new work.
 *
 * Grid also reports back to the thread that started one: when it finishes, fails or is stopped
 * (unless that thread was waiting for it), and when it asks a question, so a question in a thread
 * nobody is watching still gets answered, by the agent that started it or by the person.
 */

/** How broad each permission mode is, by its id across agents; unknown modes count as `default`. */
const MODE_RANK: Record<string, number> = {
	plan: 0,
	"read-only": 0,
	architect: 0,
	default: 1,
	ask: 1,
	supervised: 1,
	acceptEdits: 2,
	"accept-edits": 2,
	"auto-edit": 2,
	build: 2,
	code: 2,
	bypassPermissions: 3,
	"full-access": 3,
	yolo: 3,
};
const DEFAULT_RANK = 1;

/** Threads started from threads, this many deep at most. */
export const MAX_DEPTH = 3;
/** Threads one turn may start. */
export const STARTS_PER_TURN = 10;
/** How long a wait lasts by default, and at most: agents' tool calls time out at about a minute. */
const WAIT_DEFAULT_S = 45;
const WAIT_MAX_S = 100;
const REPORT_DELAY_MS = 2_000;
const READ_TURNS = 10;
const READ_MAX_TURNS = 30;
const ASKED_MAX = 4_000;
const REPLY_MAX = 6_000;
const EXCERPT = 1_500;
const REQUEST_ID = /^[\w-]{1,60}$/;

type WaitEnd = "ended" | "waiting" | "timeout";

function cut(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function str(args: Record<string, unknown>, key: string, max: number, required = true): string {
	const value = args[key];
	if (value === undefined || value === null || value === "") {
		if (required) throw new ChatError(`${key} is required`, 400);
		return "";
	}
	if (typeof value !== "string") throw new ChatError(`${key} must be text`, 400);
	if (value.length > max) throw new ChatError(`${key} is longer than ${max} characters`, 400);
	return value.trim();
}

function requestIdOf(args: Record<string, unknown>): string | null {
	const value = str(args, "requestId", 60, false);
	if (!value) return null;
	if (!REQUEST_ID.test(value))
		throw new ChatError("requestId is up to 60 letters, digits, - or _", 400);
	return value;
}

function seconds(args: Record<string, unknown>): number {
	const value = args.timeout;
	if (value === undefined || value === null) return WAIT_DEFAULT_S;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		throw new ChatError("timeout is a number of seconds", 400);
	return Math.min(WAIT_MAX_S, value);
}

/** The questions a thread's agent is waiting on an answer to, oldest first. */
export function openQuestions(
	events: readonly ChatEvent[],
): { id: string; questions: AgentQuestion[] }[] {
	const open = new Map<string, AgentQuestion[]>();
	for (const event of events) {
		if (event.type === "question") open.set(event.id, event.questions);
		else if (event.type === "question_answered") open.delete(event.id);
		else if (event.type === "turn_end") open.clear();
	}
	return [...open].map(([id, questions]) => ({ id, questions }));
}

/** Questions as an agent reads them, with how to answer each. */
function questionText(thread: string, asked: { id: string; questions: AgentQuestion[] }): string {
	const lines = asked.questions.map((question) => {
		const options = question.options.length
			? ` Options: ${question.options.map((option) => JSON.stringify(option.label)).join(", ")}${question.multiSelect ? " (pick any)" : ""}.`
			: " (Answer in your own words.)";
		return `- [${question.id}] ${question.question}${options}`;
	});
	return `Question "${asked.id}" in thread "${thread}":\n${lines.join("\n")}`;
}

export function rankOf(mode: string | null | undefined): number {
	return mode ? (MODE_RANK[mode] ?? DEFAULT_RANK) : DEFAULT_RANK;
}

/**
 * Who is using the thread tools: a thread's agent, or an agent outside Grid signed in with one
 * of its person's keys (`outside-agents.ts`). Either acts as its person.
 */
export type Caller = {
	/** The thread whose agent calls; null for an outside agent. */
	thread: ChatSessionRow | null;
	who: Who;
	/** The project it works in when a call names none; null when every call must name one. */
	project: string | null;
	/** The broadest permission mode (as `rankOf` counts) it may hand out. */
	rank: number;
	/** Whether it may change threads (start, send, stop, answer), not only read them. */
	write: boolean;
	/** Who its messages are from, as threads show them. */
	origin: MessageOrigin;
	/** Where what a call with a request id did is kept (see `requestId`). */
	receipts: {
		get: (key: string) => string | null;
		keep: (key: string, result: string) => void;
	};
	/** The agent the threads it starts use by default. */
	provider: string | null;
};

/** A thread as agents are told it: a link they can follow and give the person. */
export function threadLink(session: Pick<ChatSessionRow, "id" | "title">): string {
	return `[${session.title.replace(/[[\]]/g, "")}](grid-thread://${session.id})`;
}

export class ThreadTools {
	/** Threads someone is waiting on (`thread_wait`), and how to tell them it is over. */
	private readonly waiters = new Map<string, Set<(end: WaitEnd) => void>>();
	/** Reports waiting to go to each thread that started others, batched. */
	private readonly reports = new Map<
		string,
		{ lines: string[]; timer: ReturnType<typeof setTimeout> }
	>();
	/** Threads each turn started, by `<thread>:<turn>`, against `STARTS_PER_TURN`. */
	private readonly started = new Map<string, number>();
	private readonly reportDelayMs: number;
	private readonly whoFor: (session: ChatSessionRow) => Who;
	private readonly rates: RateLog;

	constructor(
		private readonly hub: ChatHub,
		options: {
			reportDelayMs?: number;
			whoFor?: (session: ChatSessionRow) => Who;
			/** Outside agents' starts, kept across restarts; in memory without it. */
			rates?: RateLog;
		} = {},
	) {
		this.reportDelayMs = options.reportDelayMs ?? REPORT_DELAY_MS;
		this.rates = options.rates ?? new RateLog(":memory:");
		this.whoFor =
			options.whoFor ??
			((session) => ({ userId: session.ownerId, workspace: session.workspaceId }));
		hub.onTurnEnded((session, reason) => this.turnEnded(session, reason));
		hub.onEvent((session, event) => this.event(session, event));
		for (const tool of this.tools()) hub.registerTool(tool);
	}

	/** A thread's agent as a caller of these tools. */
	callerOf(thread: ChatSessionRow): Caller {
		return {
			thread,
			who: this.whoFor(thread),
			project: thread.project,
			rank: this.rank(thread),
			write: true,
			origin: { kind: "agent", thread: { id: thread.id, title: thread.title } },
			receipts: {
				get: (key) => this.hub.receipt(thread.id, key),
				keep: (key, result) => this.hub.keepReceipt(thread.id, key, result),
			},
			provider: thread.provider,
		};
	}

	private turnEnded(session: ChatSessionRow, reason: "done" | "cancelled" | "error"): void {
		this.wake(session.id, "ended");
		for (const key of this.started.keys())
			if (key.startsWith(`${session.id}:`)) this.started.delete(key);
		const parent = session.delegatedBy;
		// A thread waited on has its result read by the wait; only work nobody waited for is told.
		if (!parent || this.waited.delete(session.id)) return;
		const said = { done: "finished", error: "failed", cancelled: "was stopped" }[reason];
		const reply = this.hub.lastReply(session.id);
		this.report(
			parent,
			`${threadLink(session)} ${said}.${reply ? `\n${cut(reply, EXCERPT)}` : ""}`,
		);
	}

	/** Threads whose end a wait saw: their end is not reported again. */
	private readonly waited = new Set<string>();

	private event(session: ChatSessionRow, event: ChatEvent): void {
		if (event.type !== "question" && event.type !== "approval") return;
		// A thread that started this one and is waiting on it hears of the question from its wait.
		const toldByWait = this.waiters.has(session.id);
		this.wake(session.id, "waiting");
		if (event.type !== "question" || !session.delegatedBy || toldByWait) return;
		const parent = session.delegatedBy;
		// Told after a moment, and only if still open: a question answered at once needs no word.
		const timer = setTimeout(() => {
			if (this.waiters.has(session.id)) return;
			const asked = openQuestions(this.hub.events(session.workspaceId, session.id)).find(
				(item) => item.id === event.id,
			);
			if (!asked) return;
			this.report(
				parent,
				`${threadLink(session)}, which you started, is waiting on an answer.\n${questionText(session.id, asked)}\nAnswer it with thread_answer if you can; if it is the person's to decide, ask them.`,
			);
		}, this.reportDelayMs);
		timer.unref?.();
	}

	private wake(id: string, end: WaitEnd): void {
		const waiting = this.waiters.get(id);
		if (!waiting) return;
		this.waiters.delete(id);
		if (end === "ended") this.waited.add(id);
		for (const resolve of waiting) resolve(end);
	}

	/**
	 * Tell a thread about the threads it started, a few reports at a time; sent as a message from
	 * Grid, so it waits in that thread's queue while its agent works.
	 */
	private report(parent: string, line: string): void {
		const pending = this.reports.get(parent);
		if (pending) {
			pending.lines.push(line);
			return;
		}
		const timer = setTimeout(() => {
			const batch = this.reports.get(parent);
			this.reports.delete(parent);
			if (!batch?.lines.length) return;
			let session: ChatSessionRow;
			try {
				session = this.hub.thread(this.workspaceOf(parent), parent);
			} catch {
				return;
			}
			const text = `[Thread report]\n\n${batch.lines.map((item) => `- ${item}`).join("\n\n")}`;
			void this.hub
				.prompt(session.workspaceId, parent, text, [], "send", {
					origin: { kind: "grid", reason: "report" },
				})
				.catch((cause: unknown) => {
					console.warn(
						"[threads] could not report to a thread:",
						cause instanceof Error ? cause.message : cause,
					);
				});
		}, this.reportDelayMs);
		timer.unref?.();
		this.reports.set(parent, { lines: [line], timer });
	}

	private workspaceOf(id: string): string {
		return this.hub.sessionRow(id)?.workspaceId ?? "";
	}

	/** Until the thread is no longer working, waits on the person, or `timeoutS` passes. */
	private waitFor(id: string, timeoutS: number): Promise<WaitEnd> {
		if (!this.hub.isRunning(id)) return Promise.resolve("ended");
		if (this.hub.waitsOnPerson(id)) return Promise.resolve("waiting");
		return new Promise((resolve) => {
			let waiting = this.waiters.get(id);
			if (!waiting) {
				waiting = new Set();
				this.waiters.set(id, waiting);
			}
			const done = (end: WaitEnd) => {
				clearTimeout(timer);
				resolve(end);
			};
			const timer = setTimeout(() => {
				const left = this.waiters.get(id);
				left?.delete(done);
				if (left?.size === 0) this.waiters.delete(id);
				resolve("timeout");
			}, timeoutS * 1000);
			waiting.add(done);
		});
	}

	/** A thread an agent names, in its workspace; one elsewhere is one that does not exist. */
	private target(caller: Caller, args: Record<string, unknown>): ChatSessionRow {
		const id = threadId(str(args, "thread", 120));
		if (id === caller.thread?.id) throw new ChatError("That is your own thread", 400);
		return this.hub.thread(caller.who.workspace, id);
	}

	/** A thread the caller may change: its person's, and in no broader a mode than the caller's. */
	private changeable(caller: Caller, args: Record<string, unknown>): ChatSessionRow {
		if (!caller.write) throw new ChatError("This key may read threads but not change them", 403);
		const target = this.target(caller, args);
		if (target.ownerId !== caller.who.userId)
			throw new ChatError("That thread is someone else's; you can read it but not change it", 403);
		if (this.rank(target) > caller.rank)
			throw new ChatError(
				"That thread runs with broader permissions than yours, so you cannot direct it",
				403,
			);
		return target;
	}

	private rank(session: ChatSessionRow): number {
		return rankOf(session.mode ?? this.hub.agentInfo(session.provider)?.defaultMode);
	}

	private depth(session: ChatSessionRow | null): number {
		let depth = 0;
		let at: ChatSessionRow | null = session;
		while (at?.delegatedBy && depth <= MAX_DEPTH) {
			depth++;
			at = this.hub.sessionRow(at.delegatedBy);
		}
		return depth;
	}

	/**
	 * The mode a new thread runs in: the one asked for, the caller's (same agent), or the new
	 * agent's default; never broader than the caller's, stepping down to the broadest the new
	 * agent has within it.
	 */
	private modeFor(caller: Caller, provider: string, asked: string): string | undefined {
		const info = this.hub.agentInfo(provider);
		const ceiling = caller.rank;
		const modes = info?.modes ?? [];
		if (asked) {
			if (modes.length && !modes.some((mode) => mode.id === asked))
				throw new ChatError(`${info?.name ?? provider} has no mode ${asked}`, 400);
			if (rankOf(asked) > ceiling)
				throw new ChatError(`${asked} gives broader permissions than your own mode`, 403);
			return asked;
		}
		if (caller.thread && provider === caller.thread.provider && caller.thread.mode)
			return caller.thread.mode;
		const fallback = info?.defaultMode;
		if (rankOf(fallback) <= ceiling) return fallback;
		const within = modes
			.filter((mode) => rankOf(mode.id) <= ceiling)
			.sort((a, b) => rankOf(b.id) - rankOf(a.id))[0];
		if (!within)
			throw new ChatError(
				`${info?.name ?? provider} has no mode as narrow as yours; start it with another agent`,
				403,
			);
		return within.id;
	}

	private status(session: ChatSessionRow): string {
		if (!this.hub.isRunning(session.id)) {
			const end = this.hub.lastOutcome(session.id);
			return end ? { done: "finished", error: "failed", cancelled: "stopped" }[end] : "idle";
		}
		return this.hub.waitsOnPerson(session.id) ? "waiting on an answer" : "working";
	}

	/** What a wait ended with, as the agent is told it. */
	private afterWait(target: ChatSessionRow, end: WaitEnd): string {
		const events = this.hub.events(target.workspaceId, target.id);
		if (end === "timeout")
			return `${this.link(target)} is still ${this.status(target)}. Call thread_wait again to keep waiting; it carries on either way.`;
		if (end === "waiting") {
			const asked = openQuestions(events);
			if (asked.length)
				return `${this.link(target)} is waiting on an answer.\n${asked.map((item) => questionText(target.id, item)).join("\n\n")}\nAnswer it with thread_answer if you can; if it is the person's to decide, ask them.`;
			return `${this.link(target)} is waiting for the person to approve something; only they can. It carries on once they do.`;
		}
		const reply = this.hub.lastReply(target.id);
		return `${this.link(target)} ${this.status(target)}.${reply ? `\n\nIts last reply:\n${cut(reply, REPLY_MAX)}` : ""}`;
	}

	private link(session: ChatSessionRow): string {
		return threadLink(session);
	}

	private tools(): GridTool[] {
		return this.operations().map((operation) => ({
			name: operation.name,
			description: operation.description,
			inputSchema: operation.inputSchema,
			run: (session, args) => operation.run(this.callerOf(session), args),
		}));
	}

	/**
	 * The thread tools for any caller (see `Caller`): what a thread's agent is offered as Grid's
	 * tools, and what an outside agent is offered over MCP.
	 */
	operations(): ThreadOperation[] {
		const once = async (
			caller: Caller,
			tool: string,
			args: Record<string, unknown>,
			run: () => Promise<string> | string,
		): Promise<ToolAnswer> => {
			const requestId = requestIdOf(args);
			const key = requestId ? `tool:${tool}:${requestId}` : null;
			const kept = key ? caller.receipts.get(key) : null;
			if (kept) return `${kept}\n(Already done for request ${requestId}; nothing was repeated.)`;
			const answer = await run();
			if (key) caller.receipts.keep(key, answer);
			return answer;
		};
		// A thread's agent acts during its own turn; an outside agent whenever its key allows.
		const live = (caller: Caller) => {
			if (!caller.write) throw new ChatError("This key may read threads but not change them", 403);
			if (caller.thread && !this.hub.isRunning(caller.thread.id))
				throw new ChatError("Thread tools work during your own turn", 409);
		};
		const projectOf = (caller: Caller, args: Record<string, unknown>) => {
			const project = str(args, "project", 120, false) || caller.project;
			if (!project) throw new ChatError("Say which project (list_projects names them)", 400);
			return project;
		};
		const LINKS =
			" Threads are named as [title](grid-thread://id): the id is what follows grid-thread://, and writing the same link mentions the thread to the person.";

		return [
			{
				name: "thread_list",
				description: `List threads in a project (yours by default): each as a link, its agent, and whether it is working, waiting on an answer, finished, idle or snoozed. query filters by title.${LINKS}`,
				inputSchema: {
					type: "object",
					properties: {
						project: { type: "string" },
						query: { type: "string" },
						mine: { type: "boolean", description: "Only threads you started" },
						limit: { type: "number" },
					},
				},
				run: (caller, args) => {
					const project = projectOf(caller, args);
					const query = str(args, "query", 200, false).toLowerCase();
					const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
					const self = caller.thread?.id;
					const rows = this.hub
						.list(caller.who.workspace, project)
						.filter((row) => row.id !== self)
						.filter((row) => args.mine !== true || (self !== undefined && row.delegatedBy === self))
						.filter((row) => !query || row.title.toLowerCase().includes(query))
						.slice(0, limit);
					if (!rows.length) return "No threads found.";
					return rows
						.map(
							(row) =>
								`- ${this.link(row)} · ${this.hub.agentInfo(row.provider)?.name ?? row.provider} · ${this.status(row)}${this.hub.isSnoozed(row) ? " · snoozed" : ""}${self !== undefined && row.delegatedBy === self ? " · started by you" : ""}`,
						)
						.join("\n");
				},
			},
			{
				name: "thread_read",
				description: `Read a thread's turns: what was asked, the reply, files changed and commands run, oldest first, plus any question it is waiting on. from is the turn to start at (from 1; newest turns by default); use it to read turns a summary left out.${LINKS}`,
				inputSchema: {
					type: "object",
					properties: {
						thread: { type: "string", description: "Its id or grid-thread:// link" },
						from: { type: "number" },
						limit: { type: "number" },
					},
					required: ["thread"],
				},
				run: (caller, args) => {
					const id = threadId(str(args, "thread", 120));
					const target = this.hub.thread(caller.who.workspace, id);
					const events = this.hub.events(target.workspaceId, target.id);
					const turns = turnsOf(events);
					const limit = Math.min(READ_MAX_TURNS, Math.max(1, Number(args.limit) || READ_TURNS));
					const asked = Number(args.from);
					const start =
						Number.isFinite(asked) && asked >= 1
							? Math.floor(asked)
							: Math.max(1, turns.length - limit + 1);
					const shown = turns.filter((turn) => turn.n >= start).slice(0, limit);
					const lines = [
						`${this.link(target)} · ${this.hub.agentInfo(target.provider)?.name ?? target.provider} · ${this.status(target)} · ${turns.length} turns`,
						...shown.map((turn) => readTurn(turn)),
					];
					const last = shown.at(-1)?.n ?? 0;
					if (last < turns.length) lines.push(`(More: thread_read with from ${last + 1}.)`);
					if (start > 1 && !shown.length) lines.push("(No turns from there.)");
					for (const open of openQuestions(events)) lines.push(questionText(target.id, open));
					return lines.join("\n\n");
				},
			},
			{
				name: "thread_start",
				description:
					"Start a new thread with its own agent and send it a task (in your project unless project says another). It sees only the prompt, so make it self-contained (goal, context, constraints, what to report). provider and model pick the agent; mode may not be broader than yours. worktree gives it its own git worktree. wait: true waits for it (up to timeout seconds) and returns its reply; otherwise a thread's agent gets a [Thread report] when it finishes, and its questions come to it. requestId makes a retry safe.",
				inputSchema: {
					type: "object",
					properties: {
						prompt: { type: "string" },
						project: { type: "string" },
						title: { type: "string" },
						provider: { type: "string" },
						model: { type: "string" },
						mode: { type: "string" },
						worktree: { type: "boolean" },
						wait: { type: "boolean" },
						timeout: { type: "number" },
						requestId: { type: "string" },
					},
					required: ["prompt"],
				},
				run: async (caller, args) => {
					live(caller);
					const prompt = str(args, "prompt", 32_000);
					let child: ChatSessionRow | null = null;
					const answer = await once(caller, "thread_start", args, () => {
						child = this.start(caller, args, prompt, projectOf(caller, args));
						return `Started ${this.link(child)} with ${this.hub.agentInfo(child.provider)?.name ?? child.provider}.`;
					});
					const started = child as ChatSessionRow | null;
					if (args.wait !== true || !started) {
						return typeof answer === "string" && started
							? `${answer} It works on its own;${caller.thread ? " you will get a [Thread report] when it finishes, and its questions come to you." : " check on it with thread_wait or thread_read."}`
							: answer;
					}
					const end = await this.waitFor(started.id, seconds(args));
					return `${answer}\n\n${this.afterWait(this.hub.thread(caller.who.workspace, started.id), end)}`;
				},
			},
			{
				name: "thread_send",
				description:
					"Send a message to one of your person's threads. delivery: auto (default) starts an idle thread or goes into the turn going on; queue waits for the current turn to end; steer goes into the current turn now. requestId makes a retry safe.",
				inputSchema: {
					type: "object",
					properties: {
						thread: { type: "string" },
						message: { type: "string" },
						delivery: { type: "string", enum: ["auto", "queue", "steer"] },
						requestId: { type: "string" },
					},
					required: ["thread", "message"],
				},
				run: async (caller, args) => {
					live(caller);
					const target = this.changeable(caller, args);
					const message = str(args, "message", 32_000);
					const delivery = str(args, "delivery", 10, false) || "auto";
					if (!["auto", "queue", "steer"].includes(delivery))
						throw new ChatError("delivery is auto, queue or steer", 400);
					const requestId = requestIdOf(args);
					const running = this.hub.isRunning(target.id);
					const steer = delivery === "steer" || (delivery === "auto" && running);
					if (delivery === "steer" && !running)
						throw new ChatError("That thread is not working; send it with auto or queue", 409);
					const scope = caller.thread?.id ?? caller.who.userId;
					void this.hub
						.prompt(target.workspaceId, target.id, message, [], steer ? "steer" : "send", {
							origin: caller.origin,
							...(requestId ? { requestId: `${scope.slice(0, 36)}-${requestId}` } : {}),
						})
						.catch((cause: unknown) => {
							console.warn(
								"[threads] a message to a thread failed:",
								cause instanceof Error ? cause.message : cause,
							);
						});
					return running
						? `Sent to ${this.link(target)}, ${steer ? "into the turn it is working on" : "after its current turn"}.`
						: `Sent to ${this.link(target)}; it is working on it now.`;
				},
			},
			{
				name: "thread_wait",
				description: `Wait until a thread stops working or waits on an answer, up to timeout seconds (default ${WAIT_DEFAULT_S}, at most ${WAIT_MAX_S}); returns its last reply or what it is asking. A timeout leaves it working.`,
				inputSchema: {
					type: "object",
					properties: { thread: { type: "string" }, timeout: { type: "number" } },
					required: ["thread"],
				},
				run: async (caller, args) => {
					const target = this.target(caller, args);
					const end = await this.waitFor(target.id, seconds(args));
					return this.afterWait(this.hub.thread(caller.who.workspace, target.id), end);
				},
			},
			{
				name: "thread_stop",
				description:
					"Stop the turn a thread is working on. It keeps its history and can be sent more.",
				inputSchema: {
					type: "object",
					properties: { thread: { type: "string" } },
					required: ["thread"],
				},
				run: (caller, args) => {
					if (!caller.write)
						throw new ChatError("This key may read threads but not change them", 403);
					const target = this.target(caller, args);
					if (target.ownerId !== caller.who.userId)
						throw new ChatError("That thread is someone else's; you cannot stop it", 403);
					if (!this.hub.isRunning(target.id)) return `${this.link(target)} is not working.`;
					this.hub.cancel(target.workspaceId, target.id);
					return `Stopping ${this.link(target)}.`;
				},
			},
			{
				name: "thread_answer",
				description:
					'Answer a question a thread is waiting on (thread_read and thread_wait show them, with ids): answers maps each question\'s id to the labels picked, or to your own words, e.g. {"scope": ["Only the API"]}. Leave to the person anything that is theirs to decide.',
				inputSchema: {
					type: "object",
					properties: {
						thread: { type: "string" },
						question: { type: "string", description: "The question's id" },
						answers: {
							type: "object",
							additionalProperties: { type: "array", items: { type: "string" } },
						},
					},
					required: ["thread", "question", "answers"],
				},
				run: async (caller, args) => {
					live(caller);
					const target = this.changeable(caller, args);
					const question = str(args, "question", 200);
					const answers = readAnswers(args.answers);
					const asked = openQuestions(this.hub.events(target.workspaceId, target.id)).find(
						(item) => item.id === question,
					);
					if (!asked) throw new ChatError("That question is no longer waiting", 409);
					const known = new Set(asked.questions.map((item) => item.id));
					const unknown = Object.keys(answers).filter((key) => !known.has(key));
					if (unknown.length)
						throw new ChatError(
							`Not questions in it: ${unknown.join(", ")}; answer ${[...known].join(", ")}`,
							400,
						);
					await this.hub.answerQuestion(target.workspaceId, target.id, question, answers);
					return `Answered ${this.link(target)}; it carries on.`;
				},
			},
		];
	}

	/** Make a thread an agent asked for and send it its prompt (`thread_start`). */
	private start(
		caller: Caller,
		args: Record<string, unknown>,
		prompt: string,
		project: string,
	): ChatSessionRow {
		const parent = caller.thread;
		if (this.depth(parent) >= MAX_DEPTH)
			throw new ChatError(
				`Threads started from threads go ${MAX_DEPTH} deep at most; do this one yourself`,
				409,
			);
		// A thread's starts count per turn; an outside agent's per minute, kept across restarts.
		const turnKey = parent ? `${parent.id}:${this.hub.turnCount(parent.id)}` : null;
		const count = turnKey ? (this.started.get(turnKey) ?? 0) : 0;
		if (turnKey && count >= STARTS_PER_TURN)
			throw new ChatError(`At most ${STARTS_PER_TURN} threads can be started in one turn`, 429);
		if (!may(caller.who, "startAgents"))
			throw new ChatError("Your person may not start agents here", 403);
		if (!turnKey && !this.rates.take("outside-start", caller.who.userId, STARTS_PER_TURN, 60_000))
			throw new ChatError(`At most ${STARTS_PER_TURN} threads can be started a minute`, 429);
		const provider = str(args, "provider", 64, false) || caller.provider || "";
		if (!provider) throw new ChatError("Say which agent (provider) to start it with", 400);
		const sameAgent = parent && provider === parent.provider;
		const model = str(args, "model", 200, false) || (sameAgent ? (parent.model ?? "") : "");
		const mode = this.modeFor(caller, provider, str(args, "mode", 64, false));
		const inParentFolder = parent && project === parent.project;
		const child = this.hub.create(caller.who, {
			project,
			provider,
			...(inParentFolder ? { cwd: parent.cwd } : {}),
			...(model ? { model } : {}),
			...(mode ? { mode } : {}),
			worktree: args.worktree === true,
			...(parent ? { delegatedBy: parent.id } : {}),
			...(sameAgent && parent.account ? { account: parent.account } : {}),
		});
		if (turnKey) this.started.set(turnKey, count + 1);
		const title = str(args, "title", 120, false);
		if (title) this.hub.rename(caller.who.workspace, child.id, title);
		void this.hub
			.prompt(child.workspaceId, child.id, prompt, [], "send", { origin: caller.origin })
			.catch((cause: unknown) => {
				if (parent)
					this.report(
						parent.id,
						`${threadLink({ id: child.id, title: title || child.title })} could not start: ${cause instanceof Error ? cause.message : String(cause)}`,
					);
				else
					console.warn(
						"[threads] a thread an outside agent started could not start:",
						cause instanceof Error ? cause.message : cause,
					);
			});
		return this.hub.sessionRow(child.id) ?? child;
	}
}

/** One of the thread tools, for any caller. */
export type ThreadOperation = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	run: (caller: Caller, args: Record<string, unknown>) => Promise<ToolAnswer> | ToolAnswer;
};

/** A thread's id from what an agent passed: the id, or a grid-thread:// link to it. */
function threadId(given: string): string {
	const linked = given.match(/grid-thread:\/\/([\w-]{1,64})/);
	return linked?.[1] ?? given;
}

/** A turn as `thread_read` shows it. */
function readTurn(turn: TurnRecord): string {
	const origin = turn.origin;
	const from = !origin
		? "Person"
		: origin.kind === "grid"
			? "Grid"
			: origin.kind === "merge"
				? `Fork "${origin.thread.title}"`
				: origin.kind === "outside"
					? `${origin.agent} (outside Grid)`
					: origin.kind === "guest"
						? `${origin.name} (guest)`
						: `Agent in "${origin.thread.title}"`;
	const lines = [`Turn ${turn.n} — ${from}: ${cut(turn.asked, ASKED_MAX)}`];
	if (turn.replied.trim()) lines.push(`Reply: ${cut(turn.replied.trim(), REPLY_MAX)}`);
	if (turn.outcome !== "done")
		lines.push(
			turn.outcome === "open"
				? "(Still going.)"
				: turn.outcome === "cancelled"
					? "(Stopped.)"
					: `(Failed${turn.error ? `: ${cut(turn.error, 300)}` : ""})`,
		);
	if (turn.files.length) lines.push(`Files changed: ${turn.files.join(", ")}`);
	if (turn.commands.length)
		lines.push(
			`Commands: ${turn.commands
				.slice(0, 12)
				.map((item) => `\`${cut(item.command, 160)}\`${item.failed ? " (failed)" : ""}`)
				.join(", ")}`,
		);
	return lines.join("\n");
}

/** Answers as an agent gives them: per question id, a list of short strings. */
function readAnswers(raw: unknown): Record<string, string[]> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new ChatError("answers maps each question id to a list of answers", 400);
	const entries = Object.entries(raw as Record<string, unknown>);
	if (!entries.length || entries.length > 20)
		throw new ChatError("Answer between 1 and 20 questions", 400);
	const answers: Record<string, string[]> = {};
	for (const [id, value] of entries) {
		const list = typeof value === "string" ? [value] : value;
		if (
			!Array.isArray(list) ||
			list.length > 20 ||
			list.some((item) => typeof item !== "string" || item.length > 4_000)
		)
			throw new ChatError(`The answer to ${id} is a list of short texts`, 400);
		answers[id] = list as string[];
	}
	return answers;
}
