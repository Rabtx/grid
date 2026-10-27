import type { Database } from "bun:sqlite";

import type { ChatEvent, MessageOrigin } from "../agents/events";
import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import { openPrivateDatabase } from "../private-database";
import { RateLog } from "../rate-log";
import { ChatError, type ChatHub } from "./hub";
import type { ChatStore } from "./store";

/**
 * Guest links: a link a person sends someone without a Grid account, who can then follow one
 * thread in their browser (`/guest/<token>`) and ask something. What they ask waits in the thread
 * for its person to Send to the agent or Dismiss; nothing a guest writes reaches the agent
 * without that. A link works for 24 hours, can be stopped at any time, and is kept only as a hash.
 *
 * Guests see the conversation, not the machine: the person's and the agent's messages, which
 * tools ran (not what they read or printed), and the turns' ends. No files, diffs, terminals,
 * approvals or attachments.
 */

export const GUEST_LINK_HOURS = 24;
const LINKS_PER_THREAD = 5;
const PENDING_PER_LINK = 5;
const MESSAGES_PER_MINUTE = 6;
const TEXT_MAX = 4_000;
const NAME_MAX = 40;
/** How many of a thread's latest events a guest opening it is sent. */
const FIRST_EVENTS = 400;
const PAGE = 500;

export type GuestLink = {
	id: string;
	sessionId: string;
	workspaceId: string;
	ownerId: string;
	createdAt: string;
	expiresAt: string;
};

type LinkRow = {
	id: string;
	session_id: string;
	workspace_id: string;
	owner_id: string;
	hash: string;
	created_at: string;
	expires_at: string;
};

const linkOf = (row: LinkRow): GuestLink => ({
	id: row.id,
	sessionId: row.session_id,
	workspaceId: row.workspace_id,
	ownerId: row.owner_id,
	createdAt: row.created_at,
	expiresAt: row.expires_at,
});

