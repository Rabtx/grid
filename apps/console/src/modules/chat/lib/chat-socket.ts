import type { ChatEvent, ChatSession } from "../types/chat.types";

export type ChatConnection = "connecting" | "open" | "reconnecting" | "gone" | "signed-out";

export type ChatCommand =
	| { t: "prompt"; text: string }
	| { t: "cancel" }
	| { t: "approve"; id: string; optionId: string | null }
	| { t: "configure"; model?: string; mode?: string; effort?: string };

export type ChatSocketOptions = {
	url: string;
	id: string;
	token: () => string | null;
	renew: () => Promise<string | null>;
	/** The whole log, on every (re)attach: the transcript is rebuilt from it. */
	onReady: (ready: { session: ChatSession; history: ChatEvent[]; running: boolean }) => void;
	onEvent: (event: ChatEvent) => void;
	onRunning: (running: boolean) => void;
	onConnection: (state: ChatConnection) => void;
	onError: (message: string) => void;
	createSocket?: (url: string) => WebSocket;
	retryDelaysMs?: number[];
};

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_NOT_FOUND = 4404;
const OPEN = 1;

/**
 * A chat session's live link to the runner. Like the terminal's: reconnects with backoff,
 * renews the token once when refused, and every attach replays the full log so a phone that
 * slept comes back to the exact conversation.
 */
export function connectChat(options: ChatSocketOptions) {
	const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));
	const delays = options.retryDelaysMs ?? [250, 1000, 2000, 4000, 8000];
	let socket: WebSocket | null = null;
	let attached = false;
	let closed = false;
	let finished = false;
	let attempt = 0;
	let renewedOnce = false;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;

	function open(): void {
		if (closed || finished) return;
		clearTimeout(retryTimer);
		attached = false;
		options.onConnection(attempt === 0 ? "connecting" : "reconnecting");
		const ws = createSocket(options.url);
		socket = ws;
		ws.addEventListener("open", () => {
			ws.send(JSON.stringify({ t: "hello", token: options.token() ?? "", id: options.id }));
		});
		ws.addEventListener("message", (event: MessageEvent) => {
			if (socket !== ws || typeof event.data !== "string") return;
			let message: { t?: string; [key: string]: unknown };
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}
			if (message.t === "ready") {
				attached = true;
				attempt = 0;
				renewedOnce = false;
				options.onConnection("open");
				options.onReady(
					message as unknown as { session: ChatSession; history: ChatEvent[]; running: boolean },
				);
			} else if (message.t === "event") {
				options.onEvent(message.event as ChatEvent);
			} else if (message.t === "state") {
				options.onRunning(message.running === true);
			} else if (message.t === "error" && typeof message.message === "string") {
				options.onError(message.message);
			}
		});
		ws.addEventListener("close", (event: CloseEvent) => {
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

	open();

	return {
		/** False while the link is down: the caller keeps the draft instead of losing it. */
		send(command: ChatCommand): boolean {
			if (!socket || !attached || socket.readyState !== OPEN) return false;
			socket.send(JSON.stringify(command));
			return true;
		},
		reconnectNow(): void {
			if (closed || finished || socket) return;
			attempt = Math.max(attempt, 1);
			open();
		},
		close(): void {
			closed = true;
			clearTimeout(retryTimer);
			socket?.close();
			socket = null;
		},
	};
}

export type ChatSocket = ReturnType<typeof connectChat>;
