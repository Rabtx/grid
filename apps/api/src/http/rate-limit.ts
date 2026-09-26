import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./context";
import { tooManyRequests } from "./errors";

type Window = { count: number; resetAt: number };

/** The caller's address: the first forwarded hop behind a trusted proxy, else the socket's. */
export function clientIp(c: Context<AppEnv>): string {
	if (c.get("config").trustProxy) {
		const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
		if (forwarded) return forwarded;
	}
	try {
		return getConnInfo(c).remote.address ?? "unknown";
	} catch {
		// Not served by Bun (tests calling app.request): every caller shares one bucket.
		return "unknown";
	}
}

/**
 * At most `limit` requests per `windowMs` from one address to one route, as NestJS's throttler
 * did (100 a minute by default, stricter on sign-in routes). Counts live in memory: one API
 * process per Grid.
 */
export function rateLimit(options: { limit: number; windowMs: number }) {
	const windows = new Map<string, Window>();
	return createMiddleware<AppEnv>(async (c, next) => {
		const now = Date.now();
		// Per address and path. Route-level limits (sign-in) are keyed the same way, by their path.
		const key = `${clientIp(c)} ${c.req.method} ${new URL(c.req.url).pathname}`;
		let window = windows.get(key);
		if (!window || window.resetAt <= now) {
			window = { count: 0, resetAt: now + options.windowMs };
			windows.set(key, window);
			// Forget expired windows now and then, so the map stays small.
			if (windows.size > 10_000) {
				for (const [name, entry] of windows) if (entry.resetAt <= now) windows.delete(name);
			}
		}
		window.count++;
		if (window.count > options.limit) {
			c.header("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
			throw tooManyRequests("ThrottlerException: Too Many Requests");
		}
		await next();
	});
}
