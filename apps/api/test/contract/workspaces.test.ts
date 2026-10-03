import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, schema } from "@grid/db";
import { createPersonalWorkspace } from "@grid/db/workspaces";
import { eq, inArray } from "drizzle-orm";

import { call, demoToken, json, SIGN_IN_TIMEOUT, stable } from "./client";

// These tests set up and clean their own rows. `bun run test:contract` loads DATABASE_URL.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed: run bun run test:contract");
const database = createDatabase(process.env.DATABASE_URL);
const tag = crypto.randomUUID().slice(0, 8);
const slug = `acme-${tag}`;
const foreignSlug = `foreign-${tag}`;
let token: string;
let demoId: string;
let foreignUserId: string;
let foreignWorkspace: string;

const request = (path: string, init: RequestInit = {}) =>
	call(`/api/v1/workspaces${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, ...init.headers },
	});
const payload = (reply: Awaited<ReturnType<typeof call>>) =>
	(stable(reply.body) as { data: Record<string, unknown> }).data;

beforeAll(async () => {
	token = await demoToken();
	const [demo] = await database.db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, "demo@grid.dev"));
	if (!demo) throw new Error("Seed the demo account before contract tests");
	demoId = demo.id;
	const [foreign] = await database.db
		.insert(schema.users)
		.values({ email: `${foreignSlug}@example.test`, username: foreignSlug, passwordHash: null })
		.returning();
	if (!foreign) throw new Error("Foreign user insert failed");
	foreignUserId = foreign.id;
	foreignWorkspace = (await createPersonalWorkspace(database.db, foreign)).slug;
}, SIGN_IN_TIMEOUT);

afterAll(async () => {
	await database.db
		.delete(schema.workspaces)
		.where(inArray(schema.workspaces.slug, [slug, `${slug}-renamed`, foreignWorkspace]));
	if (foreignUserId)
		await database.db.delete(schema.users).where(eq(schema.users.id, foreignUserId));
	await database.close();
});

describe("workspaces", () => {
	it("requires a token and lists the caller's workspaces with their role", async () => {
		expect((await call("/api/v1/workspaces")).status).toBe(401);
		const listed = payload(await request("")) as unknown as {
			id: string;
			slug: string;
			role: string;
			isDefault: boolean;
		}[];
		expect(listed.length).toBeGreaterThan(0);
		expect(listed.some((w) => w.role === "owner")).toBe(true);
		// Exactly one is the default, and each carries the id other services key it by.
		expect(listed.filter((w) => w.isDefault)).toHaveLength(1);
		expect(listed.every((w) => /^[0-9a-f-]{36}$/.test(w.id))).toBe(true);
		expect(listed.some((w) => w.slug === foreignWorkspace)).toBe(false);
	});

	it("hides a workspace the caller does not belong to", async () => {
		for (const path of [`/${foreignWorkspace}`, `/${foreignWorkspace}/projects`]) {
			const reply = await request(path);
			expect(reply.status).toBe(404);
			expect(stable(reply.body)).toMatchObject({
				code: "NOT_FOUND",
				message: `Workspace "${foreignWorkspace}" not found`,
			});
		}
	});

	it("creates a workspace owned by its creator; rejects reserved and taken slugs", async () => {
		const reserved = await request("", json({ slug: "settings", name: "Nope" }));
		expect(reserved.status).toBe(400);
		expect(stable(reserved.body)).toMatchObject({ code: "VALIDATION_ERROR" });
		const created = await request("", json({ slug, name: "Acme" }));
		expect(created.status).toBe(201);
		expect(payload(created)).toMatchObject({ slug, name: "Acme", role: "owner" });
		const taken = await request("", json({ slug: foreignWorkspace, name: "Taken" }));
		expect(taken.status).toBe(409);
		expect(payload(await request(`/${slug}`))).toMatchObject({ slug, role: "owner" });
	});

	it("keeps projects per workspace", async () => {
		const created = await request(`/${slug}/projects`, json({ slug: "web-app", name: "Web app" }));
		expect(created.status).toBe(201);
		const listed = payload(await request(`/${slug}/projects`)) as unknown as { slug: string }[];
		expect(listed.map((p) => p.slug)).toEqual(["web-app"]);
		const task = await request(`/${slug}/projects/web-app/tasks`, json({ title: "Ship it" }));
		expect(payload(task)).toMatchObject({ key: "TASK-1" });
		// The bare /projects is the default workspace, which is not this one.
		const fallback = await call("/api/v1/projects/web-app", {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(fallback.status).toBe(404);
	});

	it("lists members and always keeps an owner", async () => {
		const members = payload(await request(`/${slug}/members`)) as unknown as {
			userId: string;
			role: string;
		}[];
		expect(members).toEqual([expect.objectContaining({ userId: demoId, role: "owner" })]);
		const demote = await request(
			`/${slug}/members/${demoId}`,
			json({ role: "admin" }, { method: "PATCH" }),
		);
		expect(demote.status).toBe(400);
		expect(stable(demote.body)).toMatchObject({ message: "A workspace needs at least one owner" });
		const leave = await request(`/${slug}/members/${demoId}`, { method: "DELETE" });
		expect(leave.status).toBe(400);
		const stranger = await request(`/${slug}/members/${foreignUserId}`, { method: "DELETE" });
		expect(stranger.status).toBe(404);
	});

	it("keeps settings for everyone, merging each change into what is there", async () => {
		const first = await request(
			`/${slug}`,
			json(
				{ settings: { defaultBranch: "main", agentAccess: { codex: "admins" } } },
				{ method: "PATCH" },
			),
		);
		expect(first.status).toBe(200);
		const second = await request(
			`/${slug}`,
			json(
				{ settings: { logRetentionDays: 90, agentAccess: { claude: "everyone" } } },
				{ method: "PATCH" },
			),
		);
		expect(payload(second).settings).toEqual({
			defaultBranch: "main",
			logRetentionDays: 90,
			agentAccess: { codex: "admins", claude: "everyone" },
		});
		const bad = await request(
			`/${slug}`,
			json({ settings: { logRetentionDays: 3 } }, { method: "PATCH" }),
		);
		expect(bad.status).toBe(400);
	});

	it("says where the data lives, exports it, and takes a logo", async () => {
		const status = payload(await request(`/${slug}/data`)) as unknown as {
			host: string;
			database: { healthy: boolean; version: string; sizeBytes: number };
			backups: { available: boolean };
		};
		expect(status.database.healthy).toBe(true);
		expect(status.database.version).toStartWith("Postgres");
		expect(status.database.sizeBytes).toBeGreaterThan(0);
		const exported = await call(`/api/v1/workspaces/${slug}/export`, {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(exported.status).toBe(200);
		expect(exported.body).toMatchObject({ format: "grid-workspace-export", workspace: { slug } });
		const form = new FormData();
		form.append(
			"file",
			new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "logo.svg", {
				type: "image/svg+xml",
			}),
		);
		const logo = await request(`/${slug}/logo`, { method: "POST", body: form });
		expect(logo.status).toBe(200);
		expect(String(payload(logo).logoUrl)).toMatch(/^\/uploads\/logos\/.+\.svg$/);
	});

	it("renames and deletes a workspace", async () => {
		const renamed = await request(
			`/${slug}`,
			json({ slug: `${slug}-renamed` }, { method: "PATCH" }),
		);
		expect(renamed.status).toBe(200);
		expect(payload(renamed)).toMatchObject({ slug: `${slug}-renamed` });
		expect((await request(`/${slug}-renamed`, { method: "DELETE" })).status).toBe(204);
		expect((await request(`/${slug}-renamed`)).status).toBe(404);
	});
});
