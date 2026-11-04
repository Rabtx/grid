import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { openPrivateDatabase } from "../private-database";

/**
 * What a teammate has learned: a lesson is one line the team wants it to keep ("Use Badge, not
 * rounded-pill"). An agent proposes one when it is corrected; it is kept once a person approves it,
 * and from then on goes with every thread the teammate takes, whoever works with it.
 */
export type TeammateLesson = {
	id: string;
	workspaceId: string;
	teammateId: string;
	text: string;
	state: "proposed" | "kept";
	/** The thread it came from, when an agent proposed it there. */
	sessionId: string | null;
	createdAt: string;
};

/**
 * Where a card a teammate took stands:
 * - queued: waiting for one of its other cards to finish (it works on `parallel` at once);
 * - planning: writing its plan; plan_ready: the plan waits for a person to approve it;
 * - working: doing the card; review: done, its work waits for review (or the next teammate);
 * - needs_you: stuck (a turn failed) until a person looks; stopped: a person stopped it.
 */
export type RunState =
	| "queued"
	| "planning"
	| "plan_ready"
	| "working"
	| "review"
	| "needs_you"
	| "stopped";

export const OPEN_STATES: readonly RunState[] = ["queued", "planning", "plan_ready", "working"];

/** One card a teammate took on: which, in which thread, how far it got, and who gave it. */
export type TeammateRun = {
	id: string;
	workspaceId: string;
	teammateId: string;
	project: string;
	taskNumber: number;
	taskKey: string;
	taskTitle: string;
	taskBody: string;
	/** The person the run acts as on the board: who assigned the card or pressed Start. */
	ownerId: string;
	sessionId: string | null;
	state: RunState;
	/** The branch its worktree works on, once there is one. */
	branch: string | null;
	/** The run it was handed on from (a review after a build), when it was. */
	fromRun: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
	endedAt: string | null;
};

type LessonRow = {
	id: string;
	workspace_id: string;
	teammate_id: string;
	text: string;
	state: string;
	session_id: string | null;
	created_at: string;
};

type RunRow = {
	id: string;
	workspace_id: string;
	teammate_id: string;
	project: string;
	task_number: number;
	task_key: string;
	task_title: string;
	task_body: string;
	owner_id: string;
	session_id: string | null;
	state: string;
	branch: string | null;
	from_run: string | null;
	error: string | null;
	created_at: string;
	updated_at: string;
	ended_at: string | null;
};

/** Lessons one teammate keeps at most: a short memory it reads every time, not a wiki. */
export const MAX_LESSONS = 60;

const toLesson = (row: LessonRow): TeammateLesson => ({
	id: row.id,
	workspaceId: row.workspace_id,
	teammateId: row.teammate_id,
	text: row.text,
	state: row.state === "kept" ? "kept" : "proposed",
	sessionId: row.session_id,
	createdAt: row.created_at,
});

const toRun = (row: RunRow): TeammateRun => ({
	id: row.id,
	workspaceId: row.workspace_id,
	teammateId: row.teammate_id,
	project: row.project,
	taskNumber: row.task_number,
	taskKey: row.task_key,
	taskTitle: row.task_title,
	taskBody: row.task_body,
	ownerId: row.owner_id,
	sessionId: row.session_id,
	state: row.state as RunState,
	branch: row.branch,
	fromRun: row.from_run,
	error: row.error,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	endedAt: row.ended_at,
});

/** Teammates' lessons and card runs, in the runner's chat database beside their threads. */
export class TeammateStore {
	private readonly db: Database;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = openPrivateDatabase(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS teammate_lessons (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				teammate_id TEXT NOT NULL,
				text TEXT NOT NULL,
				state TEXT NOT NULL,
				session_id TEXT,
				created_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS lessons_by_teammate ON teammate_lessons (workspace_id, teammate_id, created_at);
			CREATE TABLE IF NOT EXISTS teammate_runs (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				teammate_id TEXT NOT NULL,
				project TEXT NOT NULL,
				task_number INTEGER NOT NULL,
				task_key TEXT NOT NULL,
				task_title TEXT NOT NULL,
				task_body TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				session_id TEXT,
				state TEXT NOT NULL,
				branch TEXT,
				from_run TEXT,
				error TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				ended_at TEXT
			);
			CREATE INDEX IF NOT EXISTS runs_by_workspace ON teammate_runs (workspace_id, created_at);
			CREATE INDEX IF NOT EXISTS runs_by_task ON teammate_runs (workspace_id, project, task_number);
		`);
	}

	lessons(workspaceId: string, teammateId: string): TeammateLesson[] {
		return this.db
			.query<LessonRow, [string, string]>(
				"SELECT * FROM teammate_lessons WHERE workspace_id = ? AND teammate_id = ? ORDER BY created_at, id",
			)
			.all(workspaceId, teammateId)
			.map(toLesson);
	}

	/** Every lesson in a workspace waiting for a person to approve it. */
	proposed(workspaceId: string): TeammateLesson[] {
		return this.db
			.query<LessonRow, [string]>(
				"SELECT * FROM teammate_lessons WHERE workspace_id = ? AND state = 'proposed' ORDER BY created_at, id",
			)
			.all(workspaceId)
			.map(toLesson);
	}

	/** Adds a lesson; null when the teammate already keeps as many as it may, or has this one. */
	addLesson(
		workspaceId: string,
		teammateId: string,
		text: string,
		state: TeammateLesson["state"],
		sessionId: string | null = null,
	): TeammateLesson | null {
		return this.db.transaction(() => {
			const current = this.lessons(workspaceId, teammateId);
			if (current.length >= MAX_LESSONS) return null;
			const same = text.trim().toLowerCase();
			if (current.some((lesson) => lesson.text.trim().toLowerCase() === same)) return null;
			const lesson: TeammateLesson = {
				id: crypto.randomUUID(),
				workspaceId,
				teammateId,
				text,
				state,
				sessionId,
				createdAt: new Date().toISOString(),
			};
			this.db
				.query(
					`INSERT INTO teammate_lessons (id, workspace_id, teammate_id, text, state, session_id, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(lesson.id, workspaceId, teammateId, text, state, sessionId, lesson.createdAt);
			return lesson;
		})();
	}

