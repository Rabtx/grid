import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, schema } from "@grid/db";
import { eq } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { call, json, stable } from "./client";

process.loadEnvFile("../nest-api/.env");
const database = createDatabase(process.env.DATABASE_URL!);
let token: string;
let user: typeof schema.users.$inferSelect;
let profile: typeof schema.userProfiles.$inferSelect | undefined;
let avatarFile: string | undefined;
const auth = () => ({ authorization: `Bearer ${token}` });
const data = (reply: Awaited<ReturnType<typeof call>>) =>
	(stable(reply.body) as { data: Record<string, unknown> }).data;

async function demoLogin() {
	for (let attempt = 0; attempt < 2; attempt++) {
		const reply = await call(
			"/api/v1/auth/login",
			json(
				{ email: "demo@grid.dev", password: "GridDemo2026!" },
				{ headers: { origin: "http://localhost:3001", "x-requested-with": "XMLHttpRequest" } },
			),
		);
		if (reply.status !== 429) return reply;
		if (attempt === 0)
			await Bun.sleep((Number(reply.headers.get("retry-after")) || 60) * 1000 + 1000);
	}
	throw new Error("Demo login remained throttled after Retry-After");
}

beforeAll(async () => {
	const login = await demoLogin();
	expect(login.status).toBe(200);
	token = data(login).accessToken as string;
	const [found] = await database.db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, "demo@grid.dev"));
	if (!found) throw new Error("Seed the demo account before contract tests");
	user = found;
	[profile] = await database.db
		.select()
		.from(schema.userProfiles)
		.where(eq(schema.userProfiles.userId, user.id));
}, 90_000);

afterAll(async () => {
	if (user) {
		await database.db
			.update(schema.users)
			.set({ username: user.username, updatedAt: user.updatedAt })
			.where(eq(schema.users.id, user.id));
		if (profile)
			await database.db
				.insert(schema.userProfiles)
				.values(profile)
				.onConflictDoUpdate({ target: schema.userProfiles.userId, set: profile });
		else
			await database.db.delete(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
	}
	if (avatarFile) await unlink(avatarFile);
	await database.close();
});

describe("profile and avatar", () => {
	it("requires a bearer token", async () => {
		const reply = await call("/api/v1/users/me/profile", json({ bio: "x" }, { method: "PATCH" }));
		expect(reply.status).toBe(401);
		expect(stable(reply.body)).toMatchObject({ code: "AUTH_REQUIRED" });
	});

	it("gets and updates the current profile with validation errors", async () => {
		const username = `contract-${crypto.randomUUID().slice(0, 8)}`;
		expect((await call("/api/v1/users/me", { headers: auth() })).status).toBe(200);
		const bad = await call(
			"/api/v1/users/me/profile",
			json({ username: "!" }, { method: "PATCH", headers: auth() }),
		);
		expect(bad.status).toBe(400);
		expect(stable(bad.body)).toMatchObject({ code: "VALIDATION_ERROR", errors: expect.any(Array) });
		const changed = await call(
			"/api/v1/users/me/profile",
			json(
				{ username, displayName: "Contract", bio: "A test", timezone: "UTC" },
				{ method: "PATCH", headers: auth() },
			),
		);
		expect(changed.status).toBe(200);
		expect(data(changed)).toMatchObject({
			username,
			profile: { displayName: "Contract", bio: "A test", timezone: "UTC" },
		});
	});

	it("uploads a PNG and serves it, with type and size limits", async () => {
		const bad = new FormData();
		bad.set("file", new File(["bad"], "x.txt", { type: "text/plain" }));
		const rejected = await call("/api/v1/users/me/avatar", {
			method: "POST",
			headers: auth(),
			body: bad,
		});
		expect(rejected.status).toBe(400);
		expect(stable(rejected.body)).toMatchObject({
			message: "Avatar must be a JPEG, PNG, or WebP image",
		});
		const large = new FormData();
		large.set(
			"file",
			new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }),
		);
		const oversized = await call("/api/v1/users/me/avatar", {
			method: "POST",
			headers: auth(),
			body: large,
		});
		expect(oversized.status).toBe(413);
		const form = new FormData();
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		form.set("file", new File([bytes], "contract.png", { type: "image/png" }));
		const uploaded = await call("/api/v1/users/me/avatar", {
			method: "POST",
			headers: auth(),
			body: form,
		});
		expect(uploaded.status).toBe(200);
		const url = (data(uploaded).profile as { avatarUrl: string }).avatarUrl;
		expect(url).toMatch(/\/uploads\/avatars\/[\w-]+\.png$/);
		avatarFile = join(import.meta.dir, "../../../nest-api", new URL(url).pathname);
		const image = await fetch(url);
		expect(image.status).toBe(200);
		expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
	});
});
