/**
 * One connection per machine for all its terminals and chats (the runner's `/link`). Each
 * terminal or chat still talks through something that behaves like its own WebSocket (a
 * `LinkedSocket`), so the code that reconnects, catches up and renews sign-in is unchanged; only
 * the wire is shared. Coming back from the background therefore reconnects once, not once per
 * open thread and terminal.
 *
 * A machine whose runner has no link yet (an environment on an older Grid) is detected once, and
 * its sockets quietly fall back to one real WebSocket each, as before.
 */

import { workspaceHeaders, workspaceHello } from "./active-workspace";
import { reportClientDiagnostic } from "./runner-health";

type Listener = (event: Event) => void;

/** The part of the WebSocket API the chat and terminal sockets use. */
export type SocketLike = {
	readyState: number;
	binaryType: BinaryType;
	send: (data: string | ArrayBufferLike | ArrayBufferView) => void;
	close: (code?: number, reason?: string) => void;
	addEventListener: (type: string, listener: Listener) => void;
};

export type LinkOptions = {
	/** The machine's runner, e.g. `https://host/runner` or `https://host/runner/env/<id>`. */
	base: string;
	token: () => string | null;
	createSocket?: (url: string) => WebSocket;
	fetcher?: typeof fetch;
	/** How long a ping may go unanswered before the connection counts as dead. */
	probeTimeoutMs?: number;
	/** How long the connection stays open with nothing on it. */
	idleMs?: number;
};

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

function frame(ch: number, data: ArrayBufferLike | ArrayBufferView): Uint8Array<ArrayBuffer> {
	const body =
		data instanceof Uint8Array
			? data
			: ArrayBuffer.isView(data)
				? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
				: new Uint8Array(data);
	const out = new Uint8Array(body.byteLength + 2);
	new DataView(out.buffer).setUint16(0, ch);
	out.set(body, 2);
	return out;
}

/** One terminal or chat on the shared connection, looking like its own WebSocket. */
class LinkedSocket extends EventTarget implements SocketLike {
	readyState = CONNECTING;
	binaryType: BinaryType = "blob";
	ch = 0;
	sessionId: string | null = null;
	/** Set when this machine has no link: the real WebSocket this one stands in for. */
	fallback: WebSocket | null = null;

	constructor(
		private readonly link: RunnerLink,
		readonly kind: "chat" | "terminal",
		readonly legacyUrl: string,
	) {
		super();
	}

	send(data: string | ArrayBufferLike | ArrayBufferView): void {
		if (this.fallback) {
			this.fallback.send(data as string);
			return;
		}
		if (this.readyState !== OPEN) return;
		if (typeof data !== "string") {
			this.link.sendBinary(frame(this.ch, data));
			return;
		}
		let message: { t?: string; [key: string]: unknown };
		try {
			message = JSON.parse(data);
		} catch {
			return;
		}
		if (message.t === "hello") {
			if (typeof message.id === "string") this.sessionId = message.id;
			// The link is already signed in; the rest of the hello says what to attach and from where.
			const { t: _t, token: _token, ...rest } = message;
			this.link.openChannel(this, rest);
		} else if (message.t === "ping") {
			this.link.ping(this);
		} else if (message.t === "visibility") {
			this.link.sendText({ t: "visibility", visible: message.visible });
		} else {
			this.link.sendText({ t: "msg", ch: this.ch, m: message });
		}
	}

	close(code = 1000, reason = ""): void {
		if (this.fallback) {
			this.fallback.close(code, reason);
			return;
		}
		if (this.readyState === CLOSED) return;
		this.link.closeChannel(this);
		this.ended(code, reason);
	}

	/** The link is up (or this machine has none): behave as an opened socket. */
	opened(): void {
		if (this.readyState !== CONNECTING) return;
		this.readyState = OPEN;
		this.dispatchEvent(new Event("open"));
	}

	received(data: string | ArrayBuffer): void {
		if (this.readyState === OPEN) this.dispatchEvent(new MessageEvent("message", { data }));
	}

	ended(code: number, reason: string): void {
		if (this.readyState === CLOSED) return;
		this.readyState = CLOSED;
		this.dispatchEvent(
			Object.assign(new Event("close"), { code, reason, wasClean: code === 1000 }),
		);
	}

