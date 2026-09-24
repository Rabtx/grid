/** Where a terminal's connection stands, as the screen shows it. */
export type ConnectionState =
	| "connecting"
	| "open"
	| "reconnecting"
	/** The shell ended; its output stays readable. */
	| "exited"
	/** The runner no longer has this terminal (it restarted, or the terminal was closed). */
	| "gone"
	/** The session is over: sign in again. */
	| "signed-out";

export type TerminalSocketOptions = {
	url: string;
	id: string;
	token: () => string | null;
	/** Get a fresh token after the runner refused the current one; null when there is none. */
	renew: () => Promise<string | null>;
	size: () => { cols: number; rows: number };
	/** Called before each (re)attach replays the terminal's recent output. */
	onReset: () => void;
	onOutput: (bytes: Uint8Array) => void;
	onState: (state: ConnectionState) => void;
	onTitle: (title: string) => void;
	onExit: (code: number) => void;
	createSocket?: (url: string) => WebSocket;
	/** Backoff before each retry; the last value repeats. */
	retryDelaysMs?: number[];
};

export type TerminalSocket = {
	send: (data: string) => void;
	resize: (cols: number, rows: number) => void;
	/** Retry right away instead of waiting out the backoff (the page came back, the network did). */
	reconnectNow: () => void;
	close: () => void;
};

// Close codes the runner uses; see apps/runner/src/server.ts.
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NOT_FOUND = 4404;

// WebSocket.OPEN, spelled out so this module does not depend on a global WebSocket to load.
const OPEN = 1;

// Typing while the link is down is kept (up to this much) and sent once it is back.
const MAX_PENDING_INPUT = 16 * 1024;

/**
 * One terminal's live connection to the runner, which survives the network: it reconnects with
 * backoff, renews the access token when the runner turns it away, and asks for the recent output
 * again on every attach so the screen is whole after a drop.
 */
export function connectTerminal(options: TerminalSocketOptions): TerminalSocket {
	const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
	const delays = options.retryDelaysMs ?? [250, 1000, 2000, 4000, 8000];
	const encoder = new TextEncoder();

	let socket: WebSocket | null = null;
	let attached = false;
	let closed = false;
	let finished = false;
	let attempt = 0;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let renewedOnce = false;
	let pending = "";

	function setState(state: ConnectionState): void {
		options.onState(state);
	}

	function open(): void {
		if (closed || finished) return;
		clearTimeout(retryTimer);
		retryTimer = undefined;
		attached = false;
		setState(attempt === 0 ? "connecting" : "reconnecting");

		const ws = createSocket(options.url);
		ws.binaryType = "arraybuffer";
		socket = ws;

		ws.addEventListener("open", () => {
			const { cols, rows } = options.size();
			ws.send(
				JSON.stringify({ t: "hello", token: options.token() ?? "", id: options.id, cols, rows }),
			);
		});

		ws.addEventListener("message", (event: MessageEvent) => {
			if (socket !== ws) return;
			if (typeof event.data !== "string") {
				options.onOutput(new Uint8Array(event.data as ArrayBuffer));
				return;
			}
			const message = parse(event.data);
			if (message?.t === "ready") {
				attached = true;
				attempt = 0;
				renewedOnce = false;
				options.onReset();
				setState("open");
				if (pending) {
					ws.send(encoder.encode(pending));
					pending = "";
				}
			} else if (message?.t === "title" && typeof message.title === "string") {
				options.onTitle(message.title);
			} else if (message?.t === "exit" && typeof message.code === "number") {
				finished = true;
				options.onExit(message.code);
				setState("exited");
			}
		});

		ws.addEventListener("close", (event: CloseEvent) => {
			if (socket !== ws) return;
			socket = null;
			attached = false;
			if (closed || finished) return;
			if (event.code === CLOSE_NOT_FOUND) {
				finished = true;
				setState("gone");
				return;
			}
			if (event.code === CLOSE_UNAUTHORIZED) {
				void reauthenticate();
				return;
			}
			scheduleRetry();
		});
	}

	async function reauthenticate(): Promise<void> {
		// One renewal per failure run: a token the runner refuses right after renewal means the
		// session really is over.
		if (renewedOnce) {
			setState("signed-out");
			return;
		}
		renewedOnce = true;
		const token = await options.renew();
		if (closed) return;
		if (token) open();
		else setState("signed-out");
	}

	function scheduleRetry(): void {
		setState("reconnecting");
		const delay = delays[Math.min(attempt, delays.length - 1)];
		attempt += 1;
		retryTimer = setTimeout(open, delay);
	}

	open();

	return {
		send(data) {
			if (finished) return;
			if (socket && attached && socket.readyState === OPEN) {
				socket.send(encoder.encode(data));
			} else if (pending.length + data.length <= MAX_PENDING_INPUT) {
				pending += data;
			}
		},
		resize(cols, rows) {
			if (socket && attached && socket.readyState === OPEN) {
				socket.send(JSON.stringify({ t: "resize", cols, rows }));
			}
		},
		reconnectNow() {
			if (closed || finished || socket) return;
			attempt = Math.max(attempt, 1);
			open();
		},
		close() {
			closed = true;
			clearTimeout(retryTimer);
			socket?.close();
			socket = null;
		},
	};
}

function parse(text: string): { t?: string; title?: unknown; code?: unknown } | null {
	try {
		return JSON.parse(text) as { t?: string };
	} catch {
		return null;
	}
}
