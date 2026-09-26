import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConfig } from "./config";
import { signedOut } from "./auth";
import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { spawnPty } from "./pty";
import { CLOSE_NOT_FOUND, CLOSE_UNAUTHORIZED, startServer } from "./server";
import { TerminalStore } from "./terminals";

// A real shell on a real PTY behind the real server; only sign-in is stubbed.
const config = { ...readConfig({}), port: 0, shell: "/bin/sh" };
const store = new TerminalStore(config, spawnPty);
const server = startServer(
	config,
	store,
	async (token) =>
		token === "good" ? { who: { userId: "user-1", workspace: "ws-1" } } : signedOut,
	new ChatHub(new ChatStore(":memory:"), new Map()),
);
const base = `http://127.0.0.1:${server.port}`;
const auth = { Authorization: "Bearer good" };

afterAll(() => {
	store.closeAll();
	void server.stop(true);
});

async function openTerminal(): Promise<string> {
	const response = await fetch(`${base}/terminals`, {
		method: "POST",
		headers: { ...auth, "Content-Type": "application/json" },
		body: JSON.stringify({ cols: 100, rows: 30 }),
	});
	expect(response.status).toBe(201);
	return ((await response.json()) as { data: { id: string } }).data.id;
}

function socket(): WebSocket {
	const ws = new WebSocket(`ws://127.0.0.1:${server.port}/terminal`);
	ws.binaryType = "arraybuffer";
	return ws;
}

/** Collect the terminal's output until it contains `needle`. */
function waitForOutput(ws: WebSocket, needle: string): Promise<string> {
	return new Promise((resolve, reject) => {
		let seen = "";
		const timer = setTimeout(() => reject(new Error(`no "${needle}" in: ${seen}`)), 5000);
		ws.addEventListener("message", (event) => {
			if (typeof event.data === "string") return;
			seen += new TextDecoder().decode(event.data as ArrayBuffer);
			if (seen.includes(needle)) {
				clearTimeout(timer);
				resolve(seen);
			}
		});
	});
}

function closeCode(ws: WebSocket): Promise<number> {
	return new Promise((resolve) => ws.addEventListener("close", (event) => resolve(event.code)));
}

