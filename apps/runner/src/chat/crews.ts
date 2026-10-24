import type { Database } from "bun:sqlite";

import type { Who } from "../auth";
import { openPrivateDatabase } from "../private-database";
import { ChatError, type ChatHub, type GridTool } from "./hub";
import type { ChatSessionRow, SessionRole } from "./store";

/**
 * Crews: one coordinator chat that splits a request into tasks and hands each to a crew member,
 * a worker thread of its own. The coordinator gets tools to start, message, list and stop its
 * members; Grid starts at most `parallel` at once (the rest wait), tells the coordinator when a
 * member finishes, fails or gets stuck, and watches running members:
 *
 * - quiet for 10 minutes: nudged with a status check, in its turn;
 * - quiet 5 more: its turn is stopped and it is told to carry on (one attempt);
 * - quiet again after that: it is stopped and marked as needing the person, who can Retry or Stop.
 *
 * A member waiting on a person (an approval, a question) is never nudged: that wait is theirs.
 * Members' approvals are the person's to answer, here or in the member's thread; no agent has a
 * tool for them.
 */

export type WorkerState = "queued" | "working" | "done" | "failed" | "stopped" | "needs_you";

export type Crew = {
	id: string;
	workspaceId: string;
	ownerId: string;
	project: string;
	name: string;
	coordinatorId: string;
	instructions: string;
	workerProvider: string;
	workerModel: string | null;
	parallel: number;
	paused: boolean;
	createdAt: string;
};

export type Worker = {
	id: string;
	crewId: string;
	/** The coordinator's own name for the task, stable across its retries and wakes. */
	key: string;
	title: string;
	brief: string;
	provider: string;
	model: string | null;
	worktree: boolean;
	sessionId: string | null;
	state: WorkerState;
	/** Times its stalled turn has been stopped and restarted. */
	attempts: number;
	nudgedAt: number | null;
	createdAt: string;
	updatedAt: string;
};

/** When a running member counts as quiet, and how long a nudge gets before its turn is restarted. */
export const QUIET_MS = 10 * 60_000;
export const NUDGE_GRACE_MS = 5 * 60_000;
/** Restarts of a stalled turn before the member is handed to the person. */
export const MAX_ATTEMPTS = 1;
const REPORT_DELAY_MS = 2_000;
const REPORT_EXCERPT = 1_500;

export const NUDGE =
	"Status check from Grid: you have not shown progress for 10 minutes. Carry on if you are still working; otherwise say what is blocking you.";
export const RESTART =
	"Grid stopped your last turn because it stalled. Carry on with your task from where you were, and say if something is blocking you.";

type CrewRow = {
	id: string;
	workspace_id: string;
	owner_id: string;
	project: string;
	name: string;
	coordinator_id: string;
	instructions: string;
	worker_provider: string;
	worker_model: string | null;
	parallel: number;
	paused: number;
	created_at: string;
};

type WorkerRow = {
	id: string;
	crew_id: string;
	key: string;
	title: string;
	brief: string;
	provider: string;
	model: string | null;
	worktree: number;
	session_id: string | null;
	state: WorkerState;
	attempts: number;
	nudged_at: number | null;
	created_at: string;
	updated_at: string;
};

const crewOf = (row: CrewRow): Crew => ({
	id: row.id,
	workspaceId: row.workspace_id,
	ownerId: row.owner_id,
	project: row.project,
	name: row.name,
	coordinatorId: row.coordinator_id,
	instructions: row.instructions,
	workerProvider: row.worker_provider,
	workerModel: row.worker_model,
	parallel: row.parallel,
	paused: row.paused === 1,
	createdAt: row.created_at,
});

