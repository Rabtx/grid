import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { type Database, schema } from "@grid/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { requireUser, type SessionLookup } from "../../http/auth";
import type { AppContext, AppEnv } from "../../http/context";
import { ApiError, badRequest, conflict, unauthorized } from "../../http/errors";
import { ok } from "../../http/respond";
import { body } from "../../http/validate";
import { isUniqueViolation } from "../users/users";
import { updateProfileSchema } from "./schema";

const maxBytes = 2 * 1024 * 1024;
const extensions: Record<string, string> = {
	"image/jpeg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
};
const profileView = (p: schema.UserProfileRecord | null) => ({
	displayName: p?.displayName ?? null,
	avatarUrl: p?.avatarUrl ?? null,
	bio: p?.bio ?? null,
	timezone: p?.timezone ?? null,
	locale: p?.locale ?? null,
});
const publicUser = (u: schema.UserRecord) => ({
	id: u.id,
	email: u.email,
	username: u.username,
	isActive: u.isActive,
	emailVerified: u.emailVerifiedAt !== null,
	hasPassword: u.passwordHash !== null,
	passwordChangedAt: u.passwordHash ? u.passwordChangedAt.toISOString() : null,
	createdAt: u.createdAt.toISOString(),
});

async function current(db: Database, userId: string) {
	const [[user], [profile]] = await Promise.all([
		db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1),
		db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).limit(1),
	]);
	if (!user?.isActive)
		throw unauthorized({ code: "AUTH_SESSION_INVALID", message: "Authentication required" });
	return { ...publicUser(user), profile: profileView(profile ?? null) };
}
async function upsert(
	db: Database,
	userId: string,
	input: Omit<schema.NewUserProfileRecord, "userId">,
) {
	const [profile] = await db
		.insert(schema.userProfiles)
		.values({ userId, ...input })
		.onConflictDoUpdate({
			target: schema.userProfiles.userId,
			set: { ...input, updatedAt: new Date() },
		})
		.returning();
	if (!profile) throw new Error("Profile update did not return a record");
}
function requestOrigin(c: AppContext) {
	const first = (name: string) => c.req.header(name)?.split(",")[0]?.trim();
	const host = first("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
	const protocol = first("x-forwarded-proto") ?? new URL(c.req.url).protocol.slice(0, -1);
	if (!host) throw badRequest("Unable to resolve public host for avatar URL");
	return `${protocol}://${host}`;
}
async function avatar(c: AppContext, db: Database, userId: string, uploadsDir: string) {
	const form = await c.req.formData().catch(() => null);
	const file = form?.get("file");
	if (!(file instanceof File)) throw badRequest("Avatar image is required");
	const extension = extensions[file.type];
	if (!extension) throw badRequest("Avatar must be a JPEG, PNG, or WebP image");
	if (file.size > maxBytes) throw new ApiError(413, "File too large");
	const filename = `${crypto.randomUUID()}${extension}`;
	await mkdir(join(uploadsDir, "avatars"), { recursive: true });
	await Bun.write(join(uploadsDir, "avatars", filename), file);
	await upsert(db, userId, { avatarUrl: `${requestOrigin(c)}/uploads/avatars/${filename}` });
	return current(db, userId);
}

export function profileRoutes(deps: {
	db: Database;
	sessions: SessionLookup;
	uploadsDir: string;
}): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", requireUser(deps.sessions));
	app.get("/", async (c) => ok(c, await current(deps.db, c.get("user").sub)));
	app.patch("/profile", async (c) => {
		const userId = c.get("user").sub;
		const input = await body(c.req, updateProfileSchema);
		if (input.username) {
			const [existing] = await deps.db
				.select()
				.from(schema.users)
				.where(eq(schema.users.username, input.username))
				.limit(1);
			if (existing && existing.id !== userId)
				throw conflict({ code: "AUTH_USERNAME_TAKEN", message: "This username is already taken" });
			try {
				const [updated] = await deps.db
					.update(schema.users)
					.set({ username: input.username, updatedAt: new Date() })
					.where(eq(schema.users.id, userId))
					.returning();
				if (!updated)
					throw unauthorized({ code: "AUTH_SESSION_INVALID", message: "Authentication required" });
			} catch (error) {
				if (isUniqueViolation(error))
					throw conflict({
						code: "AUTH_USERNAME_TAKEN",
						message: "This username is already taken",
					});
				throw error;
			}
		}
		const { username: _username, ...profileInput } = input;
		if (Object.keys(profileInput).length) await upsert(deps.db, userId, profileInput);
		return ok(c, await current(deps.db, userId));
	});
	app.post("/avatar", async (c) =>
		ok(c, await avatar(c, deps.db, c.get("user").sub, deps.uploadsDir)),
	);
	return app;
}

/** What `/uploads/…` serves: avatars and notes' images, each under a random name. */
const UPLOADED = /^\/uploads\/(avatars|notes)\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif))$/;

export async function uploadedFile(c: AppContext, uploadsDir: string): Promise<Response> {
	const match = UPLOADED.exec(c.req.path);
	if (!match || (match[1] === "avatars" && match[2].endsWith(".gif"))) return c.notFound();
	const file = Bun.file(join(uploadsDir, match[1], match[2]));
	if (!(await file.exists())) return c.notFound();
	return new Response(file, { headers: { "content-type": file.type } });
}
