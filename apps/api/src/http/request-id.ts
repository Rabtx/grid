import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./context";

const HEADER = "x-request-id";

/** Keep a caller's request id (so logs line up across services), or mint one; echo it back. */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
	const inbound = c.req.header(HEADER);
	const id =
		inbound && inbound.trim().length > 0 && inbound.length <= 128
			? inbound
			: `req_${crypto.randomUUID()}`;
	c.set("requestId", id);
	c.header(HEADER, id);
	await next();
});
