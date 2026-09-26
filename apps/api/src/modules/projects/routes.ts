import type { Database } from "@grid/db";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppEnv } from "../../http/context";
import { badRequest } from "../../http/errors";
import { noContent, ok } from "../../http/respond";
import { body } from "../../http/validate";
import * as s from "./schema";
import * as service from "./service";

const number = (value: string) => {
	if (!/^-?\d+$/.test(value)) throw badRequest("Validation failed (numeric string is expected)");
	return Number(value);
};
const uuid = (value: string) => {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
		throw badRequest("Validation failed (uuid is expected)");
	return value;
};

export function projectRoutes(deps: { db: Database; sessions: SessionLookup }): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));
	const user = (c: { get: (key: "user") => { sub: string } }) => c.get("user").sub;
	app.get("/", async (c) => ok(c, await service.listProjects(deps.db, user(c))));
	app.post("/", async (c) =>
		ok(
			c,
			await service.createProject(deps.db, user(c), await body(c.req, s.createProjectSchema)),
			201,
		),
	);
	app.get("/:slug", async (c) =>
		ok(c, await service.getProject(deps.db, user(c), c.req.param("slug"))),
	);
	app.patch("/:slug", async (c) =>
		ok(
			c,
			await service.updateProject(
				deps.db,
				user(c),
				c.req.param("slug"),
				await body(c.req, s.updateProjectSchema),
			),
		),
	);
	app.get("/:slug/tasks", async (c) =>
		ok(c, await service.listTasks(deps.db, user(c), c.req.param("slug"))),
	);
	app.post("/:slug/tasks", async (c) =>
		ok(
			c,
			await service.createTask(
				deps.db,
				user(c),
				c.req.param("slug"),
				await body(c.req, s.createTaskSchema),
			),
			201,
		),
	);
	app.patch("/:slug/tasks/:number", async (c) =>
		ok(
			c,
			await service.updateTask(
				deps.db,
				user(c),
				c.req.param("slug"),
				number(c.req.param("number")),
				await body(c.req, s.updateTaskSchema),
			),
		),
	);
	app.delete("/:slug/tasks/:number", async (c) => {
		await service.deleteTask(deps.db, user(c), c.req.param("slug"), number(c.req.param("number")));
		return noContent(c);
	});
	app.get("/:slug/notes", async (c) =>
		ok(c, await service.listNotes(deps.db, user(c), c.req.param("slug"))),
	);
	app.post("/:slug/notes", async (c) =>
		ok(
			c,
			await service.createNote(
				deps.db,
				user(c),
				c.req.param("slug"),
				await body(c.req, s.createNoteSchema),
			),
			201,
		),
	);
	app.patch("/:slug/notes/:id", async (c) =>
		ok(
			c,
			await service.updateNote(
				deps.db,
				user(c),
				c.req.param("slug"),
				uuid(c.req.param("id")),
				await body(c.req, s.updateNoteSchema),
			),
		),
	);
	app.delete("/:slug/notes/:id", async (c) => {
		await service.deleteNote(deps.db, user(c), c.req.param("slug"), uuid(c.req.param("id")));
		return noContent(c);
	});
	return app;
}
