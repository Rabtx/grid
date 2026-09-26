import { type ChatCursor, ChatError, type ChatHub } from "./chat/hub";
import { type ChatCommand, chatCommand } from "./chat/routes";
import type { TerminalStore } from "./terminals";

/**
 * One terminal or chat session carried to a device: attaching it, catching the device up, and
 * what it sends. The same whether the device uses a socket per terminal or chat, or one
 * connection for everything (the link); only the sink, which says how to reach the device,
 * differs.
 */

/** How a channel reaches its device. */
export type ChannelSink = {
	/** A JSON message. */
	text: (message: Record<string, unknown>) => void;
	/** Terminal output. */
	bytes: (bytes: Uint8Array) => void;
	/** The channel is over: 4404 when there is nothing to attach, else a WebSocket-style code. */
	close: (code: number, reason: string) => void;
};

export type Channel = {
	/** Something the device sent on this channel. */
	input: (message: string | Uint8Array) => void;
	/** The device put the app in the background, or brought it back. */
	visible: (visible: boolean) => void;
	/** The device left: stop sending to it. */
	detach: () => void;
};

export const CLOSE_NOT_FOUND = 4404;

type Control = { t: "resize"; cols: number; rows: number } | { t: "input"; d: string };

function parse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

/**
 * A terminal: its output from where the device got to (`offset`, a byte count it has seen) when
 * that is still kept, otherwise all that is kept after a `reset`. Then everything live.
 */
export function openTerminal(
	store: TerminalStore,
	userId: string,
	hello: { id: string; cols?: number; rows?: number; offset?: number },
	sink: ChannelSink,
): Channel | null {
	const attached = store.attach(
		userId,
		hello.id,
		{
			output: (bytes) => sink.bytes(bytes),
			exited: (code) => sink.text({ t: "exit", code }),
			titled: (title) => sink.text({ t: "title", title }),
			event: (event) => sink.text({ t: "event", event }),
		},
		typeof hello.offset === "number" ? hello.offset : undefined,
	);
	if (!attached) {
		sink.close(CLOSE_NOT_FOUND, "That terminal does not exist");
		return null;
	}
	sink.text({
		t: "ready",
		terminal: attached.info,
		resumed: attached.resumed,
		at: attached.at,
		screen: attached.screen,
		ads: attached.ads,
	});
	for (const bytes of attached.history) sink.bytes(bytes);
	if (attached.info.exitCode !== null) {
		sink.text({ t: "exit", code: attached.info.exitCode });
	} else if (hello.cols && hello.rows) {
		store.resize(userId, hello.id, hello.cols, hello.rows);
	}
	return {
		input(message) {
			if (typeof message !== "string") {
				store.write(userId, hello.id, message);
				return;
			}
			const control = parse<Control>(message);
			if (control?.t === "input" && typeof control.d === "string") {
				store.write(userId, hello.id, control.d);
			} else if (control?.t === "resize") {
				store.resize(userId, hello.id, control.cols, control.rows);
			}
		},
		visible: () => {},
		detach: attached.detach,
	};
}

function isCursor(value: unknown): value is ChatCursor {
	const cursor = value as ChatCursor | null;
	return typeof cursor?.epoch === "string" && typeof cursor.next === "number";
}

/**
 * A chat session: its whole log, or only what the device missed (`resume`, the cursor it was
 * given), then its live events (each numbered) and running state.
 */
export function openChat(
	chat: ChatHub,
	workspace: string,
	hello: { id: string; resume?: unknown; visible?: boolean },
	sink: ChannelSink,
): Channel | null {
	let visible = hello.visible !== false;
	try {
		const attached = chat.attach(
			workspace,
			hello.id,
			{
				event: (event, n) => sink.text({ t: "event", event, n }),
				state: (state) => sink.text({ t: "state", ...state }),
				watching: () => visible,
			},
			isCursor(hello.resume) ? hello.resume : undefined,
		);
		sink.text({
			t: "ready",
			session: attached.session,
			history: attached.history,
			missed: attached.missed,
			running: attached.running,
			cursor: attached.cursor,
		});
		return {
			input(message) {
				if (typeof message !== "string") return;
				const command = parse<ChatCommand>(message);
				if (command) {
					chatCommand(chat, workspace, hello.id, command, (reason) =>
						sink.text({ t: "error", message: reason }),
					);
				}
			},
			visible: (next) => {
				visible = next;
			},
			detach: attached.detach,
		};
	} catch (cause) {
		if (cause instanceof ChatError && cause.status === 404) {
			sink.close(CLOSE_NOT_FOUND, cause.message);
		} else {
			sink.close(1011, cause instanceof Error ? cause.message : "Chat failed");
		}
		return null;
	}
}
