import type { Database } from "bun:sqlite";

import type { GoalStatus } from "../agents/events";
import { openPrivateDatabase } from "../private-database";

/**
 * What keeps threads going on their own, in SQLite beside the chats so a restart keeps it: a
 * thread waiting for its usage limit to reset, the pull requests agents watch, and each thread's
 * goal.
 */

/** A thread a used-up plan stopped, to carry on at `resumeAt`. */
export type LimitResume = { sessionId: string; resumeAt: string; createdAt: string };

/** What a watch last saw of a pull request, to tell only what is new. */
export type PullSnapshot = {
	state: string;
	head: string;
	/** Check names on `head` that have failed. */
	failing: string[];
	/** Every check on `head` has finished and none failed. */
	passed: boolean;
	conflict: boolean;
	/** Ids of reviews and comments seen so far. */
	seen: string[];
};

export type PullWatch = {
	sessionId: string;
	repo: string;
	number: number;
	title: string;
	url: string;
	snapshot: PullSnapshot | null;
	/** Wakes in a row that brought only comments; failed reads in a row. */
	commentWakes: number;
	failures: number;
	createdAt: string;
};

export type Goal = {
	sessionId: string;
	objective: string;
	status: GoalStatus;
	turns: number;
	maxTurns: number;
	updatedAt: string;
};

type PullRow = {
	session_id: string;
	repo: string;
	number: number;
	title: string;
	url: string;
	snapshot: string | null;
	comment_wakes: number;
	failures: number;
	created_at: string;
};

type GoalRow = {
	session_id: string;
	objective: string;
	status: GoalStatus;
	turns: number;
	max_turns: number;
	updated_at: string;
};

const pullOf = (row: PullRow): PullWatch => ({
	sessionId: row.session_id,
	repo: row.repo,
	number: row.number,
	title: row.title,
	url: row.url,
	snapshot: row.snapshot ? (JSON.parse(row.snapshot) as PullSnapshot) : null,
	commentWakes: row.comment_wakes,
	failures: row.failures,
	createdAt: row.created_at,
});

const goalOf = (row: GoalRow): Goal => ({
	sessionId: row.session_id,
	objective: row.objective,
	status: row.status,
	turns: row.turns,
	maxTurns: row.max_turns,
	updatedAt: row.updated_at,
});

export class AutonomyStore {
	private readonly db: Database;

