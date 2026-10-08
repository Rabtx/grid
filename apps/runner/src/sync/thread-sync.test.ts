import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatStore } from "../chat/store";
import { restore } from "../restore";
import { ThreadSync } from "./thread-sync";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
	const dir = mkdtempSync(join(tmpdir(), "grid-sync-"));
	dirs.push(dir);
	const path = join(dir, "chat.db");
	const store = new ChatStore(path);
	return { dir, path, store };
}

/** A stand-in for the API: keeps events per thread like the real one, and can lose or refuse. */
function fakeApi(options: { skip?: string[] } = {}) {
	const events = new Map<string, Map<number, unknown>>();
	const rounds: { threads: { id: string; events: { seq: number }[] }[]; deleted: string[] }[] = [];
	let down = false;
	const files = new Map<string, { name: string; data: string }>();
	const fetcher = (async (url: string, init?: RequestInit) => {
		if (down) return new Response("down", { status: 503 });
		const file = url.match(/\/threads\/([^/]+)\/attachments\/([^/]+)$/);
		if (file && init?.method === "PUT") {
			const body = JSON.parse(String(init.body));
			files.set(`${file[1]}/${file[2]}`, { name: body.name, data: body.data });
			return Response.json({ data: { kept: true } });
		}
		const round = JSON.parse(String(init?.body));
		rounds.push(round);
		const seqs: Record<string, number> = {};
		const skipped: string[] = [];
		for (const thread of round.threads) {
			if (options.skip?.includes(thread.id)) {
				skipped.push(thread.id);
				continue;
			}
			const kept = events.get(thread.id) ?? new Map();
			for (const event of thread.events) kept.set(event.seq, event.data);
			events.set(thread.id, kept);
			// Like the API: how far the copy is whole from the first event.
			let whole = 0;
			while (kept.has(whole + 1)) whole++;
			seqs[thread.id] = whole;
		}
		for (const id of round.deleted) events.delete(id);
		return Response.json({ data: { seqs, skipped } });
	}) as unknown as typeof fetch;
	return {
		fetcher,
		events,
		files,
		rounds,
		setDown: (value: boolean) => {
			down = value;
		},
	};
}

function thread(store: ChatStore, id: string, texts: string[]) {
	store.create({
		id,
		ownerId: "maya",
		workspaceId: WORKSPACE,
		project: "kestrel-app",
		provider: "codex",
		title: id,
		cwd: "/tmp",
		model: null,
		mode: null,
		effort: null,
		worktree: null,
	});
	store.append(
		id,
		texts.map((text) => ({ type: "message", text }) as const),
	);
}

describe("ThreadSync", () => {
	it("sends a thread once, then only the events after what the server has", async () => {
		const { path, store } = setup();
		const api = fakeApi();
		const sync = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(store, "t1", ["a", "b"]);
		await sync.drain();
		expect(api.events.get("t1")?.size).toBe(2);
		await sync.drain();
		expect(api.rounds).toHaveLength(1);

		store.append("t1", [{ type: "message", text: "c" }]);
		await sync.drain();
		expect(api.rounds.at(-1)?.threads[0]?.events.map((event) => event.seq)).toEqual([3]);
		sync.close();
		store.close();
	});

	it("sends again what a server lost, and keeps the machine it made", async () => {
		const { path, store } = setup();
		const api = fakeApi();
		const first = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(store, "t1", ["a", "b"]);
		await first.drain();
		const machine = first.machine.id;
		first.close();

		api.events.get("t1")?.delete(2); // the server's copy lost an event
		store.append("t1", [{ type: "message", text: "c" }]);
		const again = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		expect(again.machine.id).toBe(machine);
		await again.drain();
		await again.drain();
		expect([...(api.events.get("t1")?.keys() ?? [])].sort()).toEqual([1, 2, 3]);
		again.close();
		store.close();
	});

	it("sends deletions, and does not retry a skipped thread until it changes", async () => {
		const { path, store } = setup();
		const api = fakeApi({ skip: ["gone-elsewhere"] });
		const sync = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(store, "t1", ["a"]);
		thread(store, "gone-elsewhere", ["a"]);
		await sync.drain();
		await sync.drain();
		expect(api.rounds).toHaveLength(1);

		store.delete("t1");
		await sync.drain();
		expect(api.rounds.at(-1)?.deleted).toEqual(["t1"]);
		expect(api.events.has("t1")).toBe(false);
		await sync.drain();
		expect(api.rounds).toHaveLength(2);
		sync.close();
		store.close();
	});

	it("leaves everything to send when the API is down, and catches up after", async () => {
		const { path, store } = setup();
		const api = fakeApi();
		const sync = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(store, "t1", ["a"]);
		api.setDown(true);
		await expect(sync.drain()).rejects.toThrow("503");
		api.setDown(false);
		await sync.drain();
		expect(api.events.get("t1")?.size).toBe(1);
		sync.close();
		store.close();
	});

	it("sends each attached file once, after its thread", async () => {
		const { path, store } = setup();
		const api = fakeApi();
		const sync = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(store, "t1", ["look"]);
		store.addAttachment(
			"t1",
			{ id: "a1", name: "shot.png", size: 3, mimeType: "image/png" },
			new TextEncoder().encode("png"),
		);
		await sync.drain();
		expect(api.files.get("t1/a1")?.name).toBe("shot.png");
		expect(Buffer.from(api.files.get("t1/a1")?.data ?? "", "base64").toString()).toBe("png");
		api.files.clear();
		await sync.drain();
		expect(api.files.size).toBe(0);
		sync.close();
		store.close();
	});

	it("splits a long thread over rounds", async () => {
		const { path, store } = setup();
		const api = fakeApi();
		const sync = new ThreadSync(path, { url: "http://api", key: "k" }, api.fetcher);
		thread(
			store,
			"long",
			Array.from({ length: 3200 }, (_, i) => `m${i}`),
		);
		await sync.drain();
		expect(api.rounds.length).toBe(3);
		expect(api.events.get("long")?.size).toBe(3200);
		sync.close();
		store.close();
	});
});

