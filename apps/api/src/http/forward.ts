import type { Context } from "hono";

import type { AppEnv } from "./context";
import { ApiError, errorResponse } from "./errors";

// Hop-by-hop headers belong to one connection and are not passed on.
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "host"];

/**
 * Hand a request this API does not serve yet to NestJS behind it, unchanged: method, path,
 * query, headers (cookies included), body; and pass its answer back as it is, `Set-Cookie`
 * included. Goes away when the last module is ported.
 */
export async function forward(c: Context<AppEnv>, legacyUrl: string): Promise<Response> {
	const url = new URL(c.req.url);
	const target = `${legacyUrl}${url.pathname}${url.search}`;
	const headers = new Headers(c.req.raw.headers);
	for (const name of HOP_BY_HOP) headers.delete(name);
	headers.set("x-request-id", c.get("requestId"));
	const hasBody = c.req.method !== "GET" && c.req.method !== "HEAD";
	try {
		const response = await fetch(target, {
			method: c.req.method,
			headers,
			body: hasBody ? await c.req.raw.arrayBuffer() : undefined,
			redirect: "manual",
		});
		const out = new Headers(response.headers);
		// Bun's fetch has already decoded the body.
		out.delete("content-encoding");
		out.delete("content-length");
		return new Response(response.body, { status: response.status, headers: out });
	} catch (cause) {
		console.error(`forwarding ${c.req.method} ${url.pathname} failed:`, cause);
		return errorResponse(c, new ApiError(502, "The API is starting; try again in a moment"));
	}
}
