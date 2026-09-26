import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppEnv } from "../../http/context";
import { clientIp, rateLimit } from "../../http/rate-limit";
import { ok } from "../../http/respond";
import { body } from "../../http/validate";
import { csrf } from "../auth/csrf";
import { type AuthDeps, createSession } from "../auth/flows";
import { presentSession } from "../auth/routes";
import * as instance from "./instance";

/**
 * `/instance`: this Grid's own settings (is it set up, is signup open), and `/instance/setup`,
 * the first run that creates its owner and signs them in.
 */
export function instanceRoutes(deps: AuthDeps & { sessions: SessionLookup }): Hono<AppEnv> {
	return new Hono<AppEnv>()
		.get("/", async (c) => ok(c, await instance.instanceStatus(deps.db)))
		.patch("/", requireUser(deps.sessions), async (c) =>
			ok(
				c,
				await instance.updateInstance(
					deps.db,
					c.get("user").sub,
					await body(c.req, instance.updateInstanceSchema),
				),
			),
		)
		.post("/setup", rateLimit({ limit: 5, windowMs: 60_000 }), csrf, async (c) => {
			const user = await instance.setUp(
				deps.db,
				deps.config,
				await body(c.req, instance.setupSchema),
			);
			const session = await createSession(deps, user, {
				ipAddress: clientIp(c) === "unknown" ? null : clientIp(c),
				userAgent: c.req.header("user-agent") ?? null,
			});
			return ok(c, presentSession(c, session), 201);
		});
}