	/** Stand in for a real WebSocket: forward its events as this one's. */
	useFallback(socket: WebSocket): void {
		this.fallback = socket;
		this.link.reportFallback(this);
		socket.binaryType = this.binaryType;
		socket.addEventListener("open", () => {
			this.readyState = OPEN;
			this.dispatchEvent(new Event("open"));
		});
		socket.addEventListener("message", (event) =>
			this.dispatchEvent(new MessageEvent("message", { data: event.data })),
		);
		socket.addEventListener("close", (event) => {
			this.readyState = CLOSED;
			this.dispatchEvent(
				Object.assign(new Event("close"), { code: event.code, reason: event.reason }),
			);
		});
	}
}

export class RunnerLink {
	private wire: WebSocket | null = null;
	private wireOpenedAt: number | null = null;
	private welcomed = false;
	private support: Promise<boolean> | null = null;
	private readonly channels = new Map<number, LinkedSocket>();
	private readonly waiting = new Set<LinkedSocket>();
	private nextCh = 1;
	private pingWaiters = new Set<LinkedSocket>();
	private probeTimer: ReturnType<typeof setTimeout> | undefined;
	private idleTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly createSocket: (url: string) => WebSocket;
	private readonly fetcher: typeof fetch;

	constructor(private readonly options: LinkOptions) {
		this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
		this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
	}

	reportFallback(socket: LinkedSocket): void {
		reportClientDiagnostic(this.options.base, this.options.token, {
			event: "fallback",
			source: socket.kind,
			...(socket.sessionId ? { sessionId: socket.sessionId } : {}),
		});
	}

	/** A socket for one terminal or chat; `legacyUrl` is its own socket, used without a link. */
	socket(kind: "chat" | "terminal", legacyUrl: string): SocketLike {
		const socket = new LinkedSocket(this, kind, legacyUrl);
		clearTimeout(this.idleTimer);
		void this.supported().then(
			(yes) => {
				if (socket.readyState !== CONNECTING) return;
				if (!yes) {
					socket.useFallback(this.createSocket(legacyUrl));
					return;
				}
				this.waiting.add(socket);
				this.connect();
				if (this.welcomed) this.release();
			},
			() => socket.ended(1006, "The runner is not reachable"),
		);
		return socket;
	}

	/**
	 * Whether this machine's runner has the link: 426 (a WebSocket endpoint) yes, 404 no. Anything
	 * else (offline, a sign-in to renew) settles nothing, and the next socket asks again.
	 */
	private supported(): Promise<boolean> {
		this.support ??= this.fetcher(`${this.options.base}/link`, {
			headers: { ...workspaceHeaders(), Authorization: `Bearer ${this.options.token() ?? ""}` },
			cache: "no-store",
		}).then(
			(response) => {
				if (response.status === 426) return true;
				if (response.status === 404) return false;
				this.support = null;
				throw new Error(`The runner answered ${response.status}`);
			},
			(cause: unknown) => {
				this.support = null;
				throw cause;
			},
		);
		return this.support;
	}