describe("restore", () => {
	it("lists other machines, imports one machine's threads with their history, and claims them", async () => {
		const { path, store } = setup();
		store.close();
		const calls: string[] = [];
		const fetcher = (async (url: string, init?: RequestInit) => {
			const path = new URL(url).pathname.replace("/api/v1/runner", "");
			calls.push(`${init?.method ?? "GET"} ${path}`);
			if (path === "/machines")
				return Response.json({
					data: [{ id: "old-machine-1", name: "laptop", threads: 1, lastSyncedAt: "2026-10-09" }],
				});
			if (path === "/machines/old-machine-1/threads")
				return Response.json({
					data: [
						{
							id: "t-old",
							workspaceId: WORKSPACE,
							project: "kestrel-app",
							ownerId: "maya",
							provider: "codex",
							title: "Round drive times",
							model: null,
							mode: null,
							effort: null,
							createdAt: "2026-10-09T08:00:00.000Z",
							updatedAt: "2026-10-09T08:05:00.000Z",
						},
					],
				});
			if (path === "/threads/t-old/events")
				return Response.json({
					data: [
						{ seq: 1, data: { type: "message", text: "Round them" } },
						{ seq: 2, data: { type: "turn_end", reason: "done" } },
					],
				});
			if (path === "/threads/t-old/attachments")
				return Response.json({
					data: [{ id: "a1", name: "shot.png", size: 3, mimeType: "image/png" }],
				});
			if (path === "/threads/t-old/attachments/a1")
				return Response.json({ data: { data: Buffer.from("png").toString("base64") } });
			if (path === "/machines/old-machine-1/claim") return Response.json({ data: { moved: 1 } });
			return new Response("no", { status: 404 });
		}) as unknown as typeof fetch;
		const env = { RUNNER_CHAT_DB: path, GRID_API_URL: "http://api", GRID_RUNNER_KEY: "k" };
		const lines: string[] = [];

		expect(await restore([], env, fetcher, (line) => lines.push(line))).toBe(0);
		expect(lines.join("\n")).toContain("old-machine-1  laptop · 1 threads");

		expect(await restore(["old-machine"], env, fetcher, (line) => lines.push(line))).toBe(0);
		expect(calls).toContain("POST /machines/old-machine-1/claim");
		const back = new ChatStore(path);
		expect(back.get("t-old")).toMatchObject({ title: "Round drive times", resumeToken: null });
		expect(back.events("t-old")).toEqual([
			{ type: "message", text: "Round them" },
			{ type: "turn_end", reason: "done" },
		]);
		const file = back.attachment("t-old", "a1");
		expect(file?.name).toBe("shot.png");
		expect(file && back.attachmentFiles.read("t-old", file).bytes.toString()).toBe("png");
		back.close();

		// Already here: a second restore imports nothing, and nothing is sent again by the sync.
		expect(await restore(["old-machine-1"], env, fetcher, (line) => lines.push(line))).toBe(0);
		expect(lines.at(-1)).toContain("Restored 0 of 1");
	});
});
