import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ChatConnection, connectChat } from "./chat-socket";
import type { ChatEvent, ChatSession } from "../types/chat.types";

/** A socket driven by hand in tests: records outgoing messages and dispatches events. */
class FakeSocket extends EventTarget {
	readyState = 0;
	sent: string[] = [];

	constructor(readonly url: string) {
		super();
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = 3;
	}

	accept(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	receive(data: string): void {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}

	drop(code = 1006): void {
		this.readyState = 3;
		this.dispatchEvent(Object.assign(new Event("close"), { code }));
	}
}

const mockSession: ChatSession = {
	id: "chat-1",
	project: "grid",
	provider: "opencode",
	title: "Test Chat",
	cwd: "/home/user/project",
	model: "gpt-4o",
	mode: null,
	effort: null,
	createdAt: "2026-09-25T00:00:00.000Z",
	updatedAt: "2026-09-25T00:00:00.000Z",
};

function setup(renew: () => Promise<string | null> = async () => null) {
	const sockets: FakeSocket[] = [];
	const states: ChatConnection[] = [];
	const readyPayloads: { session: ChatSession; history: ChatEvent[]; running: boolean }[] = [];
	const events: ChatEvent[] = [];
	const runningStates: boolean[] = [];
	const errors: string[] = [];
	let token = "token-1";

	const live = connectChat({
		url: "ws://test/runner/chat",
		id: "chat-1",
		token: () => token,
		renew: async () => {
			const next = await renew();
			if (next) token = next;
			return next;
		},
		onReady: (ready) => readyPayloads.push(ready),
		onEvent: (event) => events.push(event),
		onRunning: (running) => runningStates.push(running),
		onConnection: (state) => states.push(state),
		onError: (err) => errors.push(err),
		createSocket: (url) => {
			const socket = new FakeSocket(url);
			sockets.push(socket);
			return socket as unknown as WebSocket;
		},
		retryDelaysMs: [100, 500],
	});

	return { live, sockets, states, readyPayloads, events, runningStates, errors };
}

describe("connectChat", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("connects and sends hello, then processes ready and replay", () => {
		const { sockets, states, readyPayloads } = setup();
		expect(sockets).toHaveLength(1);
		expect(states).toEqual(["connecting"]);

		sockets[0].accept();
		expect(JSON.parse(sockets[0].sent[0])).toEqual({
			t: "hello",
			token: "token-1",
			id: "chat-1",
		});

		const readyMsg = {
			t: "ready",
			session: mockSession,
			history: [{ type: "user", text: "hello" }],
			running: false,
		};
		sockets[0].receive(JSON.stringify(readyMsg));

		expect(states).toEqual(["connecting", "open"]);
		expect(readyPayloads).toHaveLength(1);
		expect(readyPayloads[0].session.id).toBe("chat-1");
		expect(readyPayloads[0].history).toHaveLength(1);
	});

	it("reconnects after socket drop (1006) and re-receives ready replay", () => {
		const { sockets, states, readyPayloads } = setup();
		sockets[0].accept();
		sockets[0].receive(
			JSON.stringify({
				t: "ready",
				session: mockSession,
				history: [],
				running: false,
			}),
		);
		expect(states.at(-1)).toBe("open");

		// Simulate runner dying / network drop
		sockets[0].drop(1006);
		expect(states.at(-1)).toBe("reconnecting");
		expect(sockets).toHaveLength(1);

		// Backoff timer fires
		vi.advanceTimersByTime(100);
		expect(sockets).toHaveLength(2);

		// Reconnected socket accepts and gets fresh ready replay
		sockets[1].accept();
		expect(JSON.parse(sockets[1].sent[0])).toEqual({
			t: "hello",
			token: "token-1",
			id: "chat-1",
		});

		sockets[1].receive(
			JSON.stringify({
				t: "ready",
				session: mockSession,
				history: [
					{ type: "user", text: "message 1" },
					{ type: "assistant", text: "response 1" },
				],
				running: false,
			}),
		);

		expect(states.at(-1)).toBe("open");
		expect(readyPayloads).toHaveLength(2);
		expect(readyPayloads[1].history).toHaveLength(2);
	});

	it("reconnects immediately without waiting for backoff when reconnectNow is called", () => {
		const { live, sockets, states } = setup();
		sockets[0].accept();
		sockets[0].drop(1006);
		expect(states.at(-1)).toBe("reconnecting");
		expect(sockets).toHaveLength(1);

		live.reconnectNow();
		expect(sockets).toHaveLength(2);
	});

	it("sends heartbeat ping every 20s and ignores pong", () => {
		const { sockets } = setup();
		sockets[0].accept();
		sockets[0].receive(
			JSON.stringify({
				t: "ready",
				session: mockSession,
				history: [],
				running: false,
			}),
		);

		vi.advanceTimersByTime(20_000);
		expect(sockets[0].sent).toContain(JSON.stringify({ t: "ping" }));

		// Receiving pong does not error or trigger unhandled messages
		sockets[0].receive(JSON.stringify({ t: "pong" }));
	});

	it("keeps a live socket when the app comes back and it still answers", () => {
		const { live, sockets } = setup();
		sockets[0].accept();
		sockets[0].receive(
			JSON.stringify({ t: "ready", session: mockSession, history: [], running: false }),
		);

		vi.advanceTimersByTime(1);
		live.reconnectNow();
		expect(sockets[0].sent.at(-1)).toBe(JSON.stringify({ t: "ping" }));
		vi.advanceTimersByTime(100);
		sockets[0].receive(JSON.stringify({ t: "pong" }));
		vi.advanceTimersByTime(5_000);
		expect(sockets).toHaveLength(1);
	});

	it("replaces a socket that looks open but stays silent after the app slept", () => {
		const { live, sockets, readyPayloads } = setup();
		sockets[0].accept();
		sockets[0].receive(
			JSON.stringify({ t: "ready", session: mockSession, history: [], running: false }),
		);

		vi.advanceTimersByTime(1);
		live.reconnectNow();
		vi.advanceTimersByTime(3_000);
		expect(sockets).toHaveLength(2);
		sockets[1].accept();
		sockets[1].receive(
			JSON.stringify({ t: "ready", session: mockSession, history: [], running: false }),
		);
		expect(readyPayloads).toHaveLength(2);
		// The dead socket closing late changes nothing.
		sockets[0].drop();
		expect(sockets).toHaveLength(2);
	});

	it("marks connection gone on 4404 (session not found)", () => {
		const { sockets, states } = setup();
		sockets[0].accept();
		sockets[0].drop(4404);

		vi.advanceTimersByTime(5000);
		expect(states.at(-1)).toBe("gone");
		expect(sockets).toHaveLength(1);
	});

	it("renews token once on 4401", async () => {
		const { sockets, states } = setup(async () => "token-2");
		sockets[0].accept();
		sockets[0].drop(4401);

		await vi.waitFor(() => expect(sockets).toHaveLength(2));
		sockets[1].accept();
		expect(JSON.parse(sockets[1].sent[0]).token).toBe("token-2");

		sockets[1].drop(4401);
		await vi.waitFor(() => expect(states.at(-1)).toBe("signed-out"));
	});
});