describe("runner server", () => {
	it("rejects unknown interactive CLIs and Freebuff without a workspace folder", async () => {
		const create = (body: object) =>
			fetch(`${base}/terminals`, {
				method: "POST",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		expect((await create({ provider: "unknown", cwd: import.meta.dir })).status).toBe(400);
		expect((await create({ provider: "freebuff" })).status).toBe(400);
	});

	it("refuses to list terminals without a valid token", async () => {
		expect((await fetch(`${base}/terminals`)).status).toBe(401);
		expect(
			(await fetch(`${base}/terminals`, { headers: { Authorization: "Bearer bad" } })).status,
		).toBe(401);
	});

	it("runs a command in a real shell and streams the output", async () => {
		const id = await openTerminal();
		const ws = socket();
		await new Promise((resolve) => ws.addEventListener("open", resolve));
		ws.send(JSON.stringify({ t: "hello", token: "good", id, cols: 100, rows: 30 }));
		const output = waitForOutput(ws, "grid-says-hi");
		ws.send(new TextEncoder().encode("echo grid-says-$((1+0))hi | sed s/1//\r"));
		expect(await output).toContain("grid-says-hi");
		ws.close();
	});

	it("replays what a terminal printed to a socket that reconnects", async () => {
		const id = await openTerminal();
		const first = socket();
		await new Promise((resolve) => first.addEventListener("open", resolve));
		first.send(JSON.stringify({ t: "hello", token: "good", id }));
		const printed = waitForOutput(first, "before-reconnect");
		first.send(JSON.stringify({ t: "input", d: "echo before-reconnect\r" }));
		await printed;
		first.close();

		const second = socket();
		const replayed = waitForOutput(second, "before-reconnect");
		await new Promise((resolve) => second.addEventListener("open", resolve));
		second.send(JSON.stringify({ t: "hello", token: "good", id }));
		expect(await replayed).toContain("before-reconnect");
		second.close();
	});

	it("closes the socket with a code the console can act on", async () => {
		const unsigned = socket();
		const unauthorized = closeCode(unsigned);
		await new Promise((resolve) => unsigned.addEventListener("open", resolve));
		unsigned.send(JSON.stringify({ t: "hello", token: "bad", id: "x" }));
		expect(await unauthorized).toBe(CLOSE_UNAUTHORIZED);

		const missing = socket();
		const notFound = closeCode(missing);
		await new Promise((resolve) => missing.addEventListener("open", resolve));
		missing.send(JSON.stringify({ t: "hello", token: "good", id: "no-such-terminal" }));
		expect(await notFound).toBe(CLOSE_NOT_FOUND);
	});

	it("ends the shell when the terminal is closed", async () => {
		const id = await openTerminal();
		const response = await fetch(`${base}/terminals/${id}`, { method: "DELETE", headers: auth });
		expect(response.status).toBe(204);
		const list = (await (await fetch(`${base}/terminals`, { headers: auth })).json()) as {
			data: { id: string }[];
		};
		expect(list.data.some((terminal) => terminal.id === id)).toBe(false);
	});
});

describe("folders and project links", () => {
	it("scopes project files to the signed-in project's linked folder", async () => {
		const root = mkdtempSync(join(tmpdir(), "grid-project-route-"));
		try {
			const url = `${base}/projects/files/demo`;
			expect((await fetch(url)).status).toBe(401);
			expect((await fetch(url, { headers: auth })).status).toBe(409);
			await fetch(`${base}/projects/folders/demo`, {
				method: "PUT",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify({ path: root }),
			});
			const made = await fetch(url, {
				method: "POST",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify({ path: "", name: "notes.md", kind: "file" }),
			});
			expect(made.status).toBe(201);
			const listing = (await (await fetch(url, { headers: auth })).json()) as {
				data: { entries: { name: string }[] };
			};
			expect(listing.data.entries.map((entry) => entry.name)).toContain("notes.md");
			expect((await fetch(`${url}?path=..`, { headers: auth })).status).toBe(400);

			const searchUrl = `${url}/search?q=notes`;
			expect((await fetch(searchUrl)).status).toBe(401);
			expect(
				(await fetch(`${base}/projects/files/unlinked/search`, { headers: auth })).status,
			).toBe(409);
			const searchRes = await fetch(searchUrl, { headers: auth });
			expect(searchRes.status).toBe(200);
			const searchBody = (await searchRes.json()) as { data: string[] };
			expect(searchBody.data).toContain("notes.md");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
	it("browses folders, reads a folder's details and links a project to it", async () => {
		const listing = (await (
			await fetch(`${base}/fs/folders?path=/tmp`, { headers: auth })
		).json()) as {
			data: { path: string; folders: unknown[] };
		};
		expect(listing.data.path).toBe("/tmp");
		expect(Array.isArray(listing.data.folders)).toBe(true);

		const inspected = (await (
			await fetch(`${base}/fs/inspect?path=/tmp`, { headers: auth })
		).json()) as {
			data: { name: string };
		};
		expect(inspected.data.name).toBe("tmp");

		const linked = await fetch(`${base}/projects/folders/demo`, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ path: "/tmp" }),
		});
		expect(linked.status).toBe(204);
		const folders = (await (await fetch(`${base}/projects/folders`, { headers: auth })).json()) as {
			data: Record<string, string>;
		};
		expect(folders.data.demo).toBe("/tmp");
	});

	it("refuses without sign-in, and refuses a folder that does not exist", async () => {
		expect((await fetch(`${base}/fs/folders`)).status).toBe(401);
		const missing = await fetch(`${base}/projects/folders/demo`, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ path: "/no/such/folder" }),
		});
		expect(missing.status).toBe(400);
	});

	it("returns health status with startedAt timestamp", async () => {
		const res = await fetch(`${base}/health`);
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; startedAt: number };
		expect(json.ok).toBe(true);
		expect(typeof json.startedAt).toBe("number");
		expect(json.startedAt).toBeGreaterThan(0);
	});

	it("responds to websocket ping with pong", async () => {
		const id = await openTerminal();
		const ws = socket();
		await new Promise((resolve) => ws.addEventListener("open", resolve));
		ws.send(JSON.stringify({ t: "hello", token: "good", id }));

		const pongReceived = new Promise<string>((resolve) => {
			ws.addEventListener("message", (event) => {
				if (typeof event.data === "string" && event.data.includes("pong")) {
					resolve(event.data);
				}
			});
		});

		ws.send(JSON.stringify({ t: "ping" }));
		const pong = await pongReceived;
		expect(JSON.parse(pong)).toEqual({ t: "pong" });
		ws.close();
	});
});
