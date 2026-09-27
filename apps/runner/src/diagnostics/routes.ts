import type { Who } from "../auth";

import type { DiagnosticJournal, DiagnosticKind } from "./journal";

const CLIENT_EVENT_TYPES = new Set(["close", "fallback", "reconnect"]);
const CLIENT_SOURCES = new Set(["chat", "terminal", "link"]);
const MAX_BATCH = 25;
const MAX_BODY_BYTES = 32_768;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_KEYS = 1_000;

// Keep identical to CLIENT_CLOSE_REASONS in apps/console/src/lib/runner-health.ts (apps share no code).
const SAFE_CLOSE_REASONS = new Set([
	"No hello",
	"Expected hello",
	"Sign in again",
	"That environment does not exist",
	"That terminal does not exist",
	"That chat does not exist",
	"Chat failed",
	"Nothing open",
	"The connection dropped",
	"The connection stopped answering",
	"The runner is not reachable",
	"The runner refused sign-in",
	"Client detached",
	"Replaced",
	"Too many open terminals and chats on one connection",
	"Unknown channel kind",
]);

type ClientEvent = {
	event: "close" | "fallback" | "reconnect";
	source: "chat" | "terminal" | "link";
	sessionId?: string;
	code?: number;
	reason?: string;
	durationMs?: number;
	attempt?: number;
	online: boolean;
	visibility: "visible" | "hidden";
	clientAt: number;
	version: string;
};

/** Runner diagnostics endpoints; callers authenticate and pass the verified workspace. */
export class DiagnosticRoutes {
	private readonly requests = new Map<string, number[]>();

	constructor(
		private readonly journal: DiagnosticJournal,
		private readonly now: () => number = Date.now,
	) {}

	async handle(request: Request, url: URL, who: Who): Promise<Response | null> {
		if (url.pathname === "/diagnostics/client") {
			if (request.method !== "POST") return failure(405, "Method not allowed");
			if (!this.allowClientRequest(who.userId)) return failure(429, "Too many diagnostic reports");
			return this.receiveClientEvents(request, who);
		}
		if (url.pathname !== "/diagnostics") return null;
		if (request.method !== "GET") return failure(405, "Method not allowed");

		const since = readSince(
			url.searchParams.get("since"),
			this.now() - 7 * 24 * 60 * 60 * 1000,
			this.now(),
		);
		if (since === null) return failure(400, "Invalid since value");
		const rawKind = url.searchParams.get("kind");
		if (rawKind && !isKind(rawKind)) return failure(400, "Invalid diagnostic kind");
		const now = this.now();
		return Response.json({
			data: {
				events: this.journal.list(who.workspace, {
					since,
					kind: (rawKind as DiagnosticKind | null) ?? undefined,
				}),
				reconnects24h: this.journal.reconnectCount(who.workspace, now - 24 * 60 * 60 * 1000),
			},
		});
	}

	private async receiveClientEvents(request: Request, who: Who): Promise<Response> {
		const length = Number(request.headers.get("content-length") ?? 0);
		if (length > MAX_BODY_BYTES) return failure(413, "Diagnostic batch is too large");
		const text = await readBody(request, MAX_BODY_BYTES);
		if (text === null) return failure(413, "Diagnostic batch is too large");
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return failure(400, "Invalid diagnostic batch");
		}
		if (
			!body ||
			typeof body !== "object" ||
			!Array.isArray((body as { events?: unknown }).events)
		) {
			return failure(400, "Send an events array");
		}
		const events = (body as { events: unknown[] }).events;
		if (events.length === 0 || events.length > MAX_BATCH) return failure(400, "Invalid batch size");
		const parsed = events.map((event) => readClientEvent(event, this.now()));
		if (parsed.some((event) => event === null)) return failure(400, "Invalid diagnostic event");

