import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { ChatSessionRow } from "../chat/store";
import {
	generateVapidKeys,
	type PushSubscriptionKeys,
	sendPush,
	type VapidKeys,
	vapidPublicKey,
} from "./web-push";

/** What a notification says and where tapping it goes. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/**
 * The push services browsers actually use. The runner only ever posts to these, so a
 * subscription cannot turn it into a way to reach arbitrary hosts.
 */
const PUSH_HOSTS = [
	/^fcm\.googleapis\.com$/,
	/^android\.googleapis\.com$/,
	/(^|\.)push\.apple\.com$/,
	/(^|\.)push\.services\.mozilla\.com$/,
	/(^|\.)notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
	} catch {
		return false;
	}
}

/**
 * The line a finished turn or a waiting approval deserves while nobody is looking, or null when
 * it needs none (a turn the person cancelled themselves).
 */
export function attentionMessage(session: ChatSessionRow, event: ChatEvent): PushMessage | null {
	const url = `/chat/${encodeURIComponent(session.project)}/${encodeURIComponent(session.id)}`;
	const base = { title: session.title, url, tag: session.id };
	if (event.type === "approval") return { ...base, body: `Needs your approval: ${event.title}` };
	if (event.type !== "turn_end") return null;
	if (event.reason === "done") return { ...base, body: "Finished — tap to see what it did." };
	if (event.reason === "error")
		return { ...base, body: `Stopped: ${event.error ?? "the agent hit an error"}` };
	return null;
}

type SubscriptionRow = {
	endpoint: string;
	owner_id: string;
	p256dh: string;
	auth: string;
	subject: string;
};

/**
 * Every device that asked to hear from this runner, and the VAPID keys it signs with. Both live
 * in SQLite beside the chat log, so they survive restarts and move with the data dir.
 */
export class PushNotifier {
	private readonly db: Database;
	private vapid: Promise<VapidKeys> | null = null;

	constructor(
		path: string,
		private readonly fetcher: typeof fetch = fetch,
	) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path, { create: true });
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS push_vapid (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				keys TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS push_subscriptions (
				endpoint TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				p256dh TEXT NOT NULL,
				auth TEXT NOT NULL,
				subject TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
		`);
	}

	/** The key pair, made on first use and kept: changing it would orphan every subscription. */
	private keys(): Promise<VapidKeys> {
		this.vapid ??= (async () => {
			const kept = this.db
				.query<{ keys: string }, []>("SELECT keys FROM push_vapid WHERE id = 1")
				.get();
			if (kept) return JSON.parse(kept.keys) as VapidKeys;
			const fresh = await generateVapidKeys();
			this.db
				.query("INSERT OR IGNORE INTO push_vapid (id, keys) VALUES (1, ?)")
				.run(JSON.stringify(fresh));
			const saved = this.db
				.query<{ keys: string }, []>("SELECT keys FROM push_vapid WHERE id = 1")
				.get();
			return JSON.parse(saved?.keys ?? JSON.stringify(fresh)) as VapidKeys;
		})();
		return this.vapid;
	}

	/** For the browser's `applicationServerKey`. */
	async publicKey(): Promise<string> {
		return vapidPublicKey(await this.keys());
	}

	/**
	 * Remember a device. `subject` is how the push service can reach whoever runs this Grid: the
	 * console's https origin, as RFC 8292 asks.
	 */
	subscribe(ownerId: string, subscription: PushSubscriptionKeys, subject: string): void {
		this.db
			.query(
				`INSERT INTO push_subscriptions (endpoint, owner_id, p256dh, auth, subject, created_at)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT (endpoint) DO UPDATE SET owner_id = excluded.owner_id,
					p256dh = excluded.p256dh, auth = excluded.auth, subject = excluded.subject`,
			)
			.run(
				subscription.endpoint,
				ownerId,
				subscription.p256dh,
				subscription.auth,
				subject,
				new Date().toISOString(),
			);
	}

	unsubscribe(ownerId: string, endpoint: string): void {
		this.db
			.query("DELETE FROM push_subscriptions WHERE endpoint = ? AND owner_id = ?")
			.run(endpoint, ownerId);
	}

	/** How many devices this person has subscribed, for the settings screen. */
	count(ownerId: string): number {
		return (
			this.db
				.query<{ n: number }, [string]>(
					"SELECT COUNT(*) AS n FROM push_subscriptions WHERE owner_id = ?",
				)
				.get(ownerId)?.n ?? 0
		);
	}

	/**
	 * Tell every one of this person's devices, and say how many the push services accepted. Never
	 * throws: a failed push is only logged.
	 */
	async notify(ownerId: string, message: PushMessage): Promise<number> {
		const rows = this.db
			.query<SubscriptionRow, [string]>("SELECT * FROM push_subscriptions WHERE owner_id = ?")
			.all(ownerId);
		if (rows.length === 0) return 0;
		const keys = await this.keys();
		const results = await Promise.all(
			rows.map(async (row) => {
				try {
					const result = await sendPush(
						{ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
						message,
						keys,
						row.subject,
						this.fetcher,
					);
					if (result === "expired") this.unsubscribe(row.owner_id, row.endpoint);
					else if (result === "failed")
						console.warn(`[runner] push to ${new URL(row.endpoint).host} was refused`);
					return result === "sent";
				} catch (cause) {
					console.warn(
						`[runner] push to ${new URL(row.endpoint).host} failed:`,
						cause instanceof Error ? cause.message : cause,
					);
					return false;
				}
			}),
		);
		return results.filter(Boolean).length;
	}
}