const workerOf = (row: WorkerRow): Worker => ({
	id: row.id,
	crewId: row.crew_id,
	key: row.key,
	title: row.title,
	brief: row.brief,
	provider: row.provider,
	model: row.model,
	worktree: row.worktree === 1,
	sessionId: row.session_id,
	state: row.state,
	attempts: row.attempts,
	nudgedAt: row.nudged_at,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

/** Crews and their members, in SQLite beside the chats. */
export class CrewStore {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS crews (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				project TEXT NOT NULL,
				name TEXT NOT NULL,
				coordinator_id TEXT NOT NULL UNIQUE,
				instructions TEXT NOT NULL,
				worker_provider TEXT NOT NULL,
				worker_model TEXT,
				parallel INTEGER NOT NULL,
				paused INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS crew_workers (
				id TEXT PRIMARY KEY,
				crew_id TEXT NOT NULL REFERENCES crews (id) ON DELETE CASCADE,
				key TEXT NOT NULL,
				title TEXT NOT NULL,
				brief TEXT NOT NULL,
				provider TEXT NOT NULL,
				model TEXT,
				worktree INTEGER NOT NULL,
				session_id TEXT,
				state TEXT NOT NULL,
				attempts INTEGER NOT NULL DEFAULT 0,
				nudged_at INTEGER,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE (crew_id, key)
			);
			CREATE INDEX IF NOT EXISTS crew_workers_session ON crew_workers (session_id);
		`);
		this.db.exec("PRAGMA foreign_keys = ON");
	}

	add(crew: Crew): void {
		this.db
			.query(
				`INSERT INTO crews (id, workspace_id, owner_id, project, name, coordinator_id, instructions, worker_provider, worker_model, parallel, paused, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				crew.id,
				crew.workspaceId,
				crew.ownerId,
				crew.project,
				crew.name,
				crew.coordinatorId,
				crew.instructions,
				crew.workerProvider,
				crew.workerModel,
				crew.parallel,
				crew.paused ? 1 : 0,
				crew.createdAt,
			);
	}

	get(id: string): Crew | null {
		const row = this.db.query<CrewRow, [string]>("SELECT * FROM crews WHERE id = ?").get(id);
		return row ? crewOf(row) : null;
	}

	byCoordinator(sessionId: string): Crew | null {
		const row = this.db
			.query<CrewRow, [string]>("SELECT * FROM crews WHERE coordinator_id = ?")
			.get(sessionId);
		return row ? crewOf(row) : null;
	}

	list(workspace: string, project: string): Crew[] {
		return this.db
			.query<CrewRow, [string, string]>(
				"SELECT * FROM crews WHERE workspace_id = ? AND project = ? ORDER BY created_at DESC",
			)
			.all(workspace, project)
			.map(crewOf);
	}

	all(): Crew[] {
		return this.db.query<CrewRow, []>("SELECT * FROM crews").all().map(crewOf);
	}

	update(
		id: string,
		fields: Partial<
			Pick<Crew, "name" | "instructions" | "workerProvider" | "workerModel" | "parallel" | "paused">
		>,
	): void {
		const columns: Record<string, string> = {
			name: "name",
			instructions: "instructions",
			workerProvider: "worker_provider",
			workerModel: "worker_model",
			parallel: "parallel",
			paused: "paused",
		};
		const entries = Object.entries(fields).filter(
			([key, value]) => key in columns && value !== undefined,
		);
		if (!entries.length) return;
		this.db
			.query(
				`UPDATE crews SET ${entries.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ?`,
			)
			.run(
				...entries.map(([, value]) =>
					typeof value === "boolean" ? (value ? 1 : 0) : (value as string | number | null),
				),
				id,
			);
	}

	remove(id: string): void {
		this.db.query("DELETE FROM crews WHERE id = ?").run(id);
	}

	addWorker(worker: Worker): void {
		this.db
			.query(
				`INSERT INTO crew_workers (id, crew_id, key, title, brief, provider, model, worktree, session_id, state, attempts, nudged_at, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				worker.id,
				worker.crewId,
				worker.key,
				worker.title,
				worker.brief,
				worker.provider,
				worker.model,
				worker.worktree ? 1 : 0,
				worker.sessionId,
				worker.state,
				worker.attempts,
				worker.nudgedAt,
				worker.createdAt,
				worker.updatedAt,
			);
	}

	workers(crewId: string): Worker[] {
		return this.db
			.query<WorkerRow, [string]>(
				"SELECT * FROM crew_workers WHERE crew_id = ? ORDER BY created_at",
			)
			.all(crewId)
			.map(workerOf);
	}

	worker(id: string): Worker | null {
		const row = this.db
			.query<WorkerRow, [string]>("SELECT * FROM crew_workers WHERE id = ?")
			.get(id);
		return row ? workerOf(row) : null;
	}

	workerBySession(sessionId: string): Worker | null {
		const row = this.db
			.query<WorkerRow, [string]>("SELECT * FROM crew_workers WHERE session_id = ?")
			.get(sessionId);
		return row ? workerOf(row) : null;
	}

	setWorker(
		id: string,
		fields: Partial<Pick<Worker, "state" | "sessionId" | "attempts" | "nudgedAt">>,
	): void {
		const columns: Record<string, string> = {
			state: "state",
			sessionId: "session_id",
			attempts: "attempts",
			nudgedAt: "nudged_at",
		};
		const entries = Object.entries(fields).filter(
			([key, value]) => key in columns && value !== undefined,
		);
		if (!entries.length) return;
		this.db
			.query(
				`UPDATE crew_workers SET ${entries.map(([key]) => `${columns[key]} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
			)
			.run(
				...entries.map(([, value]) => value as string | number | null),
				new Date().toISOString(),
				id,
			);
	}

	close(): void {
		this.db.close();
	}
}

/** What the coordinator is told it is, with the crew's own instructions. */
export function coordinatorBrief(
	crew: Pick<Crew, "name" | "project" | "parallel" | "instructions">,
): string {
	return [
		`You coordinate "${crew.name}", a crew of agents in Grid working on the project ${crew.project}.`,
		"Do small things yourself. For real work, split the person's request into independent tasks and give each to a crew member with crew_start_worker: a stable key per task, a short title, and a self-contained brief (the goal, what they need to know, constraints, and what to report back). Members do not see this conversation; the brief is all they get.",
		`Up to ${crew.parallel} members work at once; the rest wait their turn. Follow up on a member with crew_message_worker rather than starting a duplicate, check on them with crew_list_workers, and stop one with crew_stop_worker.`,
		'Grid sends you "[Crew report]" messages when members finish, fail or get stuck. Read them, tell the person where things stand in plain words, and decide what happens next.',
		"Members ask the person, not you, for approvals; you cannot approve for them.",
		crew.instructions.trim() ? `The crew's shared instructions:\n${crew.instructions.trim()}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

/** What a member is told it is, with the crew's shared instructions. */
export function memberBrief(crew: Pick<Crew, "name" | "instructions">): string {
	return [
		`You are a member of "${crew.name}", a crew of agents in Grid. Another agent coordinates the crew and gave you the task below.`,
		"Do the task fully. End with a short report: what you did, what is left, and anything blocking you. Ask the person when you need a decision only they can make.",
		crew.instructions.trim() ? `The crew's shared instructions:\n${crew.instructions.trim()}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

const KEY = /^[\w.-]{1,64}$/;

function str(
	args: Record<string, unknown>,
	key: string,
	max: number,
	required = true,
): string | undefined {
	const value = args[key];
	if (value === undefined || value === null || value === "") {
		if (required) throw new ChatError(`${key} is required`, 400);
		return undefined;
	}
	if (typeof value !== "string") throw new ChatError(`${key} must be text`, 400);
	if (value.length > max) throw new ChatError(`${key} is longer than ${max} characters`, 400);
	return value.trim();
}

export type CrewView = Crew & {
	workers: (Worker & { running: boolean; waiting: boolean })[];
};

/** The crews: their coordinators' tools, starting members, reports, and watching for stalls. */
export class Crews {
	private readonly reports = new Map<
		string,
		{ lines: string[]; timer: ReturnType<typeof setTimeout> }
	>();
	/** Members whose turn Grid stopped to restart: their turn's end is not reported. */
	private readonly restarting = new Set<string>();
	private timer: ReturnType<typeof setInterval> | null = null;

	private readonly now: () => number;
	private readonly reportDelayMs: number;

	constructor(
		private readonly store: CrewStore,
		private readonly hub: ChatHub,
		options: { now?: () => number; reportDelayMs?: number } = {},
	) {
		this.now = options.now ?? Date.now;
		this.reportDelayMs = options.reportDelayMs ?? REPORT_DELAY_MS;
		hub.onTurnEnded((session, reason) => this.turnEnded(session, reason));
		for (const tool of this.tools()) hub.registerTool(tool);
		// A runner that restarted cut its members' turns off: they wait for the person to Retry,
		// rather than holding the crew's places as "working" with nothing behind them.
		for (const crew of store.all())
			for (const worker of store.workers(crew.id))
				if (worker.state === "working" && !(worker.sessionId && hub.isRunning(worker.sessionId)))
					store.setWorker(worker.id, { state: "needs_you", nudgedAt: null });
	}

	/** Check running members every so often (see the class comment). */
	watch(everyMs = 30_000): void {
		this.timer ??= setInterval(() => {
			try {
				this.check();
			} catch (cause) {
				console.warn("[crews] check failed:", cause instanceof Error ? cause.message : cause);
			}
		}, everyMs);
		this.timer.unref?.();
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** Start a crew: its coordinator is a thread of its own, told what it is with the first message. */
	create(
		who: Who,
		input: {
			project: string;
			name: string;
			instructions?: string;
			provider: string;
			model?: string;
			workerProvider?: string;
			workerModel?: string;
			parallel?: number;
			cwd?: string;
		},
	): { crew: Crew; session: ChatSessionRow } {
		const name = input.name.trim().slice(0, 80);
		if (!name) throw new ChatError("Name the crew", 400);
		const parallel = Math.min(8, Math.max(1, Math.round(input.parallel ?? 3)));
		const instructions = (input.instructions ?? "").slice(0, 16_000);
		const id = crypto.randomUUID();
		const role: SessionRole = {
			id: `crew-${id}`,
			name: "Crew coordinator",
			icon: "research",
			brief: coordinatorBrief({ name, project: input.project, parallel, instructions }),
		};
		const session = this.hub.create(who, {
			project: input.project,
			provider: input.provider,
			...(input.cwd ? { cwd: input.cwd } : {}),
			...(input.model ? { model: input.model } : {}),
			worktree: false,
			role,
		});
		this.hub.rename(who.workspace, session.id, name);
		const crew: Crew = {
			id,
			workspaceId: who.workspace,
			ownerId: who.userId,
			project: input.project,
			name,
			coordinatorId: session.id,
			instructions,
			workerProvider: input.workerProvider ?? input.provider,
			workerModel: input.workerModel ?? null,
			parallel,
			paused: false,
			createdAt: new Date(this.now()).toISOString(),
		};
		this.store.add(crew);
		return { crew, session: { ...session, title: name } };
	}

	list(workspace: string, project: string): CrewView[] {
		return this.store.list(workspace, project).map((crew) => this.view(crew));
	}

	/** A crew with its members, by its id or its coordinator thread's id. */
	find(workspace: string, id: string): CrewView | null {
		const crew = this.store.get(id) ?? this.store.byCoordinator(id);
		if (!crew || crew.workspaceId !== workspace) return null;
		return this.view(crew);
	}

	private owned(workspace: string, id: string): Crew {
		const crew = this.store.get(id);
		if (!crew || crew.workspaceId !== workspace)
			throw new ChatError("That crew does not exist", 404);
		return crew;
	}

	private view(crew: Crew): CrewView {
		return {
			...crew,
			workers: this.store.workers(crew.id).map((worker) => ({
				...worker,
				running: worker.sessionId ? this.hub.isRunning(worker.sessionId) : false,
				waiting: worker.sessionId ? this.hub.waitsOnPerson(worker.sessionId) : false,
			})),
		};
	}

	/** Change a crew's settings; pausing stops new members starting, resuming starts what waits. */
	update(
		workspace: string,
		id: string,
		fields: Partial<
			Pick<Crew, "name" | "instructions" | "workerProvider" | "workerModel" | "parallel" | "paused">
		>,
	): CrewView {
		const crew = this.owned(workspace, id);
		const parallel =
			fields.parallel === undefined
				? undefined
				: Math.min(8, Math.max(1, Math.round(fields.parallel)));
		this.store.update(id, { ...fields, ...(parallel !== undefined ? { parallel } : {}) });
		if (fields.name?.trim()) this.hub.rename(workspace, crew.coordinatorId, fields.name);
		void this.pump(id);
		return this.view(this.owned(workspace, id));
	}

	/** Give a member that needed the person (or failed, or was stopped) another go. */
	async retry(workspace: string, crewId: string, workerId: string): Promise<void> {
		// Async for a member never started: starting one makes its thread first.
		const crew = this.owned(workspace, crewId);
		const worker = this.store.worker(workerId);
		if (!worker || worker.crewId !== crew.id)
			throw new ChatError("That crew member does not exist", 404);
		if (worker.sessionId && this.hub.isRunning(worker.sessionId))
			throw new ChatError("That crew member is working", 409);
		this.store.setWorker(worker.id, { attempts: 0, nudgedAt: null });
		if (!worker.sessionId) {
			this.store.setWorker(worker.id, { state: "queued" });
			await this.pump(crew.id);
			return;
		}
		this.store.setWorker(worker.id, { state: "working" });
		this.send(crew, worker, RESTART);
	}

	/**
	 * A message to a member, without waiting for the turn it starts: `prompt` resolves only when
	 * that turn ends. One that cannot be sent marks the member failed and says so.
	 */
	private send(crew: Crew, worker: Worker, text: string): void {
		const id = worker.sessionId;
		if (!id) return;
		void this.hub.prompt(crew.workspaceId, id, text).catch((cause: unknown) => {
			this.store.setWorker(worker.id, { state: "failed" });
			this.report(
				crew,
				`${worker.title} (${worker.key}) could not be sent a message: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		});
	}

	/** Stop a member: its turn, and its place in the crew's work. */
	stopWorker(workspace: string, crewId: string, workerId: string): void {
		const crew = this.owned(workspace, crewId);
		const worker = this.store.worker(workerId);
		if (!worker || worker.crewId !== crew.id)
			throw new ChatError("That crew member does not exist", 404);
		this.store.setWorker(worker.id, { state: "stopped" });
		if (worker.sessionId && this.hub.isRunning(worker.sessionId))
			this.hub.cancel(crew.workspaceId, worker.sessionId);
	}

	/** Start as many waiting members as the crew has room for. */
	async pump(crewId: string): Promise<void> {
		const crew = this.store.get(crewId);
		if (!crew || crew.paused) return;
		const workers = this.store.workers(crew.id);
		let room = crew.parallel - workers.filter((worker) => worker.state === "working").length;
		for (const worker of workers) {
			if (room <= 0) break;
			if (worker.state !== "queued") continue;
			room--;
			this.store.setWorker(worker.id, { state: "working" });
			try {
				await this.startWorker(crew, worker);
			} catch (cause) {
				this.store.setWorker(worker.id, { state: "failed" });
				this.report(
					crew,
					`${worker.title} (${worker.key}) could not start: ${cause instanceof Error ? cause.message : String(cause)}`,
				);
			}
		}
	}

	private async startWorker(crew: Crew, worker: Worker): Promise<void> {
		const session = await this.hub
			.createAutomation(
				{ userId: crew.ownerId, workspace: crew.workspaceId },
				{
					project: crew.project,
					provider: worker.provider,
					...(worker.model ? { model: worker.model } : {}),
					worktree: worker.worktree,
					role: {
						id: `crew-${crew.id}`,
						name: `${crew.name} crew`,
						icon: "code",
						brief: memberBrief(crew),
					},
				},
			)
			.catch(async (cause: unknown) => {
				// A project folder that is not a git repository has no worktree to give: share the folder.
				if (worker.worktree && cause instanceof ChatError && /git repository/.test(cause.message))
					return this.hub.createAutomation(
						{ userId: crew.ownerId, workspace: crew.workspaceId },
						{
							project: crew.project,
							provider: worker.provider,
							...(worker.model ? { model: worker.model } : {}),
							worktree: false,
							role: {
								id: `crew-${crew.id}`,
								name: `${crew.name} crew`,
								icon: "code",
								brief: memberBrief(crew),
							},
						},
					);
				throw cause;
			});
		this.hub.rename(crew.workspaceId, session.id, worker.title);
		this.store.setWorker(worker.id, { sessionId: session.id });
		this.send(crew, { ...worker, sessionId: session.id }, worker.brief);
	}

	private turnEnded(session: ChatSessionRow, reason: "done" | "cancelled" | "error"): void {
		const worker = this.store.workerBySession(session.id);
		if (!worker) return;
		const crew = this.store.get(worker.crewId);
		if (!crew) return;
		if (this.restarting.delete(worker.id)) {
			this.send(crew, worker, RESTART);
			return;
		}
		// Grid or the person already said where it stands (stopped, or handed to the person).
		const current = this.store.worker(worker.id);
		if (current?.state === "stopped" || current?.state === "needs_you") {
			this.report(
				crew,
				`${worker.title} (${worker.key}) ${current.state === "stopped" ? "was stopped" : "needs the person"}.`,
			);
			void this.pump(crew.id);
			return;
		}
		const state: WorkerState =
			reason === "done" ? "done" : reason === "error" ? "failed" : "stopped";
		this.store.setWorker(worker.id, { state, nudgedAt: null });
		const reply = this.hub.lastReply(session.id);
		const excerpt = reply.length > REPORT_EXCERPT ? `${reply.slice(0, REPORT_EXCERPT)}…` : reply;
		const said = { done: "finished", failed: "failed", stopped: "was stopped" }[
			state as "done" | "failed" | "stopped"
		];
		this.report(crew, `${worker.title} (${worker.key}) ${said}.${excerpt ? `\n${excerpt}` : ""}`);
		void this.pump(crew.id);
	}

	/**
	 * Tell the coordinator, a few reports at a time: several members finishing together wake it
	 * once. It is sent as a message, so it waits in the queue while the coordinator works.
	 */
	private report(crew: Crew, line: string): void {
		const pending = this.reports.get(crew.id);
		if (pending) {
			pending.lines.push(line);
			return;
		}
		const timer = setTimeout(() => {
			const batch = this.reports.get(crew.id);
			this.reports.delete(crew.id);
			if (!batch?.lines.length) return;
			const text = `[Crew report]\n\n${batch.lines.map((item) => `- ${item}`).join("\n\n")}`;
			void this.hub.prompt(crew.workspaceId, crew.coordinatorId, text).catch((cause: unknown) => {
				console.warn(
					"[crews] could not report to the coordinator:",
					cause instanceof Error ? cause.message : cause,
				);
			});
		}, this.reportDelayMs);
		timer.unref?.();
		this.reports.set(crew.id, { lines: [line], timer });
	}

	/** One pass over every running member (see the class comment). */
	check(): void {
		const now = this.now();
		for (const crew of this.store.all()) {
			for (const worker of this.store.workers(crew.id)) {
				if (worker.state !== "working" || !worker.sessionId) continue;
				const id = worker.sessionId;
				if (!this.hub.isRunning(id) || this.hub.waitsOnPerson(id)) continue;
				const active = this.hub.lastActivity(id) ?? now;
				if (worker.nudgedAt === null) {
					if (now - active < QUIET_MS) continue;
					this.store.setWorker(worker.id, { nudgedAt: now });
					void this.hub.prompt(crew.workspaceId, id, NUDGE, [], "steer").catch(() => undefined);
					continue;
				}
				// Back to work since the nudge: the count starts again.
				if (active > worker.nudgedAt) {
					this.store.setWorker(worker.id, { nudgedAt: null });
					continue;
				}
				if (now - worker.nudgedAt < NUDGE_GRACE_MS) continue;
				if (worker.attempts < MAX_ATTEMPTS) {
					this.store.setWorker(worker.id, { attempts: worker.attempts + 1, nudgedAt: null });
					this.restarting.add(worker.id);
					this.hub.cancel(crew.workspaceId, id);
					continue;
				}
				this.store.setWorker(worker.id, { state: "needs_you", nudgedAt: null });
				this.hub.cancel(crew.workspaceId, id);
			}
		}
	}

	/** The coordinator's tools: offered only in a crew's coordinator thread. */
	private tools(): GridTool[] {
		const offered = (session: ChatSessionRow) => this.store.byCoordinator(session.id) !== null;
		const crewOfThread = (session: ChatSessionRow) => {
			const crew = this.store.byCoordinator(session.id);
			if (!crew) throw new ChatError("Only a crew's coordinator has crew tools", 403);
			return crew;
		};
		const memberOf = (crew: Crew, key: string) => {
			const worker = this.store.workers(crew.id).find((item) => item.key === key);
			if (!worker) throw new ChatError(`No crew member has the key ${key}`, 404);
			return worker;
		};
		const status = (crew: Crew) =>
			this.view(crew)
				.workers.map(
					(worker) =>
						`${worker.key}: ${worker.title} — ${worker.waiting ? "waiting on the person" : worker.state.replace("_", " ")}`,
				)
				.join("\n") || "No crew members yet.";
		return [
			{
				name: "crew_start_worker",
				description:
					"Give a task to a new crew member: a worker agent in its own thread (and its own git worktree unless worktree is false). key names the task and stays the same if you are asked again; title is short; brief is everything the member needs, since it does not see this conversation. provider and model pick another agent for this member.",
				inputSchema: {
					type: "object",
					properties: {
						key: { type: "string", description: "Letters, digits, - _ . (e.g. api-routes)" },
						title: { type: "string" },
						brief: { type: "string" },
						provider: { type: "string" },
						model: { type: "string" },
						worktree: { type: "boolean" },
					},
					required: ["key", "title", "brief"],
				},
				offered,
				run: async (session, args) => {
					const crew = crewOfThread(session);
					const key = str(args, "key", 64) as string;
					if (!KEY.test(key))
						throw new ChatError("key may use letters, digits, - _ and . only", 400);
					const title = str(args, "title", 120) as string;
					const brief = str(args, "brief", 16_000) as string;
					const existing = this.store.workers(crew.id).find((worker) => worker.key === key);
					if (existing) {
						if (existing.brief !== brief)
							throw new ChatError(
								`A member already has the key ${key} with another brief; use crew_message_worker to change its task, or another key`,
								409,
							);
						return `Already started: ${existing.title} (${existing.state.replace("_", " ")}).`;
					}
					if (crew.paused)
						throw new ChatError("The crew is paused; the person has to resume it", 409);
					const now = new Date(this.now()).toISOString();
					this.store.addWorker({
						id: crypto.randomUUID(),
						crewId: crew.id,
						key,
						title,
						brief,
						provider: str(args, "provider", 64, false) ?? crew.workerProvider,
						model: str(args, "model", 200, false) ?? (args.provider ? null : crew.workerModel),
						worktree: args.worktree !== false,
						sessionId: null,
						state: "queued",
						attempts: 0,
						nudgedAt: null,
						createdAt: now,
						updatedAt: now,
					});
					await this.pump(crew.id);
					const started = this.store.workers(crew.id).find((worker) => worker.key === key);
					return started?.state === "queued"
						? `Queued ${title}: ${crew.parallel} members are already working; it starts when one finishes.`
						: `Started ${title}. You will get a [Crew report] when it finishes.`;
				},
			},
			{
				name: "crew_message_worker",
				description:
					"Send a crew member a follow-up: more detail, a correction, the next step. It waits for the member's current turn to end.",
				inputSchema: {
					type: "object",
					properties: { key: { type: "string" }, message: { type: "string" } },
					required: ["key", "message"],
				},
				offered,
				run: async (session, args) => {
					const crew = crewOfThread(session);
					const worker = memberOf(crew, str(args, "key", 64) as string);
					const message = str(args, "message", 16_000) as string;
					if (!worker.sessionId)
						return `${worker.title} has not started yet; it gets its brief when it does.`;
					this.store.setWorker(worker.id, { state: "working", nudgedAt: null });
					this.send(crew, worker, message);
					return `Sent to ${worker.title}; it reads it when its current turn ends.`;
				},
			},
			{
				name: "crew_list_workers",
				description: "List the crew's members: each one's key, title and where it stands.",
				inputSchema: { type: "object", properties: {} },
				offered,
				run: (session) => status(crewOfThread(session)),
			},
			{
				name: "crew_stop_worker",
				description: "Stop a crew member: its turn ends and it takes no more work until restarted.",
				inputSchema: {
					type: "object",
					properties: { key: { type: "string" } },
					required: ["key"],
				},
				offered,
				run: (session, args) => {
					const crew = crewOfThread(session);
					const worker = memberOf(crew, str(args, "key", 64) as string);
					this.stopWorker(crew.workspaceId, crew.id, worker.id);
					return `Stopped ${worker.title}.`;
				},
			},
		];
	}
}
