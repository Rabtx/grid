import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { Database } from "@grid/db";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { ApiError, badRequest } from "../../http/errors";
import { noContent, ok } from "../../http/respond";
import { body } from "../../http/validate";
import type { WorkspaceScope } from "../workspaces/access";
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

/** The images a note can hold, and how large. */
const NOTE_IMAGE_TYPES: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif",
};
const NOTE_IMAGE_BYTES = 5 * 1024 * 1024;

export function projectRoutes(deps: {
	db: Database;
	sessions: SessionLookup;
	uploadsDir: string;
}): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));
	// Under `/workspaces/:ws/projects` the workspace comes from the URL; the bare `/projects` means
	// the user's default workspace.
	const user = (c: AppContext): WorkspaceScope => ({
		userId: c.get("user").sub,
		workspace: c.req.param("ws") ?? null,
	});
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
	// An image for a note: kept with the uploads, its address goes into the note's Markdown.
	app.post("/:slug/notes/:id/images", async (c) => {
		await service.requireNote(deps.db, user(c), c.req.param("slug"), uuid(c.req.param("id")));
		const form = await c.req.formData().catch(() => null);
		const file = form?.get("file");
		if (!(file instanceof File)) throw badRequest("An image is required");
		const extension = NOTE_IMAGE_TYPES[file.type];
		if (!extension) throw badRequest("Images must be PNG, JPEG, WebP or GIF");
		if (file.size > NOTE_IMAGE_BYTES) throw new ApiError(413, "Images can be up to 5 MB");
		const name = `${crypto.randomUUID()}${extension}`;
		await mkdir(join(deps.uploadsDir, "notes"), { recursive: true });
		await Bun.write(join(deps.uploadsDir, "notes", name), file);
		return ok(c, { url: `/uploads/notes/${name}` }, 201);
	});
	app.delete("/:slug/notes/:id", async (c) => {
		await service.deleteNote(deps.db, user(c), c.req.param("slug"), uuid(c.req.param("id")));
		return noContent(c);
	});
	return app;
}
