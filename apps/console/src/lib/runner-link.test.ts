import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunnerLink, type SocketLike } from "./runner-link";

/** A WebSocket driven by hand: records what is sent and dispatches what "arrives". */
class FakeSocket extends EventTarget {
	readyState = 0;
	binaryType = "blob";
	sent: (string | Uint8Array)[] = [];
	constructor(readonly url: string) {
		super();
	}
	send(data: string | Uint8Array): void {
		this.sent.push(data);
	}
	close(): void {
		this.readyState = 3;
	}
	accept(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
	receive(data: string | ArrayBuffer): void {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
	drop(code = 1006): void {
		this.readyState = 3;
		this.dispatchEvent(Object.assign(new Event("close"), { code }));
	}
	texts(): Record<string, unknown>[] {
		return this.sent
			.filter((item): item is string => typeof item === "string")
			.map((item) => JSON.parse(item));
	}
}

function setup(status = 426) {
	const sockets: FakeSocket[] = [];
	const link = new RunnerLink({
		base: "https://grid.test/runner",
		token: () => "tok",
		createSocket: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket as unknown as WebSocket;
		},
		fetcher: (async () => new Response(null, { status })) as unknown as typeof fetch,
		probeTimeoutMs: 1_000,
	});
	return { link, sockets };
}

/** A consumer of one linked socket, recording what it sees. */
function consumer(socket: SocketLike) {
	const seen = { open: 0, messages: [] as (string | ArrayBuffer)[], closes: [] as number[] };
	socket.addEventListener("open", () => seen.open++);
	socket.addEventListener("message", (event) => seen.messages.push((event as MessageEvent).data));
	socket.addEventListener("close", (event) => seen.closes.push((event as CloseEvent).code));
	return seen;
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("RunnerLink", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("carries several chats and terminals on one connection, each on its own channel", async () => {
		const { link, sockets } = setup();
		const chat = link.socket("chat", "wss://grid.test/runner/chat");
		const terminal = link.socket("terminal", "wss://grid.test/runner/terminal");
		const chatSeen = consumer(chat);
		const terminalSeen = consumer(terminal);
		await flush();

		expect(sockets).toHaveLength(1);
		expect(sockets[0].url).toBe("wss://grid.test/runner/link");
		sockets[0].accept();
		expect(sockets[0].texts()[0]).toEqual({ t: "hello", token: "tok" });
		sockets[0].receive(JSON.stringify({ t: "welcome" }));
		expect([chatSeen.open, terminalSeen.open]).toEqual([1, 1]);

		chat.send(
			JSON.stringify({ t: "hello", token: "tok", id: "c1", resume: { epoch: "e", next: 4 } }),
		);
		terminal.send(JSON.stringify({ t: "hello", token: "tok", id: "t1", offset: 10 }));
		expect(sockets[0].texts().slice(1)).toEqual([
			{ t: "open", ch: 1, kind: "chat", id: "c1", resume: { epoch: "e", next: 4 } },
			{ t: "open", ch: 2, kind: "terminal", id: "t1", offset: 10 },
		]);

		sockets[0].receive(JSON.stringify({ t: "ready", ch: 1, session: {} }));
		const bytes = new Uint8Array([0, 2, 104, 105]).buffer;
		sockets[0].receive(bytes);
		expect(JSON.parse(chatSeen.messages[0] as string).t).toBe("ready");
		expect(new TextDecoder().decode(terminalSeen.messages[0] as ArrayBuffer)).toBe("hi");

		terminal.send(new TextEncoder().encode("ls"));
		expect([...(sockets[0].sent.at(-1) as Uint8Array)]).toEqual([0, 2, 108, 115]);
		chat.send(JSON.stringify({ t: "prompt", text: "go" }));
		expect(sockets[0].texts().at(-1)).toEqual({ t: "msg", ch: 1, m: { t: "prompt", text: "go" } });
	});

	it("pings the connection once however many ask, and answers each", async () => {
		const { link, sockets } = setup();
		const a = link.socket("chat", "x");
		const b = link.socket("terminal", "y");
		const aSeen = consumer(a);
		const bSeen = consumer(b);
		await flush();
		sockets[0].accept();
		sockets[0].receive(JSON.stringify({ t: "welcome" }));

		a.send(JSON.stringify({ t: "ping" }));
		b.send(JSON.stringify({ t: "ping" }));
		expect(sockets[0].texts().filter((message) => message.t === "ping")).toHaveLength(1);
		sockets[0].receive(JSON.stringify({ t: "pong" }));
		expect(aSeen.messages).toEqual([JSON.stringify({ t: "pong" })]);
		expect(bSeen.messages).toEqual([JSON.stringify({ t: "pong" })]);
	});

	it("drops everything on it when the connection stops answering, so each reconnects", async () => {
		const { link, sockets } = setup();
		const a = link.socket("chat", "x");
		const aSeen = consumer(a);
		await flush();
		sockets[0].accept();
		sockets[0].receive(JSON.stringify({ t: "welcome" }));
		a.send(JSON.stringify({ t: "ping" }));
		await vi.advanceTimersByTimeAsync(1_000);
		expect(aSeen.closes).toEqual([1006]);

		// The next socket opens a fresh connection.
		link.socket("chat", "x");
		await flush();
		expect(sockets).toHaveLength(2);
	});

	it("passes a refused sign-in on, and a channel the runner closed", async () => {
		const { link, sockets } = setup();
		const a = link.socket("chat", "x");
		const b = link.socket("chat", "x");
		const aSeen = consumer(a);
		const bSeen = consumer(b);
		await flush();
		sockets[0].accept();
		sockets[0].receive(JSON.stringify({ t: "welcome" }));
		sockets[0].receive(JSON.stringify({ t: "closed", ch: 1, code: 4404, reason: "gone" }));
		expect(aSeen.closes).toEqual([4404]);
		expect(bSeen.closes).toEqual([]);
		sockets[0].drop(4401);
		expect(bSeen.closes).toEqual([4401]);
	});

	it("falls back to a socket per chat and terminal on a runner without the link", async () => {
		const { link, sockets } = setup(404);
		const chat = link.socket("chat", "wss://old.test/runner/chat");
		const seen = consumer(chat);
		await flush();
		expect(sockets.map((socket) => socket.url)).toEqual(["wss://old.test/runner/chat"]);
		sockets[0].accept();
		expect(seen.open).toBe(1);
		chat.send(JSON.stringify({ t: "hello", token: "tok", id: "c1" }));
		expect(sockets[0].texts()[0]).toEqual({ t: "hello", token: "tok", id: "c1" });
	});
});
