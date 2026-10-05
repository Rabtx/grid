import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { ChatSessionRow } from "../chat/store";
import { isQuiet } from "../prefs/quiet";
import type { NotifyKind, NotifyPrefs } from "../prefs/store";
import {
	generateVapidKeys,
	type PushSubscriptionKeys,
	sendPush,
	type VapidKeys,
	vapidPublicKey,
} from "./web-push";

/** What a notification says and where tapping it goes. */
export type PushMessage = {
	title: string;
	body: string;
	url: string;
	tag: string;
	/** Buttons on the notification (an approval's options), answered with `act`. */
	actions?: { action: string; title: string }[];
	/** A one-time token the service worker answers the buttons with. */
	act?: string;
};

/** A device someone gets notifications on, as Settings lists it. */
export type PushDevice = {
	id: string;
	label: string;
	kind: "desktop" | "phone";
	createdAt: string;
};

/** An approval answered from a notification: whose, and which. */
export type PushAct = { ownerId: string; workspace: string; sessionId: string; approvalId: string };

/** How long an approval's buttons on a notification keep working. */
const ACT_MS = 30 * 60_000;

/** Whether a browser is a phone's, from its user agent. */
export function deviceKind(userAgent: string): "desktop" | "phone" {
	return /iPhone|iPod|Android.*Mobile|Mobi/i.test(userAgent) ? "phone" : "desktop";
}

/** A device's name from its user agent: "Chrome on Linux", "Safari on iPhone". */
export function deviceLabel(userAgent: string): string {
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Firefox\//.test(userAgent)
			? "Firefox"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: "Browser";
	const system = /iPhone/.test(userAgent)
		? "iPhone"
		: /iPad/.test(userAgent)
			? "iPad"
			: /Android/.test(userAgent)
				? "Android"
				: /Mac OS X|Macintosh/.test(userAgent)
					? "Mac"
					: /Windows/.test(userAgent)
						? "Windows"
						: /Linux/.test(userAgent)
							? "Linux"
							: "this device";
	return `${browser} on ${system}`;
}

function endpointId(endpoint: string): string {
	return new Bun.CryptoHasher("sha256").update(endpoint).digest("hex").slice(0, 16);
}

/**
 * The push services browsers actually use. The runner only ever posts to these, so a
 * subscription cannot turn it into a way to reach arbitrary hosts.
 */
