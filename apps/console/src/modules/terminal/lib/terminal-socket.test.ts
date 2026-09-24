import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ConnectionState, connectTerminal } from "./terminal-socket";

/** A socket the test drives by hand: it records what the client sends. */
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
	// Test helpers
	accept(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}
	receive(data: string | ArrayBuffer): void {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
	drop(code = 1006): void {
		this.readyState = 3;
		this.dispatchEvent(new CloseEvent("close", { code }));
	}
	text(): string[] {
		return this.sent.map((item) =>
			typeof item === "string" ? item : new TextDecoder().decode(item),
		);
	}
}

function setup(renew: () => Promise<string | null> = async () => null) {
	const sockets: FakeSocket[] = [];
	const states: ConnectionState[] = [];
	const output: string[] = [];
	const events: string[] = [];
	let token = "t1";
	const terminal = connectTerminal({
		url: "ws://test/runner/terminal",
		id: "term-1",
		token: () => token,
		renew: async () => {
			const next = await renew();
			if (next) token = next;
			return next;
		},
		size: () => ({ cols: 90, rows: 30 }),
		onReset: () => events.push("reset"),
		onOutput: (bytes) => output.push(new TextDecoder().decode(bytes)),
		onState: (state) => states.push(state),
		onTitle: (title) => events.push(`title:${title}`),
		onExit: (code) => events.push(`exit:${code}`),
		createSocket: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket as unknown as WebSocket;
		},
		retryDelaysMs: [100, 500],
	});
	return { terminal, sockets, states, output, events };
}

const ready = JSON.stringify({ t: "ready", terminal: { id: "term-1" } });

describe("connectTerminal", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("says hello with the token, the terminal and its size, then streams output", () => {
		const { sockets, states, output, events } = setup();
		sockets[0].accept();
		expect(JSON.parse(sockets[0].text()[0])).toEqual({
			t: "hello",
			token: "t1",
			id: "term-1",
			cols: 90,
			rows: 30,
		});
		sockets[0].receive(ready);
		sockets[0].receive(new TextEncoder().encode("$ ").buffer);
		expect(states).toEqual(["connecting", "open"]);
		expect(events).toEqual(["reset"]);
		expect(output).toEqual(["$ "]);
	});

	it("keeps typing made while offline and sends it once reattached", () => {
		const { terminal, sockets } = setup();
		terminal.send("ls\r");
		sockets[0].accept();
		sockets[0].receive(ready);
		expect(sockets[0].text().at(-1)).toBe("ls\r");
	});

	it("reconnects with backoff after a drop, and resets the screen before the replay", () => {
		const { sockets, states, events } = setup();
		sockets[0].accept();
		sockets[0].receive(ready);
		sockets[0].drop();
		expect(states.at(-1)).toBe("reconnecting");
		expect(sockets).toHaveLength(1);

		vi.advanceTimersByTime(100);
		expect(sockets).toHaveLength(2);
		sockets[1].accept();
		sockets[1].receive(ready);
		expect(states.at(-1)).toBe("open");
		expect(events).toEqual(["reset", "reset"]);
	});

	it("reconnects at once when asked, without waiting out the backoff", () => {
		const { terminal, sockets } = setup();
		sockets[0].accept();
		sockets[0].drop();
		terminal.reconnectNow();
		expect(sockets).toHaveLength(2);
	});

	it("renews the token once when the runner refuses it, then tries again", async () => {
		const { sockets, states } = setup(async () => "t2");
		sockets[0].accept();
		sockets[0].drop(4401);
		await vi.waitFor(() => expect(sockets).toHaveLength(2));
		sockets[1].accept();
		expect(JSON.parse(sockets[1].text()[0]).token).toBe("t2");
		sockets[1].drop(4401);
		await vi.waitFor(() => expect(states.at(-1)).toBe("signed-out"));
	});

	it("stops for good when the terminal is gone or the shell exited", () => {
		const gone = setup();
		gone.sockets[0].accept();
		gone.sockets[0].drop(4404);
		vi.advanceTimersByTime(10_000);
		expect(gone.states.at(-1)).toBe("gone");
		expect(gone.sockets).toHaveLength(1);

		const exited = setup();
		exited.sockets[0].accept();
		exited.sockets[0].receive(ready);
		exited.sockets[0].receive(JSON.stringify({ t: "exit", code: 0 }));
		exited.sockets[0].drop();
		vi.advanceTimersByTime(10_000);
		expect(exited.states.at(-1)).toBe("exited");
		expect(exited.events).toContain("exit:0");
		expect(exited.sockets).toHaveLength(1);
	});
});
