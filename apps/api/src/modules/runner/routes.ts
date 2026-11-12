import { timingSafeEqual } from "node:crypto";

import { type Database, schema } from "@grid/db";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { Hono, type MiddlewareHandler } from "hono";

import type { AppContext, AppEnv } from "../../http/context";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../http/errors";
import { rateLimit } from "../../http/rate-limit";
import { ok } from "../../http/respond";
import { body } from "../../http/validate";
import { enrollMachineSchema, machineHeartbeatSchema } from "../machines/schema";
import * as machines from "../machines/service";
import { createTaskSchema, updateTaskSchema } from "../projects/schema";
import * as projects from "../projects/service";
import * as s from "./schema";
import * as service from "./service";

/** At most this many events in one page of a restore. */
const EVENT_PAGE = 2000;

function sameKey(given: string, key: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(key);
	return a.length === b.length && timingSafeEqual(a, b);
}

/** A task's fields checked as the board's own routes check them. */
function fields<T>(schema: z.ZodType<T>, value: unknown): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success)
		throw badRequest(parsed.error.issues[0]?.message ?? "Those task fields are not valid");
	return parsed.data;
}

/** The person a runner acts for, in the workspace it names by id (scopes name it by slug). */
async function actingAs(db: Database, workspaceId: string, userId: string | undefined) {
	if (!userId) throw badRequest("Say whose thread it is");
	const [row] = await db
		.select({ slug: schema.workspaces.slug })
		.from(schema.workspaces)
		.where(eq(schema.workspaces.id, workspaceId))
		.limit(1);
	if (!row) throw notFound("Workspace not found");
	return { userId, workspace: row.slug };
}

/**
 * What this Grid's runners call: sending threads and restoring them, with the Grid's runner key
 * (`Authorization: Runner <key>`), or the same for one enrolled machine (`Authorization: Machine
 * <id>.<secret>`), scoped to the workspace it joined. People never call these; their tokens are
 * checked on the machine they reach, not here.
 */
