import { Hono } from "hono";

import type { AppEnv } from "../../http/context";
import { ok } from "../../http/respond";

/** `GET /health`: the API is up. Unauthenticated, for load balancers and the launcher. */
export function healthRoutes(): Hono<AppEnv> {
	return new Hono<AppEnv>().get("/", (c) =>
		ok(c, { status: "ok" as const, service: c.get("config").serviceName }),
	);
}