		for (const event of parsed) {
			if (!event) continue;
			this.journal.record({
				at: this.now(),
				workspace: who.workspace,
				kind: "client",
				source: event.source,
				message: clientMessage(event.event),
				details: event,
			});
		}
		return new Response(null, { status: 204 });
	}

	private allowClientRequest(userId: string): boolean {
		const now = this.now();
		const recent = (this.requests.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
		if (recent.length >= RATE_LIMIT) return false;
		recent.push(now);
		this.requests.set(userId, recent);
		if (this.requests.size > MAX_RATE_KEYS) {
			for (const [user, times] of this.requests) {
				if (times.at(-1) === undefined || now - (times.at(-1) ?? 0) >= RATE_WINDOW_MS) {
					this.requests.delete(user);
				}
			}
		}
		return true;
	}
}

async function readBody(request: Request, limit: number): Promise<string | null> {
	const reader = request.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			size += next.value.byteLength;
			if (size > limit) {
				await reader.cancel();
				return null;
			}
			chunks.push(next.value);
		}
	} catch {
		return null;
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function readClientEvent(value: unknown, now: number): ClientEvent | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const event = value as Record<string, unknown>;
	if (
		typeof event.event !== "string" ||
		!CLIENT_EVENT_TYPES.has(event.event) ||
		typeof event.source !== "string" ||
		!CLIENT_SOURCES.has(event.source) ||
		typeof event.online !== "boolean" ||
		(event.visibility !== "visible" && event.visibility !== "hidden") ||
		!Number.isSafeInteger(event.clientAt) ||
		(event.clientAt as number) < now - 14 * 24 * 60 * 60 * 1000 ||
		(event.clientAt as number) > now + 5 * 60 * 1000 ||
		typeof event.version !== "string" ||
		!/^[\w.+-]{1,40}$/.test(event.version)
	) {
		return null;
	}
	if (event.sessionId !== undefined && !validId(event.sessionId)) return null;
	if (event.code !== undefined && !integerInRange(event.code, 1000, 4999)) return null;
	if (
		event.durationMs !== undefined &&
		!integerInRange(event.durationMs, 0, 7 * 24 * 60 * 60 * 1000)
	)
		return null;
	if (event.attempt !== undefined && !integerInRange(event.attempt, 1, 10_000)) return null;
	if (event.reason !== undefined && typeof event.reason !== "string") return null;

	return {
		event: event.event as ClientEvent["event"],
		source: event.source as ClientEvent["source"],
		...(typeof event.sessionId === "string" ? { sessionId: event.sessionId } : {}),
		...(typeof event.code === "number" ? { code: event.code } : {}),
		...(typeof event.reason === "string" ? { reason: safeCloseReason(event.reason) } : {}),
		...(typeof event.durationMs === "number" ? { durationMs: event.durationMs } : {}),
		...(typeof event.attempt === "number" ? { attempt: event.attempt } : {}),
		online: event.online,
		visibility: event.visibility,
		clientAt: event.clientAt as number,
		version: event.version,
	};
}

export function safeCloseReason(reason: string): string {
	return SAFE_CLOSE_REASONS.has(reason)
		? reason
		: reason
			? "Unrecognized close reason omitted"
			: "";
}

function clientMessage(event: ClientEvent["event"]): string {
	if (event === "close") return "Client socket closed";
	if (event === "fallback") return "Client used a direct socket fallback";
	return "Client started a reconnect";
}

function readSince(raw: string | null, fallback: number, now: number): number | null {
	if (raw === null || raw === "") return fallback;
	const value = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
	return Number.isSafeInteger(value) && value >= 0 && value <= now + 5 * 60 * 1000 ? value : null;
}

function isKind(value: string): value is DiagnosticKind {
	return value === "error" || value === "connection" || value === "client";
}

function validId(value: unknown): value is string {
	return typeof value === "string" && /^[\w-]{1,120}$/.test(value);
}

function integerInRange(value: unknown, min: number, max: number): value is number {
	return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