export function runnerRoutes(deps: { db: Database }): Hono<AppEnv> {
	const app = new Hono<AppEnv>();

	const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
		const header = c.req.header("authorization") ?? "";
		const key = c.get("config").runnerKey;
		if (key && header.startsWith("Runner ")) {
			if (!sameKey(header.slice("Runner ".length), key))
				throw unauthorized("Not a runner of this Grid");
			c.set("runner", { kind: "grid" });
			await next();
			return;
		}
		const machine = await machines.machineForToken(deps.db, header);
		if (machine) {
			if (machine.status === "disabled") throw forbidden("That machine is disabled");
			c.set("runner", {
				kind: "machine",
				id: machine.id,
				workspaceId: machine.workspaceId,
			});
			await next();
			return;
		}
		// Grid-key routes stay dark until the API is given a key, as they did before machines.
		if (!key) throw notFound();
		throw unauthorized("Not a runner of this Grid");
	};

	/** Restoring and listing threads is for Grid's own runner, not one machine. */
	function gridOnly(c: AppContext): void {
		if (c.get("runner").kind !== "grid") throw notFound();
	}

	/** A machine may only read and write its own workspace's threads. */
	async function threadInScope(c: AppContext, id: string): Promise<void> {
		const scope = c.get("runner");
		if (scope.kind !== "machine") return;
		const workspace = await service.threadWorkspace(deps.db, id);
		if (workspace !== scope.workspaceId) throw forbidden("This machine serves another workspace");
	}

	function workspaceInScope(c: AppContext, workspaceId: string): void {
		const scope = c.get("runner");
		if (scope.kind === "machine" && scope.workspaceId !== workspaceId)
			throw forbidden("This machine serves another workspace");
	}

	// A runner redeeming the one-time code a teammate made for it. No key: the code is the proof.
	app.post("/machines/enroll", rateLimit({ limit: 20, windowMs: 60_000 }), async (c) =>
		ok(c, await machines.enroll(deps.db, await body(c.req, enrollMachineSchema))),
	);

	// An enrolled machine saying it is alive; the secret it enrolled with is its proof.
	app.post("/machines/heartbeat", rateLimit({ limit: 120, windowMs: 60_000 }), async (c) => {
		const machine = await machines.machineForToken(deps.db, c.req.header("authorization"));
		if (!machine) throw unauthorized("Not an enrolled machine");
		return ok(
			c,
			await machines.heartbeat(deps.db, machine, await body(c.req, machineHeartbeatSchema)),
		);
	});

	// The addresses of every machine, for the hosted runner that carries console calls to them.
	app.get("/fleet", authenticate, async (c) => {
		gridOnly(c);
		return ok(c, await machines.fleet(deps.db));
	});

	app.post("/sync", authenticate, async (c) => {
		const scope = c.get("runner");
		const round = await body(c.req, s.syncSchema);
		if (
			scope.kind === "machine" &&
			round.threads.some((thread) => thread.workspaceId !== scope.workspaceId)
		)
			throw forbidden("This machine serves another workspace");
		return ok(c, await service.sync(deps.db, round));
	});

	app.get("/machines", authenticate, async (c) => {
		gridOnly(c);
		return ok(c, await service.machines(deps.db));
	});

	app.get("/machines/:id/threads", authenticate, async (c) => {
		gridOnly(c);
		return ok(c, await service.machineThreads(deps.db, c.req.param("id")));
	});

	app.get("/threads/:id/events", authenticate, async (c) => {
		const id = c.req.param("id");
		await threadInScope(c, id);
		const after = Number(c.req.query("after") ?? 0);
		if (!Number.isInteger(after) || after < 0) throw badRequest("after must be a whole number");
		return ok(c, await service.events(deps.db, id, after, EVENT_PAGE));
	});

	app.put("/threads/:id/attachments/:attachment", authenticate, async (c) => {
		const id = c.req.param("id");
		await threadInScope(c, id);
		const input = await body(c.req, s.attachmentSchema);
		const kept = await service.keepAttachment(deps.db, id, c.req.param("attachment"), input);
		if (!kept) throw conflict("This machine does not hold that thread");
		return ok(c, { kept: true });
	});

	app.get("/threads/:id/attachments", authenticate, async (c) => {
		const id = c.req.param("id");
		await threadInScope(c, id);
		return ok(c, await service.attachments(deps.db, id));
	});

	app.get("/threads/:id/attachments/:attachment", authenticate, async (c) => {
		const id = c.req.param("id");
		await threadInScope(c, id);
		const found = await service.attachment(deps.db, id, c.req.param("attachment"));
		if (!found) throw notFound("No such attachment");
		return ok(c, found);
	});

	// An agent's board tools, through its runner: it acts as the person whose thread it is, in that
	// thread's workspace, with exactly their access to the project and its tasks.
	app.get("/tasks/:workspace/:slug", authenticate, async (c) => {
		const workspaceId = c.req.param("workspace");
		workspaceInScope(c, workspaceId);
		return ok(
			c,
			await projects.listTasks(
				deps.db,
				await actingAs(deps.db, workspaceId, c.req.query("user")),
				c.req.param("slug"),
			),
		);
	});
	app.post("/tasks/:workspace/:slug", authenticate, async (c) => {
		const workspaceId = c.req.param("workspace");
		workspaceInScope(c, workspaceId);
		const input = await body(c.req, s.agentTaskSchema);
		return ok(
			c,
			await projects.createTask(
				deps.db,
				await actingAs(deps.db, workspaceId, input.user),
				c.req.param("slug"),
				fields(createTaskSchema, input.task),
			),
			201,
		);
	});
	app.patch("/tasks/:workspace/:slug/:number", authenticate, async (c) => {
		const workspaceId = c.req.param("workspace");
		workspaceInScope(c, workspaceId);
		const input = await body(c.req, s.agentTaskSchema);
		const number = Number(c.req.param("number"));
		if (!Number.isSafeInteger(number) || number < 1) throw badRequest("Say which task");
		return ok(
			c,
			await projects.updateTask(
				deps.db,
				await actingAs(deps.db, workspaceId, input.user),
				c.req.param("slug"),
				number,
				fields(updateTaskSchema, input.task),
			),
		);
	});

	app.post("/machines/:id/claim", authenticate, async (c) => {
		gridOnly(c);
		const { machine } = await body(c.req, s.claimSchema);
		return ok(c, { moved: await service.claim(deps.db, c.req.param("id"), machine) });
	});

	return app;
}
