/**
 * The contract suite's client: black-box HTTP against a running API, pinning the responses the
 * console, the runner and native clients rely on (it proved the move from NestJS to Hono).
 *
 *   CONTRACT_API_URL=http://127.0.0.1:4037 bun run test:contract
 *
 * against an API started for the run on its own database: the suite writes accounts and
 * workspaces into whatever it is pointed at, so there is no default.
 *
 * `test:contract` loads DATABASE_URL (tests create and remove their own rows). Sign-up and
 * sign-in are limited per minute, so run the suite at most once a minute against one server.
 */
// No default on purpose. The suite signs up accounts, creates workspaces and sends invites on the
// server it is pointed at, and it once defaulted to the API on :4000, the one a developer keeps
// running, which filled that database with test accounts. Name the throwaway API every time.
const target = process.env.CONTRACT_API_URL?.trim();
if (!target)
	throw new Error(
		"Set CONTRACT_API_URL to an API started for this run (with its own database), never the dev API you use: the suite creates accounts and workspaces there. CI starts one on http://127.0.0.1:4000.",
	);
export const API_URL = target.replace(/\/$/, "");

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

let demo: Promise<string> | null = null;

/**
 * An access token for the seeded demo account, signed in once per test run and shared by every
 * suite. Sign-in allows 8 attempts a minute per address, so each suite signing in on its own
 * would run out; a throttled attempt waits for Retry-After and tries once more.
 */
export function demoToken(): Promise<string> {
	demo ??= (async () => {
		for (let attempt = 0; attempt < 2; attempt++) {
			const reply = await call(
				"/api/v1/auth/login",
				json(
					{ email: "demo@grid.dev", password: "GridDemo2026!" },
					{ headers: { origin: "http://localhost:3001", "x-requested-with": "XMLHttpRequest" } },
				),
			);
			if (reply.status === 200) {
				return (reply.body as { data: { accessToken: string } }).data.accessToken;
			}
			if (reply.status !== 429 || attempt > 0) {
				throw new Error(
					`Demo sign-in failed (${reply.status}); seed it with bun run --filter @grid/db seed`,
				);
			}
			await Bun.sleep((Number(reply.headers.get("retry-after")) || 60) * 1000 + 1000);
		}
		throw new Error("Demo sign-in stayed throttled");
	})();
	return demo;
}

/** Long enough for one wait on the sign-in limit. */
export const SIGN_IN_TIMEOUT = 90_000;
