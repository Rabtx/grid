import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const projectsDir = mkdtempSync(join(tmpdir(), "grid-server-projects-"));
const config = {
	...readConfig({ RUNNER_PROJECTS_DIR: projectsDir, RUNNER_CWD: projectsDir }),
	port: 0,
	shell: "/bin/sh",
};
const store = new TerminalStore(config, spawnPty);
const chatStore = new ChatStore(":memory:");
const server = startServer(
	config,
	store,
	async (token) =>
		token === "good" ? { who: { userId: "user-1", workspace: "ws-1" } } : signedOut,
	new ChatHub(chatStore, new Map(), projectsDir),
);
const base = `http://127.0.0.1:${server.port}`;
const auth = { Authorization: "Bearer good" };

afterAll(() => {
	store.closeAll();
	void server.stop(true);
	rmSync(projectsDir, { recursive: true, force: true });
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

	it("refuses an explicit terminal directory outside the projects root", async () => {
		const response = await fetch(`${base}/terminals`, {
			method: "POST",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: tmpdir() }),
		});
		expect(response.status).toBe(400);
	});
});

describe("the hello handshake", () => {
	// A verify slow enough that the next frame lands while it is still awaiting. Bun does not hold
	// a socket's next frame for its message handler's promise, so this is the real race: the
	// person who signs in and types at once, which is what a fast terminal does on its first tap.
	const slowProjects = mkdtempSync(join(tmpdir(), "grid-hello-projects-"));
	const slowConfig = {
		...readConfig({ RUNNER_PROJECTS_DIR: slowProjects, RUNNER_CWD: slowProjects }),
		port: 0,
		shell: "/bin/sh",
	};
	const slowStore = new TerminalStore(slowConfig, spawnPty);
	const slow = startServer(
		slowConfig,
		slowStore,
		async (token) => {
			await new Promise((resolve) => setTimeout(resolve, 60));
			return token === "good" ? { who: { userId: "user-1", workspace: "ws-1" } } : signedOut;
		},
		new ChatHub(new ChatStore(":memory:"), new Map(), slowProjects),
	);

	afterAll(() => {
		slowStore.closeAll();
		void slow.stop(true);
		rmSync(slowProjects, { recursive: true, force: true });
	});

	/** A terminal socket that keeps everything the terminal printed to it. */
	async function slowSocket(): Promise<{
		ws: WebSocket;
		closed: Promise<number>;
		text: () => string;
		id: string;
	}> {
		const response = await fetch(`http://127.0.0.1:${slow.port}/terminals`, {
			method: "POST",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ cols: 100, rows: 30 }),
		});
		expect(response.status).toBe(201);
		const id = ((await response.json()) as { data: { id: string } }).data.id;
		const ws = new WebSocket(`ws://127.0.0.1:${slow.port}/terminal`);
		ws.binaryType = "arraybuffer";
		const closed = new Promise<number>((resolve) =>
			ws.addEventListener("close", (event) => resolve(event.code)),
		);
		let seen = "";
		ws.addEventListener("message", (event) => {
			if (typeof event.data !== "string")
				seen += new TextDecoder().decode(event.data as ArrayBuffer);
		});
		await new Promise((resolve) => ws.addEventListener("open", resolve));
		return { ws, closed, text: () => seen, id };
	}

	const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

	it("keeps the socket when the first keystrokes arrive with the hello", async () => {
		const { ws, closed, text, id } = await slowSocket();
		// Both frames go out before either is handled. The second is terminal input, not a hello,
		// and used to reach the handshake, which answered an ordinary keystroke by closing the
		// socket: the terminal was gone before the person had seen a prompt.
		ws.send(JSON.stringify({ t: "hello", token: "good", id, cols: 100, rows: 30 }));
		ws.send(JSON.stringify({ t: "input", d: "echo typed-right-after-hello\r" }));
		await waitForOutput(ws, "typed-right-after-hello");
		expect(occurrences(text(), "typed-right-after-hello")).toBe(1);
		ws.close();
		expect(await closed).not.toBe(CLOSE_UNAUTHORIZED);
	});

	it("attaches one channel when the hello is sent twice at once", async () => {
		const { ws, text, id } = await slowSocket();
		ws.send(JSON.stringify({ t: "hello", token: "good", id }));
		ws.send(JSON.stringify({ t: "hello", token: "good", id }));
		const printed = waitForOutput(ws, "attached-once");
		ws.send(JSON.stringify({ t: "input", d: "echo attached-once\r" }));
		await printed;
		// Two channels on the one socket each got the same output, and the first was never
		// detached, so it stayed attached to the terminal long after the socket was gone.
		expect(occurrences(text(), "attached-once")).toBe(1);
		ws.close();
	});

	it("still closes a socket that says hello with nothing to attach", async () => {
		const { ws, closed } = await slowSocket();
		ws.send(JSON.stringify({ t: "hello", token: "good", id: "no-such-terminal" }));
		expect(await closed).toBe(CLOSE_NOT_FOUND);
	});
});