function hashOf(token: string): string {
	return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** Who sent a message the thread's person did not type, in a guest's words. */
function senderOf(origin: MessageOrigin): string {
	switch (origin.kind) {
		case "outside":
			return `${origin.agent}, an agent outside Grid`;
		case "agent":
			return "An agent in another thread";
		case "merge":
			return "Work brought back from a fork";
		case "guest":
			return `${origin.name}, a guest`;
		default:
			return "Grid";
	}
}

/** An event as a guest sees it, or null for one they do not. */
export function guestEvent(event: ChatEvent): Record<string, unknown> | null {
	switch (event.type) {
		case "user":
			return {
				type: "user",
				text: event.text,
				...(event.origin?.kind === "guest" ? { guest: event.origin.name } : {}),
				...(event.origin && event.origin.kind !== "guest" ? { from: senderOf(event.origin) } : {}),
			};
		case "message":
			return { type: "message", text: event.text };
		case "tool":
			return {
				type: "tool",
				id: event.id,
				...(event.title ? { title: event.title } : {}),
				...(event.status ? { status: event.status } : {}),
			};
		case "turn_start":
			return { type: "turn_start", ...(event.at ? { at: event.at } : {}) };
		case "turn_end":
			return { type: "turn_end", reason: event.reason };
		case "guest_request":
			return { type: "guest_request", id: event.id, name: event.name, text: event.text };
		case "guest_request_resolved":
			return { type: "guest_request_resolved", id: event.id, action: event.action };
		default:
			return null;
	}
}

export class Guests {
	private readonly db: Database;
	/** What each link asked lately, for `MESSAGES_PER_MINUTE`, kept across restarts. */
	private readonly rates: RateLog;

	constructor(
		path: string,
		private readonly hub: ChatHub,
		private readonly chats: ChatStore,
		private readonly now: () => Date = () => new Date(),
	) {
		this.db = openPrivateDatabase(path);
		this.rates = new RateLog(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS guest_links (
				id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				workspace_id TEXT NOT NULL,
				owner_id TEXT NOT NULL,
				hash TEXT NOT NULL UNIQUE,
				created_at TEXT NOT NULL,
				expires_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS guest_links_session ON guest_links (session_id);
		`);
		hub.onRemoved((thread) =>
			this.db.query("DELETE FROM guest_links WHERE session_id = ?").run(thread),
		);
	}

	close(): void {
		this.db.close();
	}

	/** Make a link to a thread; its token is returned here and never again. */
	create(who: Who, sessionId: string): { link: GuestLink; token: string } {
		if (!may(who, "startAgents")) throw new ChatError(NOT_ALLOWED, 403);
		const session = this.hub.thread(who.workspace, sessionId);
		const now = this.now();
		this.db.query("DELETE FROM guest_links WHERE expires_at <= ?").run(now.toISOString());
		if (this.links(who, sessionId).length >= LINKS_PER_THREAD)
			throw new ChatError(
				`A thread has ${LINKS_PER_THREAD} guest links at most; stop one first`,
				409,
			);
		const token = `grid_gl_${Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url")}`;
		const link: GuestLink = {
			id: crypto.randomUUID(),
			sessionId: session.id,
			workspaceId: session.workspaceId,
			ownerId: who.userId,
			createdAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + GUEST_LINK_HOURS * 3_600_000).toISOString(),
		};
		this.db
			.query(
				"INSERT INTO guest_links (id, session_id, workspace_id, owner_id, hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				link.id,
				link.sessionId,
				link.workspaceId,
				link.ownerId,
				hashOf(token),
				link.createdAt,
				link.expiresAt,
			);
		return { link, token };
	}

	/** A thread's links that still work. */
	links(who: Who, sessionId: string): GuestLink[] {
		this.hub.thread(who.workspace, sessionId);
		return this.db
			.query<LinkRow, [string, string]>(
				"SELECT * FROM guest_links WHERE session_id = ? AND expires_at > ? ORDER BY created_at",
			)
			.all(sessionId, this.now().toISOString())
			.map(linkOf);
	}

	/** Stop a link, or every link of a thread (`id` left out). */
	stop(who: Who, sessionId: string, id?: string): number {
		this.hub.thread(who.workspace, sessionId);
		return id
			? this.db.query("DELETE FROM guest_links WHERE id = ? AND session_id = ?").run(id, sessionId)
					.changes
			: this.db.query("DELETE FROM guest_links WHERE session_id = ?").run(sessionId).changes;
	}

	private byToken(token: string): GuestLink {
		const row = token.startsWith("grid_gl_")
			? this.db
					.query<LinkRow, [string]>("SELECT * FROM guest_links WHERE hash = ?")
					.get(hashOf(token))
			: null;
		if (!row || row.expires_at <= this.now().toISOString())
			throw new ChatError("This guest link has ended. Ask for a new one.", 404);
		return linkOf(row);
	}

	/** What a guest sees: the thread from `after` (an event number), or its latest part. */
	view(
		token: string,
		after?: number,
	): {
		title: string;
		running: boolean;
		expiresAt: string;
		events: Record<string, unknown>[];
		next: number;
	} {
		const link = this.byToken(token);
		const session = this.hub.sessionRow(link.sessionId);
		if (!session) throw new ChatError("This thread is gone", 404);
		const last = this.chats.lastSeq(session.id);
		const from =
			after === undefined || !Number.isFinite(after) ? Math.max(0, last - FIRST_EVENTS) : after;
		const rows = this.chats.eventsAfter(session.id, from, PAGE);
		return {
			title: session.title,
			running: this.hub.isRunning(session.id),
			expiresAt: link.expiresAt,
			events: rows.flatMap((row) => {
				const shown = guestEvent(row.data as ChatEvent);
				return shown ? [{ ...shown, n: row.seq }] : [];
			}),
			next: rows.at(-1)?.seq ?? from,
		};
	}

	/** A guest asks something: it waits in the thread for its person. */
	ask(token: string, input: { name?: unknown; text?: unknown }): { id: string } {
		const link = this.byToken(token);
		const text = typeof input.text === "string" ? input.text.trim() : "";
		const name =
			(typeof input.name === "string" ? input.name.trim() : "").slice(0, NAME_MAX) || "Guest";
		if (!text) throw new ChatError("Write something to ask", 400);
		if (text.length > TEXT_MAX) throw new ChatError(`Keep it under ${TEXT_MAX} characters`, 400);
		const now = this.now().getTime();
		if (this.pending(link.sessionId).length >= PENDING_PER_LINK)
			throw new ChatError(
				"Several questions already wait for the thread's person; wait for them",
				429,
			);
		if (!this.rates.take("guest", link.id, MESSAGES_PER_MINUTE, 60_000, now))
			throw new ChatError("That is a lot at once; wait a minute", 429);
		const id = crypto.randomUUID();
		this.hub.logEvent(link.sessionId, {
			type: "guest_request",
			id,
			name,
			text,
			at: new Date(now).toISOString(),
		});
		return { id };
	}

	/** Guests' requests in a thread nobody has sent or dismissed yet. */
	pending(sessionId: string): { id: string; name: string; text: string }[] {
		const open = new Map<string, { id: string; name: string; text: string }>();
		for (const event of this.hub.sessionRow(sessionId) ? this.chats.events(sessionId) : []) {
			if (event.type === "guest_request")
				open.set(event.id, { id: event.id, name: event.name, text: event.text });
			else if (event.type === "guest_request_resolved") open.delete(event.id);
		}
		return [...open.values()];
	}

	/** The person sends a guest's request on to the agent, or dismisses it. */
	async resolve(
		who: Who,
		sessionId: string,
		requestId: string,
		action: "send" | "dismiss",
	): Promise<void> {
		if (!may(who, "startAgents")) throw new ChatError(NOT_ALLOWED, 403);
		const session = this.hub.thread(who.workspace, sessionId);
		const request = this.pending(sessionId).find((item) => item.id === requestId);
		if (!request) throw new ChatError("That request is no longer waiting", 409);
		this.hub.logEvent(session.id, {
			type: "guest_request_resolved",
			id: request.id,
			action: action === "send" ? "sent" : "dismissed",
		});
		if (action === "send")
			void this.hub
				.prompt(session.workspaceId, session.id, request.text, [], "send", {
					origin: { kind: "guest", name: request.name },
				})
				.catch((cause: unknown) => {
					console.warn(
						"[guests] could not send a guest's request:",
						cause instanceof Error ? cause.message : cause,
					);
				});
	}

	/** The person's routes (`/chat/sessions/:id/guest-links`, `…/guest-requests/:id`); null for others. */
	async personRequest(request: Request, url: URL, who: Who): Promise<Response | null> {
		const links = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/guest-links(?:\/([\w-]+))?$/);
		const asked = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/guest-requests\/([\w-]+)$/);
		if (!links && !asked) return null;
		try {
			if (links && request.method === "GET" && !links[2])
				return Response.json({ data: this.links(who, links[1] ?? "") });
			if (links && request.method === "POST" && !links[2])
				return Response.json({ data: this.create(who, links[1] ?? "") }, { status: 201 });
			if (links && request.method === "DELETE") {
				this.stop(who, links[1] ?? "", links[2]);
				return new Response(null, { status: 204 });
			}
			if (asked && request.method === "POST") {
				const body = (await request.json().catch(() => ({}))) as { action?: unknown };
				if (body.action !== "send" && body.action !== "dismiss")
					return Response.json({ message: "action is send or dismiss" }, { status: 400 });
				await this.resolve(who, asked[1] ?? "", asked[2] ?? "", body.action);
				return new Response(null, { status: 204 });
			}
			return Response.json({ message: "Method not allowed" }, { status: 405 });
		} catch (cause) {
			if (cause instanceof ChatError)
				return Response.json({ message: cause.message }, { status: cause.status });
			throw cause;
		}
	}

	/** A guest's routes (`GET /guest/:token`, `POST /guest/:token/messages`), with no sign-in. */
	async guestRequest(request: Request, url: URL): Promise<Response | null> {
		const match = url.pathname.match(/^\/guest\/(grid_gl_[\w-]{20,64})(\/messages)?$/);
		if (!url.pathname.startsWith("/guest/")) return null;
		const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
		if (!match)
			return Response.json(
				{ message: "This guest link has ended. Ask for a new one." },
				{ status: 404, headers },
			);
		try {
			if (!match[2] && request.method === "GET") {
				const after = url.searchParams.get("after");
				return Response.json(
					{ data: this.view(match[1] ?? "", after === null ? undefined : Number(after)) },
					{ headers },
				);
			}
			if (match[2] && request.method === "POST") {
				const body = (await request.json().catch(() => ({}))) as { name?: unknown; text?: unknown };
				return Response.json({ data: this.ask(match[1] ?? "", body) }, { status: 201, headers });
			}
			return Response.json({ message: "Method not allowed" }, { status: 405, headers });
		} catch (cause) {
			if (cause instanceof ChatError)
				return Response.json({ message: cause.message }, { status: cause.status, headers });
			throw cause;
		}
	}
}
