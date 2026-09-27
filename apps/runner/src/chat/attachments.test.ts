import { afterEach, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentSession, Provider } from "../agents/provider";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_IMAGE_BLOCK_BYTES,
	MAX_SESSION_ATTACHMENTS,
} from "./attachments";
import { ChatHub } from "./hub";
import { chatRequest } from "./routes";
import { ChatStore } from "./store";

const png = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=",
	"base64",
);
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
});

function setup() {
	const root = mkdtempSync(join(tmpdir(), "grid-attachment-test-"));
	cleanup.push(() => rmSync(root, { recursive: true, force: true }));
	const store = new ChatStore(join(root, "data", "chat.db"));
	const prompts: Parameters<AgentSession["prompt"]>[] = [];
	const provider: Provider = {
		info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
		start: async () => ({
			prompt: async (...args) => {
				prompts.push(args);
				return { reason: "done" };
			},
			cancel() {},
			approve() {},
			close() {},
			setModel: async () => {},
			setMode: async () => {},
			setEffort: async () => {},
		}),
	};
	const hub = new ChatHub(store, new Map([["fake", provider]]), root);
	cleanup.push(() => {
		for (const row of store.list("team", "test")) hub.delete("team", row.id);
		store.close();
	});
	const who = { userId: "alice", workspace: "team" };
	const session = hub.create(who, { project: "test", provider: "fake", cwd: root });
	const request = (path = "", init: RequestInit = {}, workspace = "team") => {
		const url = new URL(`http://runner/chat/sessions/${session.id}/attachments${path}`);
		return chatRequest(new Request(url.toString(), init), url, { ...who, workspace }, hub);
	};
	return { root, store, hub, session, who, request, prompts };
}

it("uploads binary safely, sends image bytes and file paths, and replays to another device after restart", async () => {
	const { root, store, hub, session, request, prompts } = setup();
	const response = await request("?name=..%2F..%2Fcapture.png", { method: "POST", body: png });
	expect(response?.status).toBe(201);
	const { data: image } = (await response!.json()) as { data: import("./attachments").Attachment };
	expect(image).toMatchObject({ name: "capture.png", mimeType: "image/png", size: png.length });
	const text = hub.upload("team", session.id, "readme.txt", Buffer.from("hello"));
	const stored = hub.attachment("team", session.id, image.id);
	expect(stored.path.startsWith(join(root, "data", "attachments", session.id))).toBe(true);
	await hub.prompt("team", session.id, "Look", [image.id, text.id]);
	expect(prompts[0][0]).toContain(stored.path);
	expect(prompts[0][0]).toContain(hub.attachment("team", session.id, text.id).path);
	expect(prompts[0][1]).toEqual([{ mimeType: "image/png", data: png.toString("base64") }]);
	const otherStore = new ChatStore(join(root, "data", "chat.db"));
	cleanup.push(() => otherStore.close());
	const otherHub = new ChatHub(otherStore, new Map(), root);

	const replay = otherHub.attach("team", session.id, { event() {}, state() {} });
	expect(replay.history[0]).toEqual({ type: "user", text: "Look", attachments: [image, text] });
	expect(otherHub.attachment("team", session.id, image.id).bytes).toEqual(png);
	const download = await request(`/${image.id}`);
	expect(download?.headers.get("content-type")).toBe("image/png");
	expect(download?.headers.get("x-content-type-options")).toBe("nosniff");
	expect(Buffer.from(await download!.arrayBuffer())).toEqual(png);
	hub.delete("team", session.id);
	expect(existsSync(stored.path)).toBe(false);
	expect(store.attachment(session.id, image.id)).toBeNull();
});

it("rejects wrong workspace, cross-thread and unknown ids before recording a turn", async () => {
	const { hub, session, request, store, who, root } = setup();
	expect((await request("", { method: "POST", body: "no" }, "other"))?.status).toBe(404);
	const other = hub.create(who, { project: "test", provider: "fake", cwd: root });
	const file = hub.upload("team", other.id, "file.txt", Buffer.from("private"));
	for (const ids of [
		[file.id],
		["unknown"],
		["../escape"],
		[1],
		"invalid",
		Array(21).fill(file.id),
	]) {
		await expect(hub.prompt("team", session.id, "look", ids)).rejects.toThrow();
	}
	expect(store.events(session.id)).toEqual([]);
	expect((await request(`/${file.id}`))?.status).toBe(404);
});

it("enforces the exact size limit even for streamed bodies and treats active formats as downloads", async () => {
	const { request, hub, session } = setup();
	expect(
		(await request("", { method: "POST", body: new Uint8Array(MAX_ATTACHMENT_BYTES) }))?.status,
	).toBe(201);
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES));
			controller.enqueue(new Uint8Array(1));
			controller.close();
		},
	});
	expect((await request("", { method: "POST", body }))?.status).toBe(413);
	const svg = hub.upload("team", session.id, "evil.svg", Buffer.from('<svg onload="alert(1)"/>'));
	const response = await request(`/${svg.id}`);
	expect(response?.headers.get("content-type")).toBe("application/octet-stream");
	expect(response?.headers.get("content-disposition")).toStartWith("attachment;");
});

it("accepts attachment-only turns, twenty files, and refuses symlink substitution", async () => {
	const { hub, session, store } = setup();
	const files = Array.from({ length: 20 }, (_, i) =>
		hub.upload("team", session.id, `${i}.txt`, Buffer.from("ok")),
	);
	await hub.prompt(
		"team",
		session.id,
		"",
		files.map((file) => file.id),
	);
	expect(store.events(session.id)[0]).toMatchObject({ type: "user", text: "", attachments: files });
	const first = hub.attachment("team", session.id, files[0].id);
	unlinkSync(first.path);
	symlinkSync(hub.attachment("team", session.id, files[1].id).path, first.path);
	expect(() => hub.attachment("team", session.id, files[0].id)).toThrow("no longer available");
});