	/** Keeps a proposed lesson, or changes a lesson's words; the lesson as it now is, or null. */
	updateLesson(
		workspaceId: string,
		id: string,
		patch: { text?: string; state?: TeammateLesson["state"] },
	): TeammateLesson | null {
		const row = this.db
			.query<LessonRow, [string, string]>(
				"SELECT * FROM teammate_lessons WHERE workspace_id = ? AND id = ?",
			)
			.get(workspaceId, id);
		if (!row) return null;
		const next = { ...toLesson(row), ...patch };
		this.db
			.query("UPDATE teammate_lessons SET text = ?, state = ? WHERE workspace_id = ? AND id = ?")
			.run(next.text, next.state, workspaceId, id);
		return next;
	}

	removeLesson(workspaceId: string, id: string): void {
		this.db
			.query("DELETE FROM teammate_lessons WHERE workspace_id = ? AND id = ?")
			.run(workspaceId, id);
	}

	/** A teammate is gone: its lessons go with it; its runs stay, as history. */
	forget(workspaceId: string, teammateId: string): void {
		this.db
			.query("DELETE FROM teammate_lessons WHERE workspace_id = ? AND teammate_id = ?")
			.run(workspaceId, teammateId);
	}

	createRun(
		input: Omit<TeammateRun, "id" | "createdAt" | "updatedAt" | "endedAt" | "error" | "branch"> & {
			branch?: string | null;
		},
	): TeammateRun {
		const now = new Date().toISOString();
		const run: TeammateRun = {
			...input,
			id: crypto.randomUUID(),
			branch: input.branch ?? null,
			error: null,
			createdAt: now,
			updatedAt: now,
			endedAt: null,
		};
		this.db
			.query(
				`INSERT INTO teammate_runs (id, workspace_id, teammate_id, project, task_number, task_key, task_title,
				   task_body, owner_id, session_id, state, branch, from_run, error, created_at, updated_at, ended_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
			)
			.run(
				run.id,
				run.workspaceId,
				run.teammateId,
				run.project,
				run.taskNumber,
				run.taskKey,
				run.taskTitle,
				run.taskBody,
				run.ownerId,
				run.sessionId,
				run.state,
				run.branch,
				run.fromRun,
				now,
				now,
			);
		return run;
	}

	run(id: string): TeammateRun | null {
		const row = this.db.query<RunRow, [string]>("SELECT * FROM teammate_runs WHERE id = ?").get(id);
		return row ? toRun(row) : null;
	}

	/** Changes a run; an end state stamps when it ended. The run as it now is, or null. */
	updateRun(
		id: string,
		patch: Partial<Pick<TeammateRun, "state" | "sessionId" | "branch" | "error">>,
	): TeammateRun | null {
		const current = this.run(id);
		if (!current) return null;
		const now = new Date().toISOString();
		const next: TeammateRun = { ...current, ...patch, updatedAt: now };
		const ended = !(OPEN_STATES as readonly string[]).includes(next.state);
		next.endedAt = ended ? (current.endedAt ?? now) : null;
		this.db
			.query(
				`UPDATE teammate_runs SET state = ?, session_id = ?, branch = ?, error = ?, updated_at = ?, ended_at = ?
				 WHERE id = ?`,
			)
			.run(next.state, next.sessionId, next.branch, next.error, now, next.endedAt, id);
		return next;
	}

	/** A workspace's runs, newest first; for one teammate, one project or one card when asked. */
	runs(
		workspaceId: string,
		filter: { teammateId?: string; project?: string; taskNumber?: number; limit?: number } = {},
	): TeammateRun[] {
		const where = ["workspace_id = ?"];
		const params: (string | number)[] = [workspaceId];
		if (filter.teammateId) {
			where.push("teammate_id = ?");
			params.push(filter.teammateId);
		}
		if (filter.project) {
			where.push("project = ?");
			params.push(filter.project);
		}
		if (filter.taskNumber !== undefined) {
			where.push("task_number = ?");
			params.push(filter.taskNumber);
		}
		params.push(Math.min(filter.limit ?? 200, 500));
		return this.db
			.query<RunRow, (string | number)[]>(
				`SELECT * FROM teammate_runs WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id LIMIT ?`,
			)
			.all(...params)
			.map(toRun);
	}

	/** Runs that were under way when the runner stopped: their turns are gone with it. */
	interrupted(): TeammateRun[] {
		return this.db
			.query<RunRow, []>(
				"SELECT * FROM teammate_runs WHERE state IN ('planning', 'working') ORDER BY created_at",
			)
			.all()
			.map(toRun);
	}

	close(): void {
		this.db.close();
	}
}
