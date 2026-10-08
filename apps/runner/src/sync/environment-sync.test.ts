import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChatStore } from "../chat/store";
import { environmentToken, PairingStore } from "../environments/pairing";
import { syncExportRequest } from "../environments/sync-export";
import { type Environment, EnvironmentSync } from "./environment-sync";

const HOME_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
	const dir = mkdtempSync(join(tmpdir(), "grid-env-sync-"));
	dirs.push(dir);
	return dir;
};

/** A paired environment: its own runner database, paired with the home workspace. */
function environment() {
	const path = join(temp(), "chat.db");
	const store = new ChatStore(path);
	const pairing = new PairingStore(path);
	const paired = pairing.pair(pairing.newCode(), "Home Grid", HOME_WORKSPACE);
	if (!paired) throw new Error("pairing failed");
	const token = environmentToken(paired.peerId, paired.secret);
	let down = false;
	const fetcher = (async (url: string, init?: RequestInit) => {
		if (down) throw new Error("unreachable");
		return (
			syncExportRequest(new Request(url, init), new URL(url), pairing, store) ??
			new Response("no", { status: 404 })
		);
	}) as unknown as typeof fetch;
	const thread = (id: string, texts: string[], workspace = HOME_WORKSPACE) => {
		store.create({
			id,
			ownerId: HOME_WORKSPACE,
			workspaceId: workspace,
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
	};
	return { store, pairing, token, fetcher, thread, setDown: (value: boolean) => (down = value) };
}

/** The API's side, as in `thread-sync.test.ts`: events per thread, whole-from-the-start answers. */
function fakeApi() {
	const events = new Map<string, Map<number, unknown>>();
	const rounds: {
		machine: { id: string; name: string };
		threads: { id: string; workspaceId: string; events: { seq: number }[] }[];
		deleted: string[];
	}[] = [];
	const fetcher = (async (_url: string, init?: RequestInit) => {
		const round = JSON.parse(String(init?.body));
		rounds.push(round);
		const seqs: Record<string, number> = {};
		for (const thread of round.threads) {
			const kept = events.get(thread.id) ?? new Map();
			for (const event of thread.events) kept.set(event.seq, event.data);
			events.set(thread.id, kept);
			let whole = 0;
			while (kept.has(whole + 1)) whole++;
			seqs[thread.id] = whole;
		}
		for (const id of round.deleted) events.delete(id);
		return Response.json({ data: { seqs, skipped: [] } });
	}) as unknown as typeof fetch;
	return { fetcher, events, rounds };
}

describe("syncExportRequest", () => {
	it("answers only its paired Grid, and only with that workspace's threads", async () => {
		const env = environment();
		env.thread("mine", ["a", "b"]);
		env.thread("other-workspace", ["x"], "22222222-2222-4222-8222-222222222222");
		const get = (path: string, token = env.token, method = "GET") =>
			env.fetcher(`http://env${path}`, { method, headers: { authorization: `Bearer ${token}` } });

		const listed = (
			(await (await get("/sync/threads")).json()) as { data: { id: string; lastSeq: number }[] }
		).data;
		expect(
			listed.map((thread: { id: string; lastSeq: number }) => [thread.id, thread.lastSeq]),
		).toEqual([["mine", 2]]);
		const events = (
			(await (await get("/sync/threads/mine/events?after=1")).json()) as { data: unknown[] }
		).data;
		expect(events).toEqual([{ seq: 2, data: { type: "message", text: "b" } }]);
		expect((await get("/sync/threads/other-workspace/events")).status).toBe(404);
		expect((await get("/sync/threads", "grid-env.nope.nope")).status).toBe(401);
		expect((await get("/sync/threads", env.token, "POST")).status).toBe(405);
		env.store.close();
	});
});

describe("EnvironmentSync", () => {
	it("sends an environment's threads as its own machine, then only what is new, and deletions", async () => {
		const env = environment();
		const api = fakeApi();
		const environments = (): Environment[] => [
			{
				id: "env-1",
				workspaceId: HOME_WORKSPACE,
				label: "VPS",
				url: "http://env",
				token: env.token,
			},
		];
		const fetcher = (async (url: string, init?: RequestInit) =>
			url.startsWith("http://env")
				? env.fetcher(url, init)
				: api.fetcher(url, init)) as unknown as typeof fetch;
		const sync = new EnvironmentSync(
			join(temp(), "home.db"),
			environments,
			{ url: "http://api", key: "k" },
			fetcher,
		);

		env.thread("t1", ["a", "b"]);
		await sync.syncAll();
		expect(api.rounds[0]?.machine).toEqual({ id: "env-env-1", name: "VPS" });
		expect(api.rounds[0]?.threads[0]?.workspaceId).toBe(HOME_WORKSPACE);
		expect(api.events.get("t1")?.size).toBe(2);
		await sync.syncAll();
		expect(api.rounds).toHaveLength(1);

		env.store.append("t1", [{ type: "message", text: "c" }]);
		await sync.syncAll();
		expect(api.rounds.at(-1)?.threads[0]?.events.map((event) => event.seq)).toEqual([3]);

		// Unreachable: nothing is taken for deleted.
		env.setDown(true);
		await sync.syncAll();
		expect(api.rounds).toHaveLength(2);
		env.setDown(false);

		env.store.delete("t1");
		await sync.syncAll();
		expect(api.rounds.at(-1)?.deleted).toEqual(["t1"]);
		expect(api.events.has("t1")).toBe(false);
		sync.close();
		env.store.close();
	});
});
