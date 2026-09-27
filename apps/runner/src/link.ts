import { type Channel, type ChannelSink, openChat, openTerminal } from "./channels";
import type { Who } from "./auth";
import type { ChatHub } from "./chat/hub";
import type { TerminalStore } from "./terminals";

/**
 * The link: one connection per device carrying all its terminals and chats on this machine, so
 * coming back from the background means one reconnect, not one per open thread and terminal.
 *
 * After the device's hello (its sign-in), everything is on numbered channels:
 * - `{t:"open", ch, kind:"chat"|"terminal", id, …}` attaches one, with the same catch-up fields
 *   a per-terminal or per-chat socket's hello takes (`offset`, `resume`, `cols`, `rows`).
 * - `{t:"msg", ch, m}` is a message for a channel; binary frames are a 2-byte channel number
 *   (big-endian) and then the bytes, both ways.
 * - `{t:"close", ch}` detaches one; `{t:"closed", ch, code, reason}` says one ended.
 * - `{t:"ping"}` and `{t:"visibility", visible}` are for the whole connection.
 * Everything the runner sends on a channel carries its `ch`.
 */

export type LinkState = { channels: Map<number, Channel> };

/** How the link reaches its device: the WebSocket, as the server has it. */
export type LinkSocket = {
	send: (text: string) => void;
	sendBinary: (bytes: Uint8Array) => void;
};

/**
 * Hears channels open and end, from the frames this module already reads and writes. `closed`
 * may name a channel that was never opened or already ended.
 */
export type LinkObserver = {
	opened: (ch: number, kind: "chat" | "terminal", id: string) => void;
	closed: (ch: number, code: number, reason: string) => void;
};

const MAX_CHANNELS = 256;

function frame(ch: number, bytes: Uint8Array): Uint8Array {
	const out = new Uint8Array(bytes.byteLength + 2);
	new DataView(out.buffer).setUint16(0, ch);
	out.set(bytes, 2);
	return out;
}

function parse(text: string): Record<string, unknown> | null {
	try {
		const value = JSON.parse(text) as unknown;
		return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function isChannel(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff;
}

export function createLink(): LinkState {
	return { channels: new Map() };
}

/** One message from a signed-in device on its link. */
export function linkMessage(
	link: LinkState,
	socket: LinkSocket,
	who: Who,
	message: string | Uint8Array,
	deps: { store: TerminalStore; chat: ChatHub },
	observer?: LinkObserver,
): void {
	if (typeof message !== "string") {
		if (message.byteLength < 2) return;
		const ch = new DataView(message.buffer, message.byteOffset, message.byteLength).getUint16(0);
		link.channels.get(ch)?.input(message.subarray(2));
		return;
	}
	const control = parse(message);
	if (!control) return;
	if (control.t === "ping") {
		socket.send(JSON.stringify({ t: "pong" }));
		return;
	}
	if (control.t === "visibility") {
		for (const channel of link.channels.values()) channel.visible(control.visible !== false);
		return;
	}
	const ch = control.ch;
	if (!isChannel(ch)) return;
	if (control.t === "msg") {
		if (control.m && typeof control.m === "object") {
			link.channels.get(ch)?.input(JSON.stringify(control.m));
		}
		return;
	}
	if (control.t === "close") {
		observer?.closed(ch, 1000, "Client detached");
		link.channels.get(ch)?.detach();
		link.channels.delete(ch);
		return;
	}
	if (control.t !== "open" || typeof control.id !== "string") return;

	// Opening a channel number again replaces what was on it.
	observer?.closed(ch, 1000, "Replaced");
	link.channels.get(ch)?.detach();
	link.channels.delete(ch);
	let ended = false;
	const sink: ChannelSink = {
		text: (payload) => {
			if (!ended) socket.send(JSON.stringify({ ...payload, ch }));
		},
		bytes: (bytes) => {
			if (!ended) socket.sendBinary(frame(ch, bytes));
		},
		close: (code, reason) => {
			if (ended) return;
			ended = true;
			socket.send(JSON.stringify({ t: "closed", ch, code, reason }));
			observer?.closed(ch, code, reason);
			link.channels.delete(ch);
		},
	};
	if (link.channels.size >= MAX_CHANNELS) {
		sink.close(1013, "Too many open terminals and chats on one connection");
		return;
	}
	if (control.kind === "chat" || control.kind === "terminal")
		observer?.opened(ch, control.kind, control.id);
	const hello = { ...control, id: control.id };
	const channel =
		control.kind === "chat"
			? openChat(deps.chat, who.workspace, hello, sink)
			: control.kind === "terminal"
				? openTerminal(deps.store, who.userId, hello, sink)
				: (sink.close(1003, "Unknown channel kind"), null);
	if (channel && !ended) link.channels.set(ch, channel);
}

/** The device went away: let every channel go. */
export function closeLink(link: LinkState): void {
	for (const channel of link.channels.values()) channel.detach();
	link.channels.clear();
}
