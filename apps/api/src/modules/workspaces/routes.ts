import type { Database } from "@grid/db";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { badRequest } from "../../http/errors";
import { noContent, ok } from "../../http/respond";
import { body } from "../../http/validate";
import { projectRoutes } from "../projects/routes";
import type { WorkspaceScope } from "./access";
import * as s from "./schema";
import * as service from "./service";

const uuid = (value: string) => {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
		throw badRequest("Validation failed (uuid is expected)");
	return value;
};

/** `/workspaces`: the ones you belong to, their members, and each one's projects. */
export function workspaceRoutes(deps: { db: Database; sessions: SessionLookup }): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));
	const scope = (c: AppContext): WorkspaceScope => ({
		userId: c.get("user").sub,
		workspace: c.req.param("ws") ?? null,
	});

	app.get("/", async (c) => ok(c, await service.listWorkspaces(deps.db, c.get("user").sub)));
	app.post("/", async (c) =>
		ok(
			c,
			await service.createWorkspace(
				deps.db,
				c.get("user").sub,
				await body(c.req, s.createWorkspaceSchema),
			),
			201,
		),
	);
	app.get("/:ws", async (c) => ok(c, await service.getWorkspace(deps.db, scope(c))));
	app.patch("/:ws", async (c) =>
		ok(
			c,
			await service.updateWorkspace(deps.db, scope(c), await body(c.req, s.updateWorkspaceSchema)),
		),
	);
	app.delete("/:ws", async (c) => {
		await service.deleteWorkspace(deps.db, scope(c));
		return noContent(c);
	});
	app.get("/:ws/members", async (c) => ok(c, await service.listMembers(deps.db, scope(c))));
	app.patch("/:ws/members/:userId", async (c) =>
		ok(
			c,
			await service.updateMember(
				deps.db,
				scope(c),
				uuid(c.req.param("userId")),
				await body(c.req, s.updateMemberSchema),
			),
		),
	);
	app.delete("/:ws/members/:userId", async (c) => {
		await service.removeMember(deps.db, scope(c), uuid(c.req.param("userId")));
		return noContent(c);
	});
	app.route("/:ws/projects", projectRoutes(deps));
	return app;
}
