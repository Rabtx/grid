import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, schema } from "@grid/db";
import { and, eq } from "drizzle-orm";

import { call, demoToken, json, stable } from "./client";

// These tests set up and clean their own rows. `bun run test:contract` loads DATABASE_URL.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed: run bun run test:contract");
const database = createDatabase(process.env.DATABASE_URL);
const slug = `contract-${crypto.randomUUID().slice(0, 8)}`;
const foreignSlug = `foreign-${crypto.randomUUID().slice(0, 8)}`;
let token: string;
let ownerId: string;
let foreignUserId: string;

const auth = () => ({ authorization: `Bearer ${token}` });
const request = (path: string, init: RequestInit = {}) =>
	call(`/api/v1/projects${path}`, { ...init, headers: { ...auth(), ...init.headers } });
const payload = (reply: Awaited<ReturnType<typeof call>>) =>
	(stable(reply.body) as { data: Record<string, unknown> }).data;

beforeAll(async () => {
	token = await demoToken();
	const [owner] = await database.db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, "demo@grid.dev"));
	if (!owner) throw new Error("Seed the demo account before contract tests");
	ownerId = owner.id;
	const [foreign] = await database.db
		.insert(schema.users)
		.values({
			email: `${foreignSlug}@example.test`,
			username: foreignSlug,
			passwordHash: null,
		})
		.returning();
	if (!foreign) throw new Error("Foreign owner insert failed");
	foreignUserId = foreign.id;
	await database.db
		.insert(schema.projects)
		.values({ ownerId: foreign.id, slug: foreignSlug, name: "Foreign" });
}, 90_000);

afterAll(async () => {
	if (ownerId)
		await database.db
			.delete(schema.projects)
			.where(and(eq(schema.projects.ownerId, ownerId), eq(schema.projects.slug, slug)));
	if (foreignUserId)
		await database.db.delete(schema.users).where(eq(schema.users.id, foreignUserId));
	await database.close();
});

describe("projects, tasks and notes", () => {
	it("requires a token and keeps another owner's project private", async () => {
		const noToken = await call("/api/v1/projects");
		expect(noToken.status).toBe(401);
		expect(stable(noToken.body)).toMatchObject({ code: "AUTH_REQUIRED" });
		const other = await request(`/${foreignSlug}`);
		expect(other.status).toBe(404);
		expect(stable(other.body)).toMatchObject({
			code: "NOT_FOUND",
			message: `Project "${foreignSlug}" not found`,
		});
	});

	it("lists, creates, gets and updates projects; rejects duplicate slugs and bad input", async () => {
		const bad = await request("", json({ slug: "!", name: "" }));
		expect(bad.status).toBe(400);
		expect(stable(bad.body)).toMatchObject({ code: "VALIDATION_ERROR", errors: expect.any(Array) });
		const created = await request(
			"",
			json({ slug, name: "Contract", icon: "grid", color: "#123456" }),
		);
		expect(created.status).toBe(201);
		expect(payload(created)).toMatchObject({ slug, name: "Contract", status: "active" });
		const duplicate = await request("", json({ slug, name: "Again" }));
		expect(duplicate.status).toBe(409);
		expect(stable(duplicate.body)).toMatchObject({
			code: "CONFLICT",
			message: `Project "${slug}" already exists`,
		});
		expect(
			(payload(await request("")) as unknown as { slug: string }[]).some((p) => p.slug === slug),
		).toBe(true);
		expect(payload(await request(`/${slug}`))).toMatchObject({ slug, icon: "grid" });
		const updated = await request(
			`/${slug}`,
			json({ name: "Changed", summary: "A summary" }, { method: "PATCH" }),
		);
		expect(updated.status).toBe(200);
		expect(payload(updated)).toMatchObject({ name: "Changed", summary: "A summary" });
	});

	it("numbers tasks, moves stages and position, and deletes them", async () => {
		const first = await request(`/${slug}/tasks`, json({ title: "First" }));
		const second = await request(
			`/${slug}/tasks`,
			json({ title: "Second", status: "ready", ownerKind: "agent", ownerName: "Codex" }),
		);
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(payload(first)).toMatchObject({
			key: "TASK-1",
			number: 1,
			position: 1,
			status: "backlog",
		});
		expect(payload(second)).toMatchObject({
			key: "TASK-2",
			number: 2,
			position: 2,
			owner: { kind: "agent", name: "Codex" },
		});
		const moved = await request(
			`/${slug}/tasks/1`,
			json({ status: "done", position: 0 }, { method: "PATCH" }),
		);
		expect(payload(moved)).toMatchObject({ status: "done", position: 0 });
		const listed = await request(`/${slug}/tasks`);
		expect((payload(listed) as unknown as { number: number }[]).map((t) => t.number)).toEqual([
			1, 2,
		]);
		const invalid = await request(`/${slug}/tasks/1`, json({ position: -1 }, { method: "PATCH" }));
		expect(stable(invalid.body)).toMatchObject({ code: "VALIDATION_ERROR" });
		for (const number of [1, 2])
			expect((await request(`/${slug}/tasks/${number}`, { method: "DELETE" })).status).toBe(204);
		expect((await request(`/${slug}/tasks`)).body).toMatchObject({ data: [] });
	});

	it("allocates distinct task numbers for concurrent creates", async () => {
		const replies = await Promise.all(
			Array.from({ length: 8 }, (_, index) =>
				request(`/${slug}/tasks`, json({ title: `Concurrent ${index}` })),
			),
		);
		expect(replies.map((reply) => reply.status)).toEqual(Array(8).fill(201));
		const numbers = replies.map((reply) => payload(reply).number as number).sort((a, b) => a - b);
		expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		for (const number of numbers)
			expect((await request(`/${slug}/tasks/${number}`, { method: "DELETE" })).status).toBe(204);
	});

	it("lists, creates, edits and deletes notes, rejecting bad UUIDs", async () => {
		const created = await request(
			`/${slug}/notes`,
			json({ body: "First note", source: "contract" }),
		);
		expect(created.status).toBe(201);
		const id = payload(created).id as string;
		expect(payload(created)).toMatchObject({ body: "First note", source: "contract" });
		expect((payload(await request(`/${slug}/notes`)) as unknown as { id: string }[])[0]?.id).toBe(
			id,
		);
		const edited = await request(
			`/${slug}/notes/${id}`,
			json({ body: "Edited" }, { method: "PATCH" }),
		);
		expect(payload(edited)).toMatchObject({ body: "Edited" });
		const invalid = await request(
			`/${slug}/notes/not-a-uuid`,
			json({ body: "x" }, { method: "PATCH" }),
		);
		expect(invalid.status).toBe(400);
		expect((await request(`/${slug}/notes/${id}`, { method: "DELETE" })).status).toBe(204);
		expect((await request(`/${slug}/notes`)).body).toMatchObject({ data: [] });
	});
});