describe("folders and project links", () => {
	it("scopes project files to the signed-in project's linked folder", async () => {
		const root = mkdtempSync(join(projectsDir, "grid-project-route-"));
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
		expect((await fetch(`${base}/projects/files/unlinked/search`, { headers: auth })).status).toBe(
			409,
		);
		const searchRes = await fetch(searchUrl, { headers: auth });
		expect(searchRes.status).toBe(200);
		const searchBody = (await searchRes.json()) as { data: string[] };
		expect(searchBody.data).toContain("notes.md");
	});

	it("saves a file onto the version that was read, and refuses a stale save", async () => {
		const root = mkdtempSync(join(projectsDir, "grid-write-route-"));
		await fetch(`${base}/projects/folders/demo`, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ path: root }),
		});
		writeFileSync(join(root, "notes.md"), "first");
		const contentUrl = `${base}/projects/files/demo/content`;
		const read = async () =>
			(
				(await (await fetch(`${contentUrl}?path=notes.md`, { headers: auth })).json()) as {
					data: { hash: string };
				}
			).data;
		const put = (body: unknown) =>
			fetch(contentUrl, {
				method: "PUT",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

		const first = await read();
		const saved = await put({ path: "notes.md", text: "second", base: first.hash });
		expect(saved.status).toBe(200);
		expect(readFileSync(join(root, "notes.md"), "utf8")).toBe("second");

		// The version read before the save is now stale, and is refused.
		const stale = await put({ path: "notes.md", text: "mine", base: first.hash });
		expect(stale.status).toBe(409);
		expect(readFileSync(join(root, "notes.md"), "utf8")).toBe("second");

		expect((await put({ path: "notes.md", text: "mine" })).status).toBe(400);
		expect(
			(await put({ path: "../escape.md", text: "mine", base: (await read()).hash })).status,
		).toBe(400);
		const escaped = await put({ path: "/tmp/escape.md", text: "mine", base: (await read()).hash });
		expect([400, 403, 404]).toContain(escaped.status);
		expect(existsSync("/tmp/escape.md")).toBe(false);

		// A body over the cap is refused before it is parsed, with or without a Content-Length.
		const huge = JSON.stringify({ path: "notes.md", text: "x".repeat(1024 * 1024), base: "" });
		expect((await put(JSON.parse(huge))).status).toBe(413);
		const streamed = await fetch(contentUrl, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: new Blob([huge]).stream(),
		});
		expect(streamed.status).toBe(413);
		expect(readFileSync(join(root, "notes.md"), "utf8")).toBe("second");
	});
	it("browses folders, reads a folder's details and links a project to it", async () => {
		const folder = mkdtempSync(join(projectsDir, "grid-folder-route-"));
		const encoded = encodeURIComponent(folder);
		const listing = (await (
			await fetch(`${base}/fs/folders?path=${encoded}`, { headers: auth })
		).json()) as {
			data: { path: string; folders: unknown[] };
		};
		expect(listing.data.path).toBe(folder);
		expect(Array.isArray(listing.data.folders)).toBe(true);

		const inspected = (await (
			await fetch(`${base}/fs/inspect?path=${encoded}`, { headers: auth })
		).json()) as {
			data: { name: string };
		};
		expect(inspected.data.name).toMatch(/^grid-folder-route-/);

		const linked = await fetch(`${base}/projects/folders/demo`, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ path: folder }),
		});
		expect(linked.status).toBe(204);
		const folders = (await (await fetch(`${base}/projects/folders`, { headers: auth })).json()) as {
			data: Record<string, string>;
		};
		expect(folders.data.demo).toBe(folder);

		expect(
			(await fetch(`${base}/fs/folders?path=${encodeURIComponent(tmpdir())}`, { headers: auth }))
				.status,
		).toBe(403);
		expect(
			(await fetch(`${base}/fs/inspect?path=${encodeURIComponent(tmpdir())}`, { headers: auth }))
				.status,
		).toBe(403);
		const outside = await fetch(`${base}/projects/folders/demo`, {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ path: tmpdir() }),
		});
		expect(outside.status).toBe(403);
	});

	it("lists the other folders when one is linked outside the projects folder", async () => {
		const inside = mkdtempSync(join(projectsDir, "kept-"));
		chatStore.setProjectFolder("ws-1", "kept", inside);
		// Linked before the projects folder was narrowed: left out, not a failure of the list.
		chatStore.setProjectFolder("ws-1", "stale", tmpdir());
		const response = await fetch(`${base}/projects/folders`, { headers: auth });
		expect(response.status).toBe(200);
		const folders = ((await response.json()) as { data: Record<string, string> }).data;
		expect(folders.kept).toBe(inside);
		expect(folders.stale).toBeUndefined();
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
