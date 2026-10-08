import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";

import { type Attachment, AttachmentFiles } from "../chat/attachments";

import { openPrivateDatabase } from "../private-database";

/** At most this many threads, and this many events across them, in one round. */
const THREADS_PER_ROUND = 50;
const EVENTS_PER_ROUND = 1500;
/** How often to look for changes, and how long to wait after a failed round. */
const EVERY_MS = 5_000;
const BACKOFF_MS = 30_000;

export type Machine = { id: string; name: string };

type SessionRow = {
	id: string;
	owner_id: string;
	workspace_id: string | null;
	project: string;
	provider: string;
	title: string;
	model: string | null;
	mode: string | null;
	effort: string | null;
	created_at: string;
	updated_at: string;
	last_seq: number | null;
	sent_seq: number | null;
};

export type Round = {
	machine: Machine;
	threads: {
		id: string;
		workspaceId: string;
		project: string;
		ownerId: string | null;
		provider: string;
		title: string;
		model: string | null;
		mode: string | null;
		effort: string | null;
		createdAt: string;
		updatedAt: string;
		events: { seq: number; data: unknown }[];
	}[];
	deleted: string[];
};

/**
 * Sends this runner's threads to Grid's database, so they outlive the machine. The runner keeps
 * working from its own SQLite; this follows behind it. Each thread is sent once its details change
 * or it gains events, with only the events after the last `seq` the server confirmed, so a lost
 * round, a restart or the API being down for a day all end in the same place. Deleted threads go
 * too, remembered by a trigger until the server has heard. A thread the server skips (a workspace
 * it does not know, or a thread another machine now holds) is not retried until it changes.
 */
export class ThreadSync {
	private readonly db: Database;
	readonly machine: Machine;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;
	private warned = false;
	private readonly files: AttachmentFiles;

