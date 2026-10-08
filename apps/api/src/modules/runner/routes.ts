import { timingSafeEqual } from "node:crypto";

import type { Database } from "@grid/db";
import { Hono } from "hono";

import type { AppEnv } from "../../http/context";
import { badRequest, notFound, unauthorized } from "../../http/errors";
import { ok } from "../../http/respond";
import { body } from "../../http/validate";
import * as s from "./schema";
import * as service from "./service";

/** At most this many events in one page of a restore. */
const EVENT_PAGE = 2000;

/**
 * What this Grid's runners call with the machine key (`Authorization: Runner <key>`): sending
 * their threads, and restoring another machine's threads onto a new one. Off — every path a 404 —
 * unless the API was given `GRID_RUNNER_KEY`. People never call these; the key is not theirs.
 */
export function runnerRoutes(deps: { db: Database }): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	app.use("*", async (c, next) => {
		const key = c.get("config").runnerKey;
		if (!key) throw notFound();
		const given = c.req.header("authorization")?.match(/^Runner (.+)$/)?.[1] ?? "";
		const a = Buffer.from(given);
		const b = Buffer.from(key);
		if (a.length !== b.length || !timingSafeEqual(a, b))
			throw unauthorized("Not a runner of this Grid");
		await next();
	});

	app.post("/sync", async (c) =>
		ok(c, await service.sync(deps.db, await body(c.req, s.syncSchema))),
	);

	app.get("/machines", async (c) => ok(c, await service.machines(deps.db)));

	app.get("/machines/:id/threads", async (c) =>
		ok(c, await service.machineThreads(deps.db, c.req.param("id"))),
	);

	app.get("/threads/:id/events", async (c) => {
		const after = Number(c.req.query("after") ?? 0);
		if (!Number.isInteger(after) || after < 0) throw badRequest("after must be a whole number");
		return ok(c, await service.events(deps.db, c.req.param("id"), after, EVENT_PAGE));
	});

	app.post("/machines/:id/claim", async (c) => {
		const { machine } = await body(c.req, s.claimSchema);
		return ok(c, { moved: await service.claim(deps.db, c.req.param("id"), machine) });
	});

	return app;
}
