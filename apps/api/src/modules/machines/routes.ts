import type { Database } from "@grid/db";
import { mayDo } from "@grid/db/roles";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { forbidden } from "../../http/errors";
import { noContent, ok } from "../../http/respond";
import { body, uuidV4 } from "../../http/validate";
import {
	type WorkspaceAccess,
	type WorkspaceScope,
	requirePermission,
	workspaceAccess,
} from "../workspaces/access";
import type { MachineProvisioner } from "./provision";
import * as s from "./schema";
import * as service from "./service";

/** `/workspaces/:ws/machines`: the team's execution machines and where each project runs. */
export function machineRoutes(deps: {
	db: Database;
	sessions: SessionLookup;
	provisioner: MachineProvisioner;
}): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));

	async function actor(
		c: AppContext,
	): Promise<service.MachinesActor & { access: WorkspaceAccess }> {
		const userId = c.get("user").sub;
		const scope: WorkspaceScope = { userId, workspace: c.req.param("ws") ?? null };
		const access = await workspaceAccess(deps.db, scope);
		return { userId, access };
	}

	app.get("/:ws/machines", async (c) => {
		const who = await actor(c);
		const [listed, availability] = await Promise.all([
			service.list(deps.db, who),
			deps.provisioner.available(),
		]);
		return ok(c, {
			...listed,
			// Any teammate may start their own container. Managing someone else's still needs
			// the machines permission, checked when the machine is created.
			canProvision: availability.available && who.access.role !== "viewer",
			canPlace: mayDo(
				"startAgents",
				who.access.role,
				who.access.customRole,
				who.access.workspace.settings,
			),
			provisionReason: availability.reason,
		});
	});

	app.post("/:ws/machines", async (c) => {
		const who = await actor(c);
		const input = await body(c.req, s.createMachineSchema);
		return ok(c, await service.create(deps.db, c.get("config"), deps.provisioner, who, input), 201);
	});

	app.post("/:ws/machines/:id/enrollment", async (c) => {
		const who = await actor(c);
		return ok(c, await service.reissue(deps.db, who, uuidV4(c.req.param("id"))));
	});

	app.patch("/:ws/machines/:id", async (c) => {
		const who = await actor(c);
		const input = await body(c.req, s.updateMachineSchema);
		return ok(c, await service.rename(deps.db, who, uuidV4(c.req.param("id")), input.name));
	});

	app.delete("/:ws/machines/:id", async (c) => {
		const who = await actor(c);
		await service.remove(deps.db, deps.provisioner, who, uuidV4(c.req.param("id")));
		return noContent(c);
	});

	// Which machine a project runs on. Choosing where one's agents run needs the same permission
	// as starting one, not the wider right to manage the team's machines.
	app.put("/:ws/machines/placements/:project", async (c) => {
		const who = await actor(c);
		if (who.access.role === "viewer") throw forbidden("Viewers can't move projects");
		requirePermission(who.access, "startAgents");
		const input = await body(c.req, s.placementSchema);
		await service.place(deps.db, who, c.req.param("project"), input.machineId);
		return noContent(c);
	});

	return app;
}