	constructor(
		chatDb: string,
		private readonly api: { url: string; key: string },
		private readonly fetcher: typeof fetch = fetch,
	) {
		this.db = openPrivateDatabase(chatDb);
		this.db.exec("PRAGMA busy_timeout = 5000");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS sync_machine (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS sync_threads (
				session_id TEXT PRIMARY KEY,
				seq INTEGER NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS sync_deleted (session_id TEXT PRIMARY KEY);
			CREATE TABLE IF NOT EXISTS sync_attachments (
				session_id TEXT NOT NULL,
				id TEXT NOT NULL,
				PRIMARY KEY (session_id, id)
			);
			CREATE TRIGGER IF NOT EXISTS sync_on_delete AFTER DELETE ON sessions BEGIN
				INSERT OR IGNORE INTO sync_deleted (session_id) VALUES (old.id);
				DELETE FROM sync_threads WHERE session_id = old.id;
			END;
		`);
		this.machine = { id: this.machineId(), name: hostname() };
		this.files = new AttachmentFiles(resolve(dirname(chatDb), "attachments"));
	}

	/** This runner's machine, made once and kept in its database: what Grid knows it by. */
	private machineId(): string {
		const row = this.db.query<{ id: string }, []>("SELECT id FROM sync_machine LIMIT 1").get();
		if (row) return row.id;
		const id = randomUUID();
		this.db
			.query("INSERT INTO sync_machine (id, created_at) VALUES (?, ?)")
			.run(id, new Date().toISOString());
		return id;
	}

	start(): void {
		const tick = async () => {
			let wait = EVERY_MS;
			try {
				await this.drain();
				if (this.warned) console.log("[runner] thread sync is back");
				this.warned = false;
			} catch (error) {
				wait = BACKOFF_MS;
				if (!this.warned) {
					console.warn(
						`[runner] thread sync paused: ${error instanceof Error ? error.message : String(error)}`,
					);
					this.warned = true;
				}
			}
			if (this.running) this.timer = setTimeout(tick, wait);
		};
		this.running = true;
		this.timer = setTimeout(tick, 1_000);
	}

	stop(): void {
		this.running = false;
		if (this.timer) clearTimeout(this.timer);
	}

	/** Sends rounds until nothing is left to send. */
	async drain(): Promise<void> {
		for (let i = 0; i < 1000; i++) {
			const round = this.nextRound();
			if (!round) break;
			await this.send(round);
		}
		await this.sendAttachments();
	}

	/**
	 * Each attached file once, for threads the server already has. One it refuses (another machine
	 * holds the thread now) or that is gone from the disk is not tried again.
	 */
	private async sendAttachments(): Promise<void> {
		const pending = this.db
			.query<{ session_id: string; id: string; data: string }, []>(
				`SELECT a.session_id, a.id, a.data FROM attachments a
				   JOIN sync_threads t ON t.session_id = a.session_id
				  WHERE NOT EXISTS (SELECT 1 FROM sync_attachments s WHERE s.session_id = a.session_id AND s.id = a.id)
				  LIMIT 20`,
			)
			.all();
		const done = this.db.query(
			"INSERT OR IGNORE INTO sync_attachments (session_id, id) VALUES (?, ?)",
		);
		for (const row of pending) {
			const meta = JSON.parse(row.data) as Attachment;
			let bytes: Uint8Array | null = null;
			try {
				bytes = this.files.read(row.session_id, meta).bytes;
			} catch {
				// Gone from the disk: nothing left to keep.
			}
			if (bytes)
				await sendAttachment(this.fetcher, this.api, this.machine, row.session_id, meta, bytes);
			done.run(row.session_id, row.id);
		}
	}

	/** What changed since the server last confirmed, at most one round of it; null when nothing. */
	nextRound(): Round | null {
		const changed = this.db
			.query<SessionRow, [number]>(
				`SELECT s.id, s.owner_id, s.workspace_id, s.project, s.provider, s.title, s.model, s.mode,
				        s.effort, s.created_at, s.updated_at,
				        (SELECT MAX(seq) FROM events e WHERE e.session_id = s.id) AS last_seq,
				        t.seq AS sent_seq
				   FROM sessions s LEFT JOIN sync_threads t ON t.session_id = s.id
				  WHERE s.workspace_id IS NOT NULL
				    AND (t.session_id IS NULL OR t.updated_at != s.updated_at
				         OR COALESCE((SELECT MAX(seq) FROM events e WHERE e.session_id = s.id), 0) > t.seq)
				  ORDER BY s.updated_at
				  LIMIT ?`,
			)
			.all(THREADS_PER_ROUND);
		const deleted = this.db
			.query<{ session_id: string }, []>("SELECT session_id FROM sync_deleted LIMIT 500")
			.all()
			.map((row) => row.session_id);
		if (!changed.length && !deleted.length) return null;

		let budget = EVENTS_PER_ROUND;
		const threads: Round["threads"] = [];
		for (const row of changed) {
			if (budget <= 0 && threads.length) break;
			const after = row.sent_seq ?? 0;
			const events = this.db
				.query<{ seq: number; data: string }, [string, number, number]>(
					"SELECT seq, data FROM events WHERE session_id = ? AND seq > ? ORDER BY seq LIMIT ?",
				)
				.all(row.id, after, Math.max(budget, 1))
				.map((event) => ({ seq: event.seq, data: JSON.parse(event.data) as unknown }));
			budget -= events.length;
			threads.push({
				id: row.id,
				workspaceId: row.workspace_id ?? "",
				project: row.project,
				ownerId: row.owner_id || null,
				provider: row.provider,
				title: row.title,
				model: row.model,
				mode: row.mode,
				effort: row.effort,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
				events,
			});
		}
		return { machine: this.machine, threads, deleted };
	}

	private async send(round: Round): Promise<void> {
		const data = await postRound(this.fetcher, this.api, round);
		const skipped = new Set(data.skipped);
		const mark = this.db.query(
			`INSERT INTO sync_threads (session_id, seq, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT (session_id) DO UPDATE SET seq = excluded.seq, updated_at = excluded.updated_at`,
		);
		this.db.transaction(() => {
			for (const thread of round.threads) {
				const last = thread.events.at(-1)?.seq;
				// Skipped: not retried until it changes. Otherwise: where the server says it is, so a
				// server that lost events gets them again next round.
				const seq = skipped.has(thread.id)
					? (last ?? this.sentSeq(thread.id))
					: (data.seqs[thread.id] ?? 0);
				// A thread sent in part is marked unchanged only once all its events are through.
				const done = skipped.has(thread.id) || seq >= this.lastSeq(thread.id);
				mark.run(thread.id, seq, done ? thread.updatedAt : "");
			}
			for (const id of round.deleted)
				this.db.query("DELETE FROM sync_deleted WHERE session_id = ?").run(id);
		})();
	}

	private sentSeq(id: string): number {
		return (
			this.db
				.query<{ seq: number }, [string]>("SELECT seq FROM sync_threads WHERE session_id = ?")
				.get(id)?.seq ?? 0
		);
	}

	private lastSeq(id: string): number {
		return (
			this.db
				.query<{ seq: number | null }, [string]>(
					"SELECT MAX(seq) AS seq FROM events WHERE session_id = ?",
				)
				.get(id)?.seq ?? 0
		);
	}

	/** Marks imported threads as already in Grid's database, up to their last event. */
	markSynced(ids: string[]): void {
		const mark = this.db.query(
			`INSERT INTO sync_threads (session_id, seq, updated_at)
			 SELECT id, COALESCE((SELECT MAX(seq) FROM events e WHERE e.session_id = sessions.id), 0), updated_at
			   FROM sessions WHERE id = ?
			 ON CONFLICT (session_id) DO UPDATE SET seq = excluded.seq, updated_at = excluded.updated_at`,
		);
		this.db.transaction(() => {
			for (const id of ids) mark.run(id);
		})();
	}

	close(): void {
		this.stop();
		this.db.close();
	}
}

/** What the API answers a round with: how far each thread's copy is whole, and what it skipped. */
export type RoundResult = { seqs: Record<string, number>; skipped: string[] };

/** Sends one round to the API's runner sync route. */
export async function postRound(
	fetcher: typeof fetch,
	api: { url: string; key: string },
	round: Round,
): Promise<RoundResult> {
	const reply = await fetcher(`${api.url}/api/v1/runner/sync`, {
		method: "POST",
		headers: { authorization: `Runner ${api.key}`, "content-type": "application/json" },
		body: JSON.stringify(round),
	});
	if (!reply.ok) throw new Error(`the API answered ${reply.status}`);
	return ((await reply.json()) as { data: RoundResult }).data;
}

/**
 * Sends one attached file for a thread `machine` holds. True when kept; false when the server
 * refuses it because another machine holds the thread. Anything else is an error, tried again.
 */
export async function sendAttachment(
	fetcher: typeof fetch,
	api: { url: string; key: string },
	machine: Machine,
	threadId: string,
	attachment: Attachment,
	bytes: Uint8Array,
): Promise<boolean> {
	const reply = await fetcher(
		`${api.url}/api/v1/runner/threads/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(attachment.id)}`,
		{
			method: "PUT",
			headers: { authorization: `Runner ${api.key}`, "content-type": "application/json" },
			body: JSON.stringify({
				machine,
				name: attachment.name,
				mimeType: attachment.mimeType,
				size: attachment.size,
				data: Buffer.from(bytes).toString("base64"),
			}),
		},
	);
	if (reply.status === 409) return false;
	if (!reply.ok) throw new Error(`the API answered ${reply.status} for an attachment`);
	return true;
}