it("keeps the file's extension on disk, and only a safe one", () => {
	const { hub, session } = setup();
	const pdf = hub.upload("team", session.id, "Report.PDF", Buffer.from("%PDF"));
	expect(hub.attachment("team", session.id, pdf.id).path).toEndWith(`${pdf.id}.pdf`);
	const odd = hub.upload("team", session.id, "notes.t x/t", Buffer.from("x"));
	expect(hub.attachment("team", session.id, odd.id).path).toEndWith(odd.id);
});

it("sends an image inline only when a model accepts its size; larger ones go by path", async () => {
	const { hub, session, prompts } = setup();
	const large = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BLOCK_BYTES)]);
	const big = hub.upload("team", session.id, "big.png", large);
	const small = hub.upload("team", session.id, "small.png", png);
	await hub.prompt("team", session.id, "Look", [big.id, small.id]);
	expect(big.mimeType).toBe("image/png");
	expect(prompts[0][0]).toContain(hub.attachment("team", session.id, big.id).path);
	expect(prompts[0][1]).toEqual([{ mimeType: "image/png", data: png.toString("base64") }]);
});

it("caps how many files one thread keeps", () => {
	const { hub, session } = setup();
	for (let i = 0; i < MAX_SESSION_ATTACHMENTS; i++)
		hub.upload("team", session.id, `${i}.txt`, Buffer.from("x"));
	expect(() => hub.upload("team", session.id, "one-more.txt", Buffer.from("x"))).toThrow(
		"as many files",
	);
});

it("relays uploads to the project's runner and preserves safe download headers", async () => {
	const { readConfig } = await import("../config");
	const { startServer } = await import("../server");
	const { TerminalStore } = await import("../terminals");
	const { spawnPty } = await import("../pty");
	const { PairingStore, isEnvironmentToken } = await import("../environments/pairing");
	const { EnvironmentStore } = await import("../environments/registry");
	const { signedOut } = await import("../auth");
	const config = { ...readConfig({}), port: 0 };
	const pairing = new PairingStore(":memory:");
	const remoteStore = new ChatStore(":memory:");
	const remoteHub = new ChatHub(
		remoteStore,
		new Map([
			[
				"fake",
				{
					info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
					start: async () => {
						throw new Error("unused");
					},
				},
			],
		]),
		"/tmp",
	);
	const remoteTerminal = new TerminalStore(config, spawnPty);
	const remote = startServer(
		config,
		remoteTerminal,
		async (token) => {
			const key = isEnvironmentToken(token) ? pairing.verify(token) : null;
			return key ? { who: { userId: key, workspace: key } } : signedOut;
		},
		remoteHub,
		{ pairing },
	);
	const homeTerminal = new TerminalStore(config, spawnPty);
	const homeChatStore = new ChatStore(":memory:");
	const home = startServer(
		config,
		homeTerminal,
		async (token) =>
			token === "alice" ? { who: { userId: "alice", workspace: "team" } } : signedOut,
		new ChatHub(homeChatStore, new Map()),
		{ environments: { store: new EnvironmentStore(":memory:"), checkUrl: (raw) => new URL(raw) } },
	);
	try {
		const remoteUrl = `http://127.0.0.1:${remote.port}`;
		const homeUrl = `http://127.0.0.1:${home.port}`;
		const paired = await fetch(`${homeUrl}/environments`, {
			method: "POST",
			headers: { Authorization: "Bearer alice", "Content-Type": "application/json" },
			body: JSON.stringify({ url: remoteUrl, code: pairing.newCode(), label: "Test runner" }),
		});
		expect(paired.status).toBe(201);
		const {
			data: { id: environmentId },
		} = (await paired.json()) as { data: { id: string } };
		const session = remoteHub.create(
			{ userId: "alice", workspace: "team" },
			{ project: "test", provider: "fake", cwd: "/tmp" },
		);
		const path = `${homeUrl}/env/${environmentId}/chat/sessions/${session.id}/attachments`;
		const uploaded = await fetch(`${path}?name=${encodeURIComponent("remote.png")}`, {
			method: "POST",
			headers: { Authorization: "Bearer alice", "Content-Type": "application/octet-stream" },
			body: png,
		});
		expect(uploaded.status).toBe(201);
		const { data: file } = (await uploaded.json()) as { data: { id: string; name: string } };
		expect(file.name).toBe("remote.png");
		const download = await fetch(`${path}/${file.id}`, {
			headers: { Authorization: "Bearer alice" },
		});
		expect(download.status).toBe(200);
		expect(download.headers.get("Content-Type")).toBe("image/png");
		expect(download.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(Buffer.from(await download.arrayBuffer())).toEqual(png);
		// A download that is not an image keeps its name through the relay.
		const notes = remoteHub.upload("team", session.id, "notes.txt", Buffer.from("hi"));
		const saved = await fetch(`${path}/${notes.id}`, {
			headers: { Authorization: "Bearer alice" },
		});
		expect(saved.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(saved.headers.get("Content-Disposition")).toBe("attachment; filename*=UTF-8''notes.txt");
		expect(saved.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(saved.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
		expect((await fetch(`${path}/${file.id}`)).status).toBe(401);
	} finally {
		remoteTerminal.closeAll();
		homeTerminal.closeAll();
		await remote.stop(true);
		await home.stop(true);
		remoteStore.close();
		homeChatStore.close();
	}
});
