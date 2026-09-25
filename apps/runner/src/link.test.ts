import { afterAll, describe, expect, it } from "bun:test";

import { ChatHub } from "./chat/hub";
import { ChatStore } from "./chat/store";
import { readConfig } from "./config";
import { spawnPty } from "./pty";
import { startServer } from "./server";
import { TerminalStore } from "./terminals";

// A real runner with real shells; only sign-in is stubbed.
const config = { ...readConfig({}), port: 0, shell: "/bin/sh" };
const store = new TerminalStore(config, spawnPty);
const server = startServer(
	config,
	store,
	async (token) => (token === "good" ? "user-1" : null),
	new ChatHub(new ChatStore(":memory:"), new Map()),
);
const base = `http://127.0.0.1:${server.port}`;

afterAll(() => {
	store.closeAll();
	void server.stop(true);
});

async function openTerminal(): Promise<string> {
	const response = await fetch(`${base}/terminals`, {
		method: "POST",
		headers: { Authorization: "Bearer good", "Content-Type": "application/json" },
		body: JSON.stringify({ cols: 80, rows: 24 }),
	});
	return ((await response.json()) as { data: { id: string } }).data.id;
}

/** A link with a record of everything it received, by channel. */
async function link(token = "good") {
	const ws = new WebSocket(`ws://127.0.0.1:${server.port}/link`);
	ws.binaryType = "arraybuffer";
	const text: Record<string, unknown>[] = [];
	const bytes = new Map<number, string>();
	ws.addEventListener("message", (event) => {
		if (typeof event.data === "string") {
			text.push(JSON.parse(event.data) as Record<string, unknown>);
			return;
		}
		const view = new DataView(event.data as ArrayBuffer);
		const ch = view.getUint16(0);
		const chunk = new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer, 2));
		bytes.set(ch, (bytes.get(ch) ?? "") + chunk);
	});
	await new Promise((resolve) => ws.addEventListener("open", resolve));
	ws.send(JSON.stringify({ t: "hello", token }));
	return { ws, text, bytes };
}

function until(check: () => boolean, what: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const tick = () => {
			if (check()) resolve();
			else if (Date.now() - started > 5000) reject(new Error(`timed out waiting for ${what}`));
			else setTimeout(tick, 20);
		};
		tick();
	});
}

function framed(ch: number, text: string): Uint8Array {
	const body = new TextEncoder().encode(text);
	const out = new Uint8Array(body.byteLength + 2);
	new DataView(out.buffer).setUint16(0, ch);
	out.set(body, 2);
	return out;
}

describe("the link", () => {
	it("carries two terminals on one connection, each on its own channel", async () => {
		const [first, second] = [await openTerminal(), await openTerminal()];
		const { ws, text, bytes } = await link();
		await until(() => text.some((message) => message.t === "welcome"), "welcome");

		ws.send(JSON.stringify({ t: "open", ch: 1, kind: "terminal", id: first }));
		ws.send(JSON.stringify({ t: "open", ch: 2, kind: "terminal", id: second }));
		await until(
			() => text.filter((message) => message.t === "ready").length === 2,
			"both terminals ready",
		);
		expect(text.find((message) => message.t === "ready" && message.ch === 1)).toMatchObject({
			terminal: { id: first },
			resumed: false,
		});

		ws.send(framed(1, "echo one-$((1+0))\r"));
		ws.send(JSON.stringify({ t: "msg", ch: 2, m: { t: "input", d: "echo two-$((1+1))\r" } }));
		await until(() => (bytes.get(1) ?? "").includes("one-1"), "output on channel 1");
		await until(() => (bytes.get(2) ?? "").includes("two-2"), "output on channel 2");
		expect(bytes.get(1)).not.toContain("two-2");

		ws.send(JSON.stringify({ t: "ping" }));
		await until(() => text.some((message) => message.t === "pong"), "pong");
		ws.close();
	});

	it("catches a terminal up on a new link from the offset it had", async () => {
		const id = await openTerminal();
		const one = await link();
		await until(() => one.text.some((message) => message.t === "welcome"), "welcome");
		one.ws.send(JSON.stringify({ t: "open", ch: 7, kind: "terminal", id }));
		await until(() => one.text.some((message) => message.t === "ready"), "ready");
		one.ws.send(framed(7, "echo before-$((0+1))\r"));
		await until(() => (one.bytes.get(7) ?? "").includes("before-1"), "first output");
		const ready = one.text.find((message) => message.t === "ready") as { at: number };
		const had = ready.at + new TextEncoder().encode(one.bytes.get(7) ?? "").byteLength;
		one.ws.close();

		const two = await link();
		await until(() => two.text.some((message) => message.t === "welcome"), "welcome");
		two.ws.send(JSON.stringify({ t: "open", ch: 7, kind: "terminal", id, offset: had }));
		await until(() => two.text.some((message) => message.t === "ready"), "ready again");
		expect(two.text.find((message) => message.t === "ready")).toMatchObject({
			resumed: true,
			at: had,
		});
		expect(two.bytes.get(7) ?? "").not.toContain("before-1");
		two.ws.close();
	});

	it("says when a channel has nothing to attach, and refuses a bad sign-in", async () => {
		const { ws, text } = await link();
		await until(() => text.some((message) => message.t === "welcome"), "welcome");
		ws.send(JSON.stringify({ t: "open", ch: 3, kind: "chat", id: "no-such-chat" }));
		await until(() => text.some((message) => message.t === "closed"), "closed");
		expect(text.find((message) => message.t === "closed")).toMatchObject({ ch: 3, code: 4404 });
		ws.close();

		const refused = new WebSocket(`ws://127.0.0.1:${server.port}/link`);
		const code = new Promise<number>((resolve) =>
			refused.addEventListener("close", (event) => resolve(event.code)),
		);
		await new Promise((resolve) => refused.addEventListener("open", resolve));
		refused.send(JSON.stringify({ t: "hello", token: "bad" }));
		expect(await code).toBe(4401);
	});

	it("answers a plain request with 426, so the console can tell the link is there", async () => {
		expect((await fetch(`${base}/link`)).status).toBe(426);
	});
});
