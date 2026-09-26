import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnv } from "./context";

/** A success body: the data wrapped in the envelope every client unwraps. */
export function ok<T>(c: Context<AppEnv>, data: T, status: ContentfulStatusCode = 200): Response {
	return c.json(
		{
			success: true,
			statusCode: status,
			requestId: c.get("requestId"),
			timestamp: new Date().toISOString(),
			data,
		},
		status,
	);
}

/** 204: done, nothing to say. */
export function noContent(c: Context<AppEnv>): Response {
	return c.body(null, 204);
}
