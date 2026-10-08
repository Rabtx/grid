import type { Database } from "bun:sqlite";

import { openPrivateDatabase } from "../private-database";
import { postRound, type Round } from "./thread-sync";

/** At most this many threads, and events across them, in one round per environment. */
const THREADS_PER_ROUND = 50;
const EVENTS_PER_ROUND = 1500;
/** How often to read the environments, and how long a slow one is waited on. */
const EVERY_MS = 15_000;
const TIMEOUT_MS = 10_000;

export type Environment = {
	id: string;
	workspaceId: string;
	label: string;
	url: string;
	token: string;
};

type Listed = {
	id: string;
	ownerId: string;
	workspaceId: string;
	project: string;
	provider: string;
	title: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	createdAt: string;
	updatedAt: string;
	lastSeq: number;
};

/**
 * Keeps the threads that run on paired environments in Grid's database. An environment holds no key
 * to Grid's API (a VPS that is taken over must not reach the database), so this home runner reads
 * them with the pairing token it already holds and sends them on with its own key, each
 * environment as its own machine. Like `ThreadSync`, only events after what the server confirmed
 * are read and sent. A thread an environment no longer lists, in a list it did answer, is deleted;
 * an environment that does not answer changes nothing.
 */
export class EnvironmentSync {
	private readonly db: Database;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;
	private readonly warned = new Set<string>();

	constructor(
		chatDb: string,
		private readonly environments: () => Environment[],
		private readonly api: { url: string; key: string },
		private readonly fetcher: typeof fetch = fetch,
	) {
		this.db = openPrivateDatabase(chatDb);
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS env_sync (
				environment_id TEXT NOT NULL,
				thread_id TEXT NOT NULL,
				seq INTEGER NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (environment_id, thread_id)
			);
		`);
	}

	start(): void {
		const tick = async () => {
			await this.syncAll();
			if (this.running) this.timer = setTimeout(tick, EVERY_MS);
		};
		this.running = true;
		this.timer = setTimeout(tick, 3_000);
	}

	stop(): void {
		this.running = false;
		if (this.timer) clearTimeout(this.timer);
	}

	/** One pass over every environment; one that fails is reported once and tried next time. */
	async syncAll(): Promise<void> {
		for (const environment of this.environments()) {
			try {
				await this.syncOne(environment);
				if (this.warned.delete(environment.id))
					console.log(`[runner] threads on ${environment.label} are being kept again`);
			} catch (error) {
				if (!this.warned.has(environment.id)) {
					this.warned.add(environment.id);
					console.warn(
						`[runner] could not keep the threads on ${environment.label}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}
	}

	/** Sends rounds for one environment until nothing is left. */
	async syncOne(environment: Environment): Promise<void> {
		for (let i = 0; i < 1000; i++) {
			const listed = await this.read<Listed[]>(environment, "/sync/threads");
			const round = await this.nextRound(environment, listed);
			if (!round) return;
			const result = await postRound(this.fetcher, this.api, round.round);
			this.remember(environment.id, round.round, result, round.lastSeqs);
		}
	}

	private async nextRound(
		environment: Environment,
		listed: Listed[],
	): Promise<{ round: Round; lastSeqs: Map<string, number> } | null> {
		const kept = new Map(
			this.db
				.query<{ thread_id: string; seq: number; updated_at: string }, [string]>(
					"SELECT thread_id, seq, updated_at FROM env_sync WHERE environment_id = ?",
				)
				.all(environment.id)
				.map((row) => [row.thread_id, row]),
		);
		const listedIds = new Set(listed.map((thread) => thread.id));
		const deleted = [...kept.keys()].filter((id) => !listedIds.has(id)).slice(0, 500);
		const changed = listed
			.filter((thread) => {
				const was = kept.get(thread.id);
				return !was || was.updated_at !== thread.updatedAt || thread.lastSeq > was.seq;
			})
			.slice(0, THREADS_PER_ROUND);
		if (!changed.length && !deleted.length) return null;

		let budget = EVENTS_PER_ROUND;
		const threads: Round["threads"] = [];
		const lastSeqs = new Map<string, number>();
		for (const thread of changed) {
			if (budget <= 0 && threads.length) break;
			const after = kept.get(thread.id)?.seq ?? 0;
			const events =
				thread.lastSeq > after
					? (
							await this.read<{ seq: number; data: unknown }[]>(
								environment,
								`/sync/threads/${encodeURIComponent(thread.id)}/events?after=${after}`,
							)
						).slice(0, Math.max(budget, 1))
					: [];
			budget -= events.length;
			lastSeqs.set(thread.id, thread.lastSeq);
			threads.push({
				id: thread.id,
				// The environment keeps its threads under the workspace it paired with: this one's.
				workspaceId: environment.workspaceId,
				project: thread.project,
				ownerId: thread.ownerId || null,
				provider: thread.provider,
				title: thread.title,
				model: thread.model,
				mode: thread.mode,
				effort: thread.effort,
				createdAt: thread.createdAt,
				updatedAt: thread.updatedAt,
				events,
			});
		}
		return {
			round: {
				machine: { id: `env-${environment.id}`.slice(0, 64), name: environment.label },
				threads,
				deleted,
			},
			lastSeqs,
		};
	}

	private remember(
		environmentId: string,
		round: Round,
		result: { seqs: Record<string, number>; skipped: string[] },
		lastSeqs: Map<string, number>,
	): void {
		const skipped = new Set(result.skipped);
		const mark = this.db.query(
			`INSERT INTO env_sync (environment_id, thread_id, seq, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (environment_id, thread_id) DO UPDATE SET seq = excluded.seq, updated_at = excluded.updated_at`,
		);
		this.db.transaction(() => {
			for (const thread of round.threads) {
				const last = lastSeqs.get(thread.id) ?? 0;
				const seq = skipped.has(thread.id) ? last : (result.seqs[thread.id] ?? 0);
				// Marked unchanged only once every event is through, or the server will not take it.
				mark.run(
					environmentId,
					thread.id,
					seq,
					skipped.has(thread.id) || seq >= last ? thread.updatedAt : "",
				);
			}
			for (const id of round.deleted)
				this.db
					.query("DELETE FROM env_sync WHERE environment_id = ? AND thread_id = ?")
					.run(environmentId, id);
		})();
	}

	private async read<T>(environment: Environment, path: string): Promise<T> {
		const reply = await this.fetcher(`${environment.url.replace(/\/$/, "")}${path}`, {
			headers: { authorization: `Bearer ${environment.token}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!reply.ok) throw new Error(`${path}: the environment answered ${reply.status}`);
		return ((await reply.json()) as { data: T }).data;
	}

	close(): void {
		this.stop();
		this.db.close();
	}
}
