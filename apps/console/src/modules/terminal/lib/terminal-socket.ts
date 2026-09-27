import {
	onRunnerRecovered,
	reportClientDiagnostic,
	reportRunnerFailure,
	reportRunnerSuccess,
} from "@/lib/runner-health";

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
	/**
	 * Called when a (re)attach replays the terminal's recent output from the start. Not called when
	 * the runner could send only what this screen is missing: the screen stays as it is.
	 */
	onReset: () => void;
	onOutput: (bytes: Uint8Array) => void;
	onState: (state: ConnectionState) => void;
	onTitle: (title: string) => void;
	onExit: (code: number) => void;
	createSocket?: (url: string) => WebSocket;
	/** How many bytes of output the screen already shows (kept on the device), to get only the rest. */
	offset?: number | null;
	/** Backoff before each retry; the last value repeats. */
	retryDelaysMs?: number[];
};

export type TerminalSocket = {
	send: (data: string) => void;
	resize: (cols: number, rows: number) => void;
	/** Retry right away instead of waiting out the backoff (the page came back, the network did). */
	reconnectNow: () => void;
	/** How many bytes of output the screen holds: the next attach continues from here. */
	offset: () => number | null;
	close: () => void;
};

// Close codes the runner uses; see apps/runner/src/server.ts.
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NOT_FOUND = 4404;

// WebSocket.OPEN, spelled out so this module does not depend on a global WebSocket to load.
const OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 20_000;
// How long a ping may go unanswered before the link counts as dead.
const PROBE_TIMEOUT_MS = 2_500;

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
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let probeTimer: ReturnType<typeof setTimeout> | undefined;
	let renewedOnce = false;
	let pending = "";
	let lastActivityAt = Date.now();
	// How many bytes of the terminal's output this screen holds, to get only the rest on reattach.
	let received: number | null = options.offset ?? null;

	function startHeartbeat(): void {
		stopHeartbeat();
		heartbeatTimer = setInterval(probe, HEARTBEAT_INTERVAL_MS);
	}

	/**
	 * Ask the runner for a pong and drop the link if nothing at all comes back in time. A phone
	 * that slept can hand back a socket that still says it is open but is dead underneath; this
	 * finds out in a couple of seconds instead of waiting for the network to give up.
	 */
	function probe(): void {
		const ws = socket;
		if (!ws || !attached || ws.readyState !== OPEN || probeTimer) return;
		const sentAt = Date.now();
		try {
			ws.send(JSON.stringify({ t: "ping" }));
		} catch {
			replace(ws);
			return;
		}
		probeTimer = setTimeout(() => {
			probeTimer = undefined;
			if (socket === ws && lastActivityAt < sentAt) replace(ws);
		}, PROBE_TIMEOUT_MS);
	}

	/** Give up on a silent socket and attach again at once, keeping the screen as it is. */
	function replace(ws: WebSocket): void {
		if (socket !== ws) return;
		stopHeartbeat();
		socket = null;
		attached = false;
		try {
			ws.close();
		} catch {
			// Already closing; its close event is ignored because it is no longer the socket.
		}
		attempt = Math.max(attempt, 1);
		open();
	}

	function stopHeartbeat(): void {
		clearInterval(heartbeatTimer);
		heartbeatTimer = undefined;
		clearTimeout(probeTimer);
		probeTimer = undefined;
	}

	function setState(state: ConnectionState): void {
		options.onState(state);
	}

	function open(): void {
		if (closed || finished) return;
		clearTimeout(retryTimer);
		retryTimer = undefined;
		attached = false;
		if (attempt > 0) {
			reportClientDiagnostic(options.url, options.token, {
				event: "reconnect",
				source: "terminal",
				sessionId: options.id,
				attempt,
			});
		}
		setState(attempt === 0 ? "connecting" : "reconnecting");

		const ws = createSocket(options.url);
		let openedAt: number | null = null;
		ws.binaryType = "arraybuffer";
		socket = ws;

		ws.addEventListener("open", () => {
			openedAt = Date.now();
			const { cols, rows } = options.size();
			ws.send(
				JSON.stringify({
					t: "hello",
					token: options.token() ?? "",
					id: options.id,
					cols,
					rows,
					...(received !== null ? { offset: received } : {}),
				}),
			);
		});

		ws.addEventListener("message", (event: MessageEvent) => {
			if (socket !== ws) return;
			lastActivityAt = Date.now();
			if (typeof event.data !== "string") {
				const bytes = new Uint8Array(event.data as ArrayBuffer);
				if (received !== null) received += bytes.byteLength;
				options.onOutput(bytes);
				return;
			}
			const message = parse(event.data);
			if (message?.t === "pong") {
				return;
			}
			if (message?.t === "ready") {
				attached = true;
				attempt = 0;
				renewedOnce = false;
				reportRunnerSuccess();
				startHeartbeat();
				// An older runner says neither: treat it as a fresh start, as before.
				const resumed = (message as { resumed?: unknown }).resumed === true;
				const at = (message as { at?: unknown }).at;
				received = typeof at === "number" ? at : null;
				if (!resumed) options.onReset();
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
			reportClientDiagnostic(options.url, options.token, {
				event: "close",
				source: "terminal",
				sessionId: options.id,
				code: event.code,
				reason: event.reason,
				durationMs: openedAt === null ? 0 : Date.now() - openedAt,
			});
			stopHeartbeat();
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
			reportRunnerFailure();
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

	const unsubscribeRecovery = onRunnerRecovered(() => {
		reconnectNow();
	});

	open();

	/**
	 * The app came back or the network did: retry now instead of waiting out the backoff, and
	 * check that a socket which looks open still answers. A live one is kept as it is.
	 */
	function reconnectNow(): void {
		if (closed || finished) return;
		if (socket?.readyState === OPEN && attached) {
			probe();
			return;
		}
		if (socket) {
			// Caught halfway through attaching, maybe from before the app slept: start that over.
			replace(socket);
			return;
		}
		clearTimeout(retryTimer);
		retryTimer = undefined;
		attempt = Math.max(attempt, 1);
		open();
	}

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
		reconnectNow,
		offset: () => received,
		close() {
			closed = true;
			clearTimeout(retryTimer);
			stopHeartbeat();
			unsubscribeRecovery();
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
