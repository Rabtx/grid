import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type Database, type DatabaseInstance, schema } from "@grid/db";

import { createApp } from "../../app";
import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";

const KEY = "runner-key-for-tests-that-is-32-chars-long";
const workspaceId = crypto.randomUUID();
const userId = crypto.randomUUID();

let instance: DatabaseInstance;
let db: Database;
let app: ReturnType<typeof createApp>;

function make(env: Record<string, string>) {
	return createApp({
		config: createConfig(
			parseEnv({
				NODE_ENV: "test",
				JWT_SECRET: "test-secret-that-is-at-least-32-characters",
				...env,
			}),
		),
		db,
		send: async () => {},
		sessions: { session: async () => null, userIsActive: async () => true },
	});
}

const call = (path: string, init: RequestInit = {}, key = KEY) =>
	app.request(`/api/v1/runner${path}`, {
		...init,
		headers: {
			authorization: `Runner ${key}`,
			"content-type": "application/json",
			...init.headers,
		},
	});

type Seqs = { seqs: Record<string, number>; skipped: string[] };
type Row = Record<string, unknown> & { seq: number };
/** The `data` of a reply, as the test expects it to be shaped. */
async function data<T = unknown>(reply: Response | Promise<Response>): Promise<T> {
	return ((await (await reply).json()) as { data: T }).data;
}

const thread = (id: string, events: { seq: number; data: unknown }[], over: object = {}) => ({
	id,
	workspaceId,
	project: "kestrel-app",
	ownerId: userId,
	provider: "codex",
	title: "Round drive times",
	model: "gpt",
	createdAt: "2026-10-09T08:00:00.000Z",
	updatedAt: "2026-10-09T08:05:00.000Z",
	events,
	...over,
});

beforeAll(async () => {
	instance = createDatabase(":memory:");
	await instance.ready;
	await instance.migrate();
	db = instance.db;
	await db
		.insert(schema.users)
		.values({ id: userId, email: "maya@kestrel.test", username: "maya" });
	await db.insert(schema.workspaces).values({ id: workspaceId, slug: "kestrel", name: "Kestrel" });
	app = make({ GRID_RUNNER_KEY: KEY });
});
afterAll(async () => {
	await instance.close();
});

describe("runner routes", () => {
	it("are off without a key, and refuse a wrong one", async () => {
		const off = make({});
		const reply = await off.request("/api/v1/runner/machines", {
			headers: { authorization: `Runner ${KEY}` },
		});
		expect(reply.status).toBe(404);
		expect((await call("/machines", {}, "x".repeat(KEY.length))).status).toBe(401);
		expect((await app.request("/api/v1/runner/machines")).status).toBe(401);
	});

	it("keeps threads and their events, and a repeated round changes nothing", async () => {
		const round = {
			machine: { id: "machine-a-0001", name: "laptop" },
			threads: [
				thread("t1", [
					{ seq: 1, data: { type: "message", text: "Hi" } },
					{ seq: 2, data: { type: "turn_end", reason: "done" } },
				]),
				thread("t2", [], { workspaceId: crypto.randomUUID() }),
			],
		};
		for (let i = 0; i < 2; i++) {
			const reply = await call("/sync", { method: "POST", body: JSON.stringify(round) });
			expect(reply.status).toBe(200);
			expect(await data<Seqs>(reply)).toEqual({ seqs: { t1: 2 }, skipped: ["t2"] });
		}
		const more = await call("/sync", {
			method: "POST",
			body: JSON.stringify({
				...round,
				threads: [
					thread("t1", [{ seq: 3, data: { type: "message", text: "More" } }], { title: "Renamed" }),
				],
			}),
		});
		expect((await data<Seqs>(more)).seqs).toEqual({ t1: 3 });
		const events = await data<Row[]>(call("/threads/t1/events?after=1"));
		expect(events.map((event) => event.seq)).toEqual([2, 3]);
		const [listed] = await data<Row[]>(call("/machines/machine-a-0001/threads"));
		expect(listed).toMatchObject({
			id: "t1",
			title: "Renamed",
			ownerId: userId,
			machineName: "laptop",
		});
	});

	it("tells a runner where a gap in its copy starts, so the rest is sent again", async () => {
		const machine = { id: "machine-a-0001", name: "laptop" };
		const send = async (events: { seq: number; data: unknown }[]) =>
			(
				await data<Seqs>(
					call("/sync", {
						method: "POST",
						body: JSON.stringify({ machine, threads: [thread("gap", events)] }),
					}),
				)
			).seqs.gap;
		expect(
			await send([
				{ seq: 2, data: {} },
				{ seq: 3, data: {} },
			]),
		).toBe(0);
		expect(
			await send([
				{ seq: 1, data: {} },
				{ seq: 5, data: {} },
			]),
		).toBe(3);
		expect(await send([{ seq: 4, data: {} }])).toBe(5);
		await call("/sync", {
			method: "POST",
			body: JSON.stringify({ machine, threads: [], deleted: ["gap"] }),
		});
	});

	it("lists machines, moves a machine's threads on claim, and keeps the old machine out", async () => {
		const machines = await data<Row[]>(call("/machines"));
		expect(machines).toEqual([
			expect.objectContaining({ id: "machine-a-0001", name: "laptop", threads: 1 }),
		]);
		const claim = await call("/machines/machine-a-0001/claim", {
			method: "POST",
			body: JSON.stringify({ machine: { id: "machine-b-0002", name: "vps" } }),
		});
		expect(await data<{ moved: number }>(claim)).toEqual({ moved: 1 });

		// The old machine comes back with a change: it no longer holds the thread, so it is skipped.
		const stale = await call("/sync", {
			method: "POST",
			body: JSON.stringify({
				machine: { id: "machine-a-0001" },
				threads: [
					thread("t1", [{ seq: 4, data: { type: "message", text: "late" } }], { title: "Old" }),
				],
				deleted: ["t1"],
			}),
		});
		expect(await data<Seqs>(stale)).toEqual({ seqs: {}, skipped: ["t1"] });
		const [kept] = await data<Row[]>(call("/machines/machine-b-0002/threads"));
		expect(kept).toMatchObject({ id: "t1", title: "Renamed" });
		expect(await data<Row[]>(call("/threads/t1/events"))).toHaveLength(3);
	});

	it("deletes a thread only for the machine that holds it", async () => {
		const reply = await call("/sync", {
			method: "POST",
			body: JSON.stringify({ machine: { id: "machine-b-0002" }, threads: [], deleted: ["t1"] }),
		});
		expect(reply.status).toBe(200);
		expect(await data<Row[]>(call("/machines/machine-b-0002/threads"))).toEqual([]);
		expect(await data<Row[]>(call("/threads/t1/events"))).toEqual([]);
	});

	it("refuses a malformed round before touching the database", async () => {
		const reply = await call("/sync", {
			method: "POST",
			body: JSON.stringify({ machine: { id: "x" } }),
		});
		expect(reply.status).toBe(400);
	});
});