const PUSH_HOSTS = [
	// Chrome and Chromium: FCM, on googleapis.com or (some builds) other Google hosts.
	/(^|\.)googleapis\.com$/,
	/(^|\.)google\.com$/,
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

/** Which kind of wait a moment in a thread is, and the line that says so. */
export type Attention = { kind: "approval" | "turn_done" | "turn_error"; body: string };

/**
 * What a finished turn or a waiting approval deserves while nobody is looking, or null when it
 * needs none (a turn the person cancelled themselves). The Inbox is fed from the same answer, so
 * a thread never waits for one thing and goes quiet for the other.
 */
export function attention(event: ChatEvent): Attention | null {
	if (event.type === "approval")
		return { kind: "approval", body: `Needs your approval: ${event.title}` };
	if (event.type !== "turn_end") return null;
	if (event.reason === "done") {
		return { kind: "turn_done", body: "Finished — tap to see what it did." };
	}
	if (event.reason === "error") {
		return { kind: "turn_error", body: `Stopped: ${event.error ?? "the agent hit an error"}` };
	}
	return null;
}

/** The reply the agent's last turn ended on, to tell a question from a finished run. */
export function lastReply(events: readonly ChatEvent[]): string {
	let reply = "";
	for (const event of events) {
		if (event.type === "turn_start") reply = "";
		else if (event.type === "message") reply += event.text;
	}
	return reply.trim();
}

/**
 * Which kind of update a moment in a thread is, for the person's notification settings: an
 * approval, a turn that ended asking them something, or a run that finished or failed.
 */
export function notifyKind(event: ChatEvent, reply: string): NotifyKind {
	if (event.type === "approval") return "approvals";
	if (event.type === "turn_end" && event.reason === "done" && reply.endsWith("?"))
		return "questions";
	return "runs";
}

/** An approval's buttons on a notification: allow once, then deny (platforms show two). */
export function approvalActions(
	options: readonly { id: string; label: string; kind: string }[],
): { action: string; title: string }[] {
	const allow = options.find((option) => option.kind === "allow");
	const deny = options.find((option) => option.kind === "deny");
	return [allow, deny]
		.filter((option) => option !== undefined)
		.map((option) => ({ action: option.id, title: option.label }));
}

/** Where a thread lives, for anything that has to take the person there. */
export function chatUrl(session: ChatSessionRow): string {
	return `/chat/${encodeURIComponent(session.project)}/${encodeURIComponent(session.id)}`;
}

// The agents' names as people know them, for a notification's title.
const AGENT_NAMES: Record<string, string> = {
	claude: "Claude Code",
	codex: "Codex",
	opencode: "opencode",
	antigravity: "Antigravity",
	freebuff: "Freebuff",
};

const VERB = /^(run|edit|write|create|delete|remove|read|fetch|open|move|rename|install|push)\b/i;

/** What an approval asks, as a person would say it: "Wants to run bun add zod". */
export function approvalLine(title: string): string {
	const asked = title.trim();
	return VERB.test(asked)
		? `Wants to ${asked[0]?.toLowerCase() ?? ""}${asked.slice(1)}`
		: `Wants to run ${asked}`;
}

export function attentionMessage(session: ChatSessionRow, event: ChatEvent): PushMessage | null {
	const what = attention(event);
	if (!what) return null;
	const message = { url: chatUrl(session), tag: session.id };
	// An approval says who needs you and what for, so it can be answered from the lock screen.
	if (event.type === "approval")
		return {
			...message,
			title: `${AGENT_NAMES[session.provider] ?? session.provider} needs you`,
			body: `${approvalLine(event.title)} in ${session.project} · ${session.title}`,
		};
	return { ...message, title: session.title, body: what.body };
}

type SubscriptionRow = {
	endpoint: string;
	owner_id: string;
	p256dh: string;
	auth: string;
	subject: string;
	user_agent: string | null;
	created_at: string;
};

/**
 * Every device that asked to hear from this runner, and the VAPID keys it signs with. Both live
 * in SQLite beside the chat log, so they survive restarts and move with the data dir.
 */
export class PushNotifier {
	private readonly db: Database;
	private vapid: Promise<VapidKeys> | null = null;
	private prefsOf: ((ownerId: string) => NotifyPrefs) | null = null;

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
			CREATE TABLE IF NOT EXISTS push_held (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				owner_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				message TEXT NOT NULL,
				held_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS push_seen (
				owner_id TEXT NOT NULL,
				key TEXT NOT NULL,
				seen_at TEXT NOT NULL,
				PRIMARY KEY (owner_id, key)
			);
			CREATE TABLE IF NOT EXISTS push_acts (
				token TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				workspace TEXT NOT NULL,
				session_id TEXT NOT NULL,
				approval_id TEXT NOT NULL,
				expires_at TEXT NOT NULL
			);
		`);
		const columns = this.db
			.query<{ name: string }, []>("PRAGMA table_info(push_subscriptions)")
			.all();
		if (!columns.some((column) => column.name === "user_agent"))
			this.db.exec("ALTER TABLE push_subscriptions ADD COLUMN user_agent TEXT");
	}

	/** Each person's notification settings: which devices hear what, and when it is quiet. */
	setPrefs(prefsOf: (ownerId: string) => NotifyPrefs): void {
		this.prefsOf = prefsOf;
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
	subscribe(
		ownerId: string,
		subscription: PushSubscriptionKeys,
		subject: string,
		userAgent = "",
	): void {
		this.db
			.query(
				`INSERT INTO push_subscriptions (endpoint, owner_id, p256dh, auth, subject, created_at, user_agent)
				VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (endpoint) DO UPDATE SET owner_id = excluded.owner_id,
					p256dh = excluded.p256dh, auth = excluded.auth, subject = excluded.subject,
					user_agent = excluded.user_agent`,
			)
			.run(
				subscription.endpoint,
				ownerId,
				subscription.p256dh,
				subscription.auth,
				subject,
				new Date().toISOString(),
				userAgent.slice(0, 400),
			);
	}

	/** This person's devices, newest first. */
	devices(ownerId: string): PushDevice[] {
		return this.rows(ownerId)
			.map((row) => ({
				id: endpointId(row.endpoint),
				label: deviceLabel(row.user_agent ?? ""),
				kind: deviceKind(row.user_agent ?? ""),
				createdAt: row.created_at,
			}))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	private rows(ownerId: string): SubscriptionRow[] {
		return this.db
			.query<SubscriptionRow, [string]>("SELECT * FROM push_subscriptions WHERE owner_id = ?")
			.all(ownerId);
	}

	/** A token an approval's notification buttons answer with, good for half an hour. */
	createAct(act: PushAct): string {
		const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
		this.db
			.query(
				`INSERT INTO push_acts (token, owner_id, workspace, session_id, approval_id, expires_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				token,
				act.ownerId,
				act.workspace,
				act.sessionId,
				act.approvalId,
				new Date(Date.now() + ACT_MS).toISOString(),
			);
		return token;
	}

	/** The approval a token answers, once: it is spent here, and expired ones are swept. */
	takeAct(token: string): PushAct | null {
		const now = new Date().toISOString();
		this.db.query("DELETE FROM push_acts WHERE expires_at <= ?").run(now);
		const row = this.db
			.query<
				{ owner_id: string; workspace: string; session_id: string; approval_id: string },
				[string]
			>(
				"DELETE FROM push_acts WHERE token = ? RETURNING owner_id, workspace, session_id, approval_id",
			)
			.get(token);
		return row
			? {
					ownerId: row.owner_id,
					workspace: row.workspace,
					sessionId: row.session_id,
					approvalId: row.approval_id,
				}
			: null;
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
	async notify(
		ownerId: string,
		message: PushMessage,
		kind?: NotifyKind,
		device?: string,
	): Promise<number> {
		let rows = this.rows(ownerId);
		if (device) rows = rows.filter((row) => endpointId(row.endpoint) === device);
		const prefs = kind ? this.prefsOf?.(ownerId) : undefined;
		if (kind && prefs) {
			const channels = prefs.channels[kind];
			rows = rows.filter((row) => channels[deviceKind(row.user_agent ?? "")]);
			if (rows.length === 0) return 0;
			// While it is quiet updates wait for the morning, except approvals when let through.
			if (isQuiet(prefs.quiet) && !(kind === "approvals" && prefs.quiet.approvalsThrough)) {
				const { actions: _actions, act: _act, ...held } = message;
				this.db
					.query("INSERT INTO push_held (owner_id, kind, message, held_at) VALUES (?, ?, ?, ?)")
					.run(ownerId, kind, JSON.stringify(held), new Date().toISOString());
				return 0;
			}
		}
		return this.send(rows, message);
	}

	/** The same, once per key (a pull request asking for review is seen on every sync). */
	notifyOnce(
		ownerId: string,
		key: string,
		message: PushMessage,
		kind: NotifyKind,
	): Promise<number> {
		const fresh = this.db
			.query("INSERT OR IGNORE INTO push_seen (owner_id, key, seen_at) VALUES (?, ?, ?)")
			.run(ownerId, key, new Date().toISOString());
		return fresh.changes > 0 ? this.notify(ownerId, message, kind) : Promise.resolve(0);
	}

	/**
	 * Updates held overnight arrive together once it is no longer quiet: the one update as it was,
	 * or a line saying how many there are. Returns how many people were told.
	 */
	async flushHeld(at: Date = new Date()): Promise<number> {
		const owners = this.db
			.query<{ owner_id: string }, []>("SELECT DISTINCT owner_id FROM push_held")
			.all()
			.map((row) => row.owner_id);
		let told = 0;
		for (const ownerId of owners) {
			const prefs = this.prefsOf?.(ownerId);
			if (prefs && isQuiet(prefs.quiet, at)) continue;
			const held = this.db
				.query<{ message: string }, [string]>(
					"DELETE FROM push_held WHERE owner_id = ? RETURNING message",
				)
				.all(ownerId)
				.map((row) => JSON.parse(row.message) as PushMessage);
			if (held.length === 0) continue;
			const message =
				held.length === 1
					? (held[0] as PushMessage)
					: {
							title: "Grid",
							body: `${held.length} updates while it was quiet`,
							url: "/inbox",
							tag: "grid-quiet",
						};
			if ((await this.send(this.rows(ownerId), message)) > 0) told++;
		}
		return told;
	}

	private async send(rows: SubscriptionRow[], message: PushMessage): Promise<number> {
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
