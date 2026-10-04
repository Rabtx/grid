import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { Database } from "@grid/db";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { badRequest } from "../../http/errors";
import { rateLimit } from "../../http/rate-limit";
import { noContent, ok } from "../../http/respond";
import { body } from "../../http/validate";
import type { EmailSender } from "../email/email";
import { projectRoutes } from "../projects/routes";
import { searchRoutes } from "../projects/search";
import { findUserById } from "../users/users";
import type { WorkspaceScope } from "./access";
import * as data from "./data";
import * as invites from "./invites";
import * as s from "./schema";
import * as service from "./service";

const uuid = (value: string) => {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
		throw badRequest("Validation failed (uuid is expected)");
	return value;
};

type Deps = {
	db: Database;
	sessions: SessionLookup;
	send: EmailSender;
	uploadsDir: string;
	databaseUrl?: string;
	backupsDir?: string;
};

const LOGO_TYPES: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** `/workspaces`: the ones you belong to, their members and invites, and each one's projects. */
export function workspaceRoutes(deps: Deps): Hono<AppEnv> {
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
	app.get("/:ws/invites", async (c) => ok(c, await invites.listInvites(deps.db, scope(c))));
	app.post("/:ws/invites", async (c) =>
		ok(
			c,
			await invites.createInvite(
				{ db: deps.db, send: deps.send, config: c.get("config") },
				scope(c),
				await body(c.req, s.createInviteSchema),
			),
			201,
		),
	);
	app.delete("/:ws/invites/:id", async (c) => {
		await invites.revokeInvite(deps.db, scope(c), uuid(c.req.param("id")));
		return noContent(c);
	});
	app.post("/:ws/invites/:id/resend", async (c) =>
		ok(
			c,
			await invites.resendInvite(
				{ db: deps.db, send: deps.send, config: c.get("config") },
				scope(c),
				uuid(c.req.param("id")),
			),
		),
	);
	// The workspace's logo: stored as a path on this API, so it works on any address it is reached by.
	app.post("/:ws/logo", async (c) => {
		const form = await c.req.formData().catch(() => null);
		const file = form?.get("file");
		if (!(file instanceof File)) throw badRequest("A logo image is required");
		const extension = LOGO_TYPES[file.type];
		if (!extension) throw badRequest("A logo must be a PNG, JPEG, WebP or SVG image");
		if (file.size > MAX_LOGO_BYTES) throw badRequest("A logo must be under 2 MB");
		await service.getWorkspace(deps.db, scope(c));
		const name = `${crypto.randomUUID()}${extension}`;
		await mkdir(join(deps.uploadsDir, "logos"), { recursive: true });
		await Bun.write(join(deps.uploadsDir, "logos", name), file);
		return ok(c, await service.updateLogo(deps.db, scope(c), `/uploads/logos/${name}`));
	});
	app.get("/:ws/data", async (c) => ok(c, await data.dataStatus(backupDeps(deps), scope(c))));
	app.post("/:ws/backups", rateLimit({ limit: 3, windowMs: 60_000 }), async (c) => {
		try {
			return ok(c, await data.backUpNow(backupDeps(deps), scope(c)), 201);
		} catch (cause) {
			if (cause instanceof Error && /pg_dump/.test(cause.message)) throw badRequest(cause.message);
			throw cause;
		}
	});
	app.get("/:ws/export", async (c) => {
		const exported = await data.exportWorkspace(deps.db, scope(c));
		const day = exported.exportedAt.slice(0, 10);
		return new Response(JSON.stringify(exported, null, "\t"), {
			headers: {
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="grid-${exported.workspace.slug}-${day}.json"`,
			},
		});
	});
	app.route("/:ws/projects", projectRoutes(deps));
	app.route("/:ws/search", searchRoutes(deps));
	return app;
}

function backupDeps(deps: Deps): data.BackupDeps {
	if (!deps.databaseUrl || !deps.backupsDir) throw badRequest("Backups are not set up on this API");
	return { db: deps.db, databaseUrl: deps.databaseUrl, backupsDir: deps.backupsDir };
}

const token = (value: string) => {
	if (!s.inviteTokenSchema.safeParse(value).success) throw invites.inviteInvalid();
	return value;
};

/** `/invites/:token`: what an invite is for (no sign-in needed), and accepting it. */
export function inviteRoutes(deps: Deps): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", rateLimit({ limit: 20, windowMs: 60_000 }));
	app.get("/:token", async (c) =>
		ok(c, await invites.previewInvite(deps.db, token(c.req.param("token")))),
	);
	app.post("/:token/accept", requireUser(deps.sessions), async (c) => {
		const user = await findUserById(deps.db, c.get("user").sub);
		if (!user) throw invites.inviteInvalid();
		return ok(c, await invites.acceptInvite(deps.db, token(c.req.param("token")), user));
	});
	return app;
}
