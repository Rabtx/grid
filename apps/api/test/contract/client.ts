/**
 * The contract suite's client. It talks HTTP to whichever server `CONTRACT_API_URL` names, so
 * the same tests run against NestJS and against Hono, and a route only moves over once both
 * give the same answers:
 *
 *   CONTRACT_API_URL=http://127.0.0.1:4010 bun test test/contract   # NestJS
 *   CONTRACT_API_URL=http://127.0.0.1:4000 bun test test/contract   # Hono (forwarding the rest)
 */
export const API_URL = (process.env.CONTRACT_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

export type Reply = { status: number; headers: Headers; body: unknown };

export async function call(path: string, init: RequestInit = {}): Promise<Reply> {
	const response = await fetch(`${API_URL}${path}`, { redirect: "manual", ...init });
	const text = await response.text();
	let body: unknown = text;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		// Not JSON; compared as text.
	}
	return { status: response.status, headers: response.headers, body };
}

export const json = (value: unknown, init: RequestInit = {}): RequestInit => ({
	...init,
	method: init.method ?? "POST",
	headers: { "content-type": "application/json", ...init.headers },
	body: JSON.stringify(value),
});

/** A body with the fields that differ on every call (`requestId`, `timestamp`) taken out. */
export function stable(body: unknown): unknown {
	if (!body || typeof body !== "object") return body;
	const { requestId: _requestId, timestamp: _timestamp, ...rest } = body as Record<string, unknown>;
	return rest;
}
