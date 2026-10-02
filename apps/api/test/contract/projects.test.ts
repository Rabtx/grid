import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, schema } from "@grid/db";
import { createPersonalWorkspace } from "@grid/db/workspaces";
import { and, eq } from "drizzle-orm";

import { API_URL, call, demoToken, json, stable } from "./client";

// These tests set up and clean their own rows. `bun run test:contract` loads DATABASE_URL.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is needed: run bun run test:contract");
const database = createDatabase(process.env.DATABASE_URL);
const slug = `contract-${crypto.randomUUID().slice(0, 8)}`;
const foreignSlug = `foreign-${crypto.randomUUID().slice(0, 8)}`;
let token: string;
let ownerId: string;
let foreignUserId: string;
let foreignWorkspaceId: string;

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
	const workspace = await createPersonalWorkspace(database.db, foreign);
	foreignWorkspaceId = workspace.id;
	await database.db
		.insert(schema.projects)
		.values({ workspaceId: workspace.id, slug: foreignSlug, name: "Foreign" });
}, 90_000);

afterAll(async () => {
	if (ownerId)
		await database.db
			.delete(schema.projects)
			.where(and(eq(schema.projects.createdBy, ownerId), eq(schema.projects.slug, slug)));
	if (foreignWorkspaceId)
		await database.db.delete(schema.workspaces).where(eq(schema.workspaces.id, foreignWorkspaceId));
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

	it("pins, shares and marks a note without counting that as an edit, naming its author", async () => {
		const created = await request(`/${slug}/notes`, json({ body: "# Rules\n\nRound to 5" }));
		const note = payload(created);
		expect(note).toMatchObject({ pinned: false, shared: false, icon: null });
		expect(note.author).toEqual({ name: expect.any(String) });
		expect(note.editor).toEqual(note.author);
		const id = note.id as string;
		const flagged = payload(
			await request(
				`/${slug}/notes/${id}`,
				json({ pinned: true, shared: true, icon: "rules" }, { method: "PATCH" }),
			),
		);
		expect(flagged).toMatchObject({ pinned: true, shared: true, icon: "rules", body: note.body });
		expect(flagged.updatedAt).toBe(note.updatedAt);
		const edited = payload(
			await request(
				`/${slug}/notes/${id}`,
				json({ body: "# Rules\n\nRound to 10" }, { method: "PATCH" }),
			),
		);
		expect(edited).toMatchObject({ pinned: true, shared: true, body: "# Rules\n\nRound to 10" });
		expect(edited.updatedAt).not.toBe(note.updatedAt);
		for (const bad of [{}, { icon: "rocket" }, { pinned: "yes" }]) {
			const reply = await request(`/${slug}/notes/${id}`, json(bad, { method: "PATCH" }));
			expect(reply.status).toBe(400);
		}
		expect((await request(`/${slug}/notes/${id}`, { method: "DELETE" })).status).toBe(204);
	});

	it("names which agents a shared note goes to, every agent by default", async () => {
		const note = payload(await request(`/${slug}/notes`, json({ body: "Agents read this" })));
		expect(note.agents).toBeNull();
		const id = note.id as string;
		const chosen = payload(
			await request(
				`/${slug}/notes/${id}`,
				json({ agents: ["claude", "codex", "claude"] }, { method: "PATCH" }),
			),
		);
		expect(chosen.agents).toEqual(["claude", "codex"]);
		expect(chosen.updatedAt).toBe(note.updatedAt);
		const everyone = payload(
			await request(`/${slug}/notes/${id}`, json({ agents: [] }, { method: "PATCH" })),
		);
		expect(everyone.agents).toBeNull();
		const bad = await request(
			`/${slug}/notes/${id}`,
			json({ agents: ["Not An Id"] }, { method: "PATCH" }),
		);
		expect(bad.status).toBe(400);
		expect((await request(`/${slug}/notes/${id}`, { method: "DELETE" })).status).toBe(204);
	});

	it("keeps a note's image and serves it, refusing other files", async () => {
		const note = payload(await request(`/${slug}/notes`, json({ body: "With a picture" })));
		const id = note.id as string;
		const upload = (file: File) => {
			const form = new FormData();
			form.set("file", file);
			return request(`/${slug}/notes/${id}/images`, { method: "POST", body: form });
		};
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		const added = await upload(new File([bytes], "eta.png", { type: "image/png" }));
		expect(added.status).toBe(201);
		const url = (payload(added) as { url: string }).url;
		expect(url).toMatch(/^\/uploads\/notes\/[0-9a-f-]{36}\.png$/);
		const served = await fetch(`${API_URL}${url}`);
		expect(served.status).toBe(200);
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes);
		const text = await upload(new File(["hi"], "x.txt", { type: "text/plain" }));
		expect(text.status).toBe(400);
		const missing = await request(`/${slug}/notes/00000000-0000-4000-8000-000000000000/images`, {
			method: "POST",
			body: new FormData(),
		});
		expect(missing.status).toBe(404);
		expect((await request(`/${slug}/notes/${id}`, { method: "DELETE" })).status).toBe(204);
	});
});