	constructor(path: string) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS limit_resumes (
				session_id TEXT PRIMARY KEY,
				resume_at TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS pull_watches (
				session_id TEXT NOT NULL,
				repo TEXT NOT NULL,
				number INTEGER NOT NULL,
				title TEXT NOT NULL,
				url TEXT NOT NULL,
				snapshot TEXT,
				comment_wakes INTEGER NOT NULL DEFAULT 0,
				failures INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL,
				PRIMARY KEY (session_id, repo, number)
			);
			CREATE TABLE IF NOT EXISTS goals (
				session_id TEXT PRIMARY KEY,
				objective TEXT NOT NULL,
				status TEXT NOT NULL,
				turns INTEGER NOT NULL,
				max_turns INTEGER NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
	}

	close(): void {
		this.db.close();
	}

	setLimitResume(sessionId: string, resumeAt: string, now = new Date()): void {
		this.db
			.query(
				`INSERT INTO limit_resumes (session_id, resume_at, created_at) VALUES (?, ?, ?)
				 ON CONFLICT (session_id) DO UPDATE SET resume_at = excluded.resume_at`,
			)
			.run(sessionId, resumeAt, now.toISOString());
	}

	limitResume(sessionId: string): LimitResume | null {
		const row = this.db
			.query<{ session_id: string; resume_at: string; created_at: string }, [string]>(
				"SELECT * FROM limit_resumes WHERE session_id = ?",
			)
			.get(sessionId);
		return row
			? { sessionId: row.session_id, resumeAt: row.resume_at, createdAt: row.created_at }
			: null;
	}

	/** Resumes due by `now`, oldest first. */
	dueLimitResumes(now: Date): LimitResume[] {
		return this.db
			.query<{ session_id: string; resume_at: string; created_at: string }, [string]>(
				"SELECT * FROM limit_resumes WHERE resume_at <= ? ORDER BY resume_at",
			)
			.all(now.toISOString())
			.map((row) => ({
				sessionId: row.session_id,
				resumeAt: row.resume_at,
				createdAt: row.created_at,
			}));
	}

	dropLimitResume(sessionId: string): boolean {
		return (
			this.db.query("DELETE FROM limit_resumes WHERE session_id = ?").run(sessionId).changes > 0
		);
	}

	addPullWatch(watch: Omit<PullWatch, "commentWakes" | "failures">): void {
		this.db
			.query(
				`INSERT INTO pull_watches (session_id, repo, number, title, url, snapshot, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (session_id, repo, number) DO UPDATE SET title = excluded.title, url = excluded.url`,
			)
			.run(
				watch.sessionId,
				watch.repo,
				watch.number,
				watch.title,
				watch.url,
				watch.snapshot ? JSON.stringify(watch.snapshot) : null,
				watch.createdAt,
			);
	}

	pullWatches(sessionId?: string): PullWatch[] {
		return (
			sessionId
				? this.db
						.query<PullRow, [string]>(
							"SELECT * FROM pull_watches WHERE session_id = ? ORDER BY created_at",
						)
						.all(sessionId)
				: this.db.query<PullRow, []>("SELECT * FROM pull_watches ORDER BY created_at").all()
		).map(pullOf);
	}

	updatePullWatch(
		watch: Pick<PullWatch, "sessionId" | "repo" | "number">,
		fields: Partial<Pick<PullWatch, "snapshot" | "commentWakes" | "failures" | "title">>,
	): void {
		const current = this.pullWatches(watch.sessionId).find(
			(item) => item.repo === watch.repo && item.number === watch.number,
		);
		if (!current) return;
		const next = { ...current, ...fields };
		this.db
			.query(
				`UPDATE pull_watches SET snapshot = ?, comment_wakes = ?, failures = ?, title = ?
				 WHERE session_id = ? AND repo = ? AND number = ?`,
			)
			.run(
				next.snapshot ? JSON.stringify(next.snapshot) : null,
				next.commentWakes,
				next.failures,
				next.title,
				watch.sessionId,
				watch.repo,
				watch.number,
			);
	}

	dropPullWatch(sessionId: string, repo?: string, number?: number): number {
		if (repo !== undefined && number !== undefined)
			return this.db
				.query("DELETE FROM pull_watches WHERE session_id = ? AND repo = ? AND number = ?")
				.run(sessionId, repo, number).changes;
		return this.db.query("DELETE FROM pull_watches WHERE session_id = ?").run(sessionId).changes;
	}

	goal(sessionId: string): Goal | null {
		const row = this.db
			.query<GoalRow, [string]>("SELECT * FROM goals WHERE session_id = ?")
			.get(sessionId);
		return row ? goalOf(row) : null;
	}

	setGoal(goal: Omit<Goal, "updatedAt">, now = new Date()): Goal {
		this.db
			.query(
				`INSERT INTO goals (session_id, objective, status, turns, max_turns, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT (session_id) DO UPDATE SET objective = excluded.objective,
					status = excluded.status, turns = excluded.turns, max_turns = excluded.max_turns,
					updated_at = excluded.updated_at`,
			)
			.run(
				goal.sessionId,
				goal.objective,
				goal.status,
				goal.turns,
				goal.maxTurns,
				now.toISOString(),
			);
		return { ...goal, updatedAt: now.toISOString() };
	}

	/** Forget everything a deleted thread had here. */
	forget(sessionId: string): void {
		this.db.transaction(() => {
			this.db.query("DELETE FROM limit_resumes WHERE session_id = ?").run(sessionId);
			this.db.query("DELETE FROM pull_watches WHERE session_id = ?").run(sessionId);
			this.db.query("DELETE FROM goals WHERE session_id = ?").run(sessionId);
		})();
	}
}