	private connect(): void {
		if (this.wire) return;
		const ws = this.createSocket(`${this.options.base.replace(/^http/, "ws")}/link`);
		ws.binaryType = "arraybuffer";
		this.wire = ws;
		this.welcomed = false;
		ws.addEventListener("open", () => {
			this.wireOpenedAt = Date.now();
			ws.send(
				JSON.stringify({ t: "hello", token: this.options.token() ?? "", ...workspaceHello() }),
			);
		});
		ws.addEventListener("message", (event: MessageEvent) => {
			if (this.wire !== ws) return;
			this.settleProbe();
			if (typeof event.data !== "string") {
				const bytes = event.data as ArrayBuffer;
				if (bytes.byteLength < 2) return;
				const ch = new DataView(bytes).getUint16(0);
				this.channels.get(ch)?.received(bytes.slice(2));
				return;
			}
			let message: { t?: string; ch?: number; code?: number; reason?: string };
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message.t === "welcome") {
				this.welcomed = true;
				this.release();
			} else if (message.t === "pong") {
				for (const waiter of this.pingWaiters) waiter.received(JSON.stringify({ t: "pong" }));
				this.pingWaiters.clear();
			} else if (message.t === "closed" && typeof message.ch === "number") {
				const channel = this.channels.get(message.ch);
				this.channels.delete(message.ch);
				channel?.ended(message.code ?? 1011, message.reason ?? "");
				this.idleSoon();
			} else if (typeof message.ch === "number") {
				this.channels.get(message.ch)?.received(event.data);
			}
		});
		ws.addEventListener("close", (event: CloseEvent) => {
			if (this.wire !== ws) return;
			this.dropped(event.code === 4401 ? 4401 : 1006, event.reason, event.code);
		});
	}

	/** Every socket waiting for the link opens now; each then says hello (opens its channel). */
	private release(): void {
		const ready = [...this.waiting];
		this.waiting.clear();
		for (const socket of ready) {
			socket.ch = this.nextChannel();
			this.channels.set(socket.ch, socket);
			socket.opened();
		}
	}

	private nextChannel(): number {
		for (let tries = 0; tries < 0xffff; tries++) {
			const ch = this.nextCh;
			this.nextCh = this.nextCh >= 0xffff ? 1 : this.nextCh + 1;
			if (!this.channels.has(ch)) return ch;
		}
		throw new Error("Too many open terminals and chats");
	}

	/**
	 * The connection is gone: every socket on it closes, and its own code reconnects it (which
	 * opens a new connection). A sign-in the runner refused (4401) is passed on as such.
	 */
	private dropped(code: number, reason: string, closeCode = code): void {
		const ws = this.wire;
		if (!ws) return;
		reportClientDiagnostic(this.options.base, this.options.token, {
			event: "close",
			source: "link",
			code: closeCode,
			reason,
			durationMs: this.wireOpenedAt === null ? 0 : Date.now() - this.wireOpenedAt,
		});
		this.wire = null;
		this.wireOpenedAt = null;
		this.welcomed = false;
		clearTimeout(this.probeTimer);
		this.probeTimer = undefined;
		this.pingWaiters.clear();
		try {
			ws?.close();
		} catch {
			// Already closing.
		}
		const everyone = [...this.channels.values(), ...this.waiting];
		this.channels.clear();
		this.waiting.clear();
		for (const socket of everyone) socket.ended(code, reason || "The connection dropped");
	}

	openChannel(socket: LinkedSocket, hello: Record<string, unknown>): void {
		this.sendText({ ...hello, t: "open", ch: socket.ch, kind: socket.kind });
	}

	closeChannel(socket: LinkedSocket): void {
		this.waiting.delete(socket);
		if (this.channels.get(socket.ch) === socket) {
			this.channels.delete(socket.ch);
			this.sendText({ t: "close", ch: socket.ch });
		}
		this.idleSoon();
	}

	sendText(message: Record<string, unknown>): void {
		if (this.wire?.readyState === OPEN && this.welcomed) this.wire.send(JSON.stringify(message));
	}

	sendBinary(bytes: Uint8Array<ArrayBuffer>): void {
		if (this.wire?.readyState === OPEN && this.welcomed) this.wire.send(bytes);
	}

	/**
	 * A socket's liveness check. However many ask at once, the connection is pinged once; each
	 * gets a pong when it answers. No answer in time means the connection is dead underneath (a
	 * phone that slept): it is dropped, and everything on it reconnects.
	 */
	ping(socket: LinkedSocket): void {
		this.pingWaiters.add(socket);
		if (this.probeTimer) return;
		this.sendText({ t: "ping" });
		this.probeTimer = setTimeout(() => {
			this.probeTimer = undefined;
			if (this.pingWaiters.size > 0) this.dropped(1006, "The connection stopped answering");
		}, this.options.probeTimeoutMs ?? 2_500);
	}

	private settleProbe(): void {
		if (!this.probeTimer) return;
		clearTimeout(this.probeTimer);
		this.probeTimer = undefined;
	}

	/** With nothing left on it, close the connection after a while (a new socket reopens it). */
	private idleSoon(): void {
		clearTimeout(this.idleTimer);
		if (this.channels.size > 0 || this.waiting.size > 0) return;
		this.idleTimer = setTimeout(() => {
			if (this.channels.size === 0 && this.waiting.size === 0 && this.wire) {
				const ws = this.wire;
				reportClientDiagnostic(this.options.base, this.options.token, {
					event: "close",
					source: "link",
					code: 1000,
					reason: "Nothing open",
					durationMs: this.wireOpenedAt === null ? 0 : Date.now() - this.wireOpenedAt,
				});
				this.wire = null;
				this.wireOpenedAt = null;
				this.welcomed = false;
				ws.close(1000, "Nothing open");
			}
		}, this.options.idleMs ?? 60_000);
	}
}

const links = new Map<string, RunnerLink>();

/**
 * The shared connection to a machine: this one (`scope` empty) or an environment
 * (`/env/<id>`). One per machine for the whole console.
 */
export function linkFor(scope: string, token: () => string | null): RunnerLink {
	let link = links.get(scope);
	if (!link) {
		link = new RunnerLink({ base: `${window.location.origin}/runner${scope}`, token });
		links.set(scope, link);
	}
	return link;
}
