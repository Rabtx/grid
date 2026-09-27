import { workspaceHello } from "@/lib/active-workspace";
import {
	onRunnerRecovered,
	reportClientDiagnostic,
	reportRunnerFailure,
	reportRunnerSuccess,
} from "@/lib/runner-health";

import type { ChatEvent, ChatSession } from "../types/chat.types";

export type ChatConnection = "connecting" | "open" | "reconnecting" | "gone" | "signed-out";

export type ChatCommand =
	| { t: "prompt"; text: string; attachments?: string[] }
	| { t: "cancel" }
	| { t: "approve"; id: string; optionId: string | null }
	| { t: "configure"; model?: string; mode?: string; effort?: string };

export type ChatSocketOptions = {
	url: string;
	id: string;
	token: () => string | null;
	renew: () => Promise<string | null>;
	/**
	 * On every (re)attach: the whole log (`history`), from which the transcript is rebuilt, or,
	 * when the runner could catch this device up, only the events it missed (`missed`, applied to
	 * the transcript as it is).
	 */
	onReady: (ready: {
		session: ChatSession;
		history: ChatEvent[];
		missed: ChatEvent[] | null;
		running: boolean;
	}) => void;
	onEvent: (event: ChatEvent) => void;
	onRunning: (running: boolean) => void;
	onConnection: (state: ChatConnection) => void;
	onError: (message: string) => void;
	/** Whether the person can see the chat; the runner notifies their devices only when not. */
	visible?: () => boolean;
	/** Where this device got to last time (kept on the device), to be caught up from there. */
	cursor?: { epoch: string; next: number } | null;
	createSocket?: (url: string) => WebSocket;
	retryDelaysMs?: number[];
};

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NOT_FOUND = 4404;
const OPEN = 1;
const HEARTBEAT_INTERVAL_MS = 20_000;
// How long a ping may go unanswered before the link counts as dead.
const PROBE_TIMEOUT_MS = 2_500;

/**
 * A chat session's live link to the runner. Like the terminal's: reconnects with backoff,
 * renews the token once when refused, and every attach replays the full log so a phone that
 * slept comes back to the exact conversation.
 */
export function connectChat(options: ChatSocketOptions) {
	const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
	const delays = options.retryDelaysMs ?? [250, 1000, 2000, 4000, 5000];
	let socket: WebSocket | null = null;
	let attached = false;
	let closed = false;
	let finished = false;
	let attempt = 0;
	let renewedOnce = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let probeTimer: ReturnType<typeof setTimeout> | undefined;
	let lastActivityAt = Date.now();
	// Where this device got to in the session's live events, so a reattach gets only the rest.
	let cursor: { epoch: string; next: number } | null = options.cursor ?? null;

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

	function open(): void {
		if (closed || finished) return;
		clearTimeout(retryTimer);
		retryTimer = undefined;
		attached = false;
		if (attempt > 0) {
			reportClientDiagnostic(options.url, options.token, {
				event: "reconnect",
				source: "chat",
				sessionId: options.id,
				attempt,
			});
		}
		options.onConnection(attempt === 0 ? "connecting" : "reconnecting");
		const ws = createSocket(options.url);
		let openedAt: number | null = null;
		socket = ws;
		ws.addEventListener("open", () => {
			openedAt = Date.now();
			ws.send(
				JSON.stringify({
					t: "hello",
					token: options.token() ?? "",
					...workspaceHello(),
					id: options.id,
					visible: options.visible?.() ?? true,
					...(cursor ? { resume: cursor } : {}),
				}),
			);
		});
		ws.addEventListener("message", (event: MessageEvent) => {
			if (socket !== ws || typeof event.data !== "string") return;
			lastActivityAt = Date.now();
			let message: { t?: string; [key: string]: unknown };
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message.t === "pong") {
				return;
			}
			if (message.t === "ready") {
				attached = true;
				attempt = 0;
				renewedOnce = false;
				reportRunnerSuccess();
				startHeartbeat();
				options.onConnection("open");
				const ready = message as unknown as {
					session: ChatSession;
					history?: ChatEvent[];
					missed?: ChatEvent[] | null;
					running: boolean;
					cursor?: { epoch: string; next: number };
				};
				cursor = ready.cursor ?? null;
				options.onReady({
					session: ready.session,
					history: ready.history ?? [],
					missed: ready.missed ?? null,
					running: ready.running,
				});
			} else if (message.t === "event") {
				if (cursor && typeof message.n === "number") cursor = { ...cursor, next: message.n + 1 };
				options.onEvent(message.event as ChatEvent);
			} else if (message.t === "state") {
				options.onRunning(message.running === true);
			} else if (message.t === "error" && typeof message.message === "string") {
				options.onError(message.message);
			}
		});
		ws.addEventListener("close", (event: CloseEvent) => {
			reportClientDiagnostic(options.url, options.token, {
				event: "close",
				source: "chat",
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
				options.onConnection("gone");
			} else if (event.code === CLOSE_UNAUTHORIZED) {
				void reauthenticate();
			} else {
				reportRunnerFailure();
				options.onConnection("reconnecting");
				const delay = delays[Math.min(attempt, delays.length - 1)];
				attempt += 1;
				retryTimer = setTimeout(open, delay);
			}
		});
	}

	async function reauthenticate(): Promise<void> {
		if (renewedOnce) {
			options.onConnection("signed-out");
			return;
		}
		renewedOnce = true;
		const token = await options.renew();
		if (closed) return;
		if (token) open();
		else options.onConnection("signed-out");
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
		/** False while the link is down: the caller keeps the draft instead of losing it. */
		send(command: ChatCommand): boolean {
			if (!socket || !attached || socket.readyState !== OPEN) return false;
			socket.send(JSON.stringify(command));
			return true;
		},
		reconnectNow,
		/** Where this device has got to, to keep on the device and resume from next time. */
		cursor: () => cursor,
		/** Tell the runner the chat went out of sight or came back. */
		setVisible(visible: boolean): void {
			if (socket && attached && socket.readyState === OPEN) {
				socket.send(JSON.stringify({ t: "visibility", visible }));
			}
		},
		close(): void {
			closed = true;
			clearTimeout(retryTimer);
			stopHeartbeat();
			unsubscribeRecovery();
			socket?.close();
			socket = null;
		},
	};
}

export type ChatSocket = ReturnType<typeof connectChat>;
