import type { Server, ServerWebSocket } from "bun";

import { ChatError, type ChatHub } from "./chat/hub";
import { type ChatCommand, chatCommand, chatRequest } from "./chat/routes";
import type { RunnerConfig } from "./config";
import { folderRequest } from "./folders/routes";
import type { PushNotifier } from "./push/notifier";
import { pushRequest } from "./push/routes";
import type { TerminalStore } from "./terminals";
import { transcribe, TranscribeError } from "./transcribe";

/** What the console sends first on a socket: who it is and which terminal it wants. */
type Hello = {
	t: "hello";
	token: string;
	id: string;
	cols?: number;
	rows?: number;
	/** A chat sent from a page in the background (it reconnected while hidden). */
	visible?: boolean;
};

type Control = { t: "resize"; cols: number; rows: number } | { t: "input"; d: string };

type SocketData = {
	/** A terminal's byte stream, or a chat session's event stream. */
	kind: "terminal" | "chat";
	userId: string | null;
	/** The terminal or chat session this socket is attached to. */
	targetId: string | null;
	detach: (() => void) | null;
	/** Whether the device has the app in front of it; a chat it is not looking at may notify. */
	visible: boolean;
};

/** Close codes the console acts on: sign in again, or drop the tab. */
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_NOT_FOUND = 4404;

// About ten minutes of compressed speech; longer clips are almost certainly a stuck recording.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// A socket must say hello this soon, or it is dropped.
const HELLO_TIMEOUT_MS = 10_000;

export const RUNNER_STARTED_AT = Date.now();

export function startServer(
	config: RunnerConfig,
	store: TerminalStore,
	verify: (token: string) => Promise<string | null>,
	chat: ChatHub,
	push?: PushNotifier,
): Server<SocketData> {
	async function userFrom(request: Request): Promise<string | null> {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		return token ? verify(token) : null;
	}

	// The hello deadline per socket, cleared when the socket closes so it never fires late.
	const helloTimers = new Map<ServerWebSocket<SocketData>, ReturnType<typeof setTimeout>>();

	return Bun.serve<SocketData>({
		hostname: config.host,
		port: config.port,
		async fetch(request, server) {
			const url = new URL(request.url);

			if (url.pathname === "/health")
				return Response.json({ ok: true, startedAt: RUNNER_STARTED_AT });

			if (url.pathname === "/transcribe" && request.method === "POST") {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to use voice input");
				const audio = await request.blob();
				if (audio.size === 0) return error(400, "The recording is empty");
				if (audio.size > MAX_AUDIO_BYTES) return error(413, "The recording is too long");
				try {
					const text = await transcribe(config.transcribe, audio);
					return Response.json({ data: { text } });
				} catch (cause) {
					if (cause instanceof TranscribeError) return error(cause.status, cause.message);
					throw cause;
				}
			}

			if (url.pathname === "/terminal" || url.pathname === "/chat") {
				const kind = url.pathname === "/chat" ? "chat" : "terminal";
				const upgraded = server.upgrade(request, {
					data: { kind, userId: null, targetId: null, detach: null, visible: true },
				});
				return upgraded ? undefined : new Response("Expected a WebSocket", { status: 426 });
			}

			if (url.pathname.startsWith("/fs/") || url.pathname.startsWith("/projects/")) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to browse folders");
				const handled = await folderRequest(request, url, userId, chat);
				if (handled) return handled;
			}

			if (push && url.pathname.startsWith("/push/")) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to get notifications");
				const handled = await pushRequest(request, url, userId, push);
				if (handled) return handled;
			}

			if (url.pathname.startsWith("/chat/")) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to chat with agents");
				const handled = await chatRequest(request, url, userId, chat);
				if (handled) return handled;
			}

			if (url.pathname === "/terminals" || url.pathname.startsWith("/terminals/")) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to use the terminal");
				const id = url.pathname.slice("/terminals/".length);

				if (request.method === "GET" && !id) return Response.json({ data: store.list(userId) });
				if (request.method === "POST" && !id) {
					const body = (await request.json().catch(() => ({}))) as {
						cols?: number;
						rows?: number;
						cwd?: string;
					};
					const info = store.open(
						userId,
						{ cols: body.cols ?? 80, rows: body.rows ?? 24 },
						typeof body.cwd === "string" ? body.cwd : undefined,
					);
					if (!info) return error(429, "Close a terminal before opening another");
					return Response.json({ data: info }, { status: 201 });
				}
				if (request.method === "DELETE" && id) {
					return store.close(userId, id)
						? new Response(null, { status: 204 })
						: error(404, "That terminal does not exist");
				}
				return error(405, "Method not allowed");
			}

			return error(404, "Not found");
		},
		websocket: {
			// Keeps idle sockets alive through proxies and tunnels; Bun pings on its own.
			idleTimeout: 60,
			sendPings: true,
			maxPayloadLength: 1024 * 1024,
			open(ws) {
				const timer = setTimeout(() => {
					if (!ws.data.userId) ws.close(CLOSE_UNAUTHORIZED, "No hello");
				}, HELLO_TIMEOUT_MS);
				helloTimers.set(ws, timer);
			},
			async message(ws, message) {
				if (!ws.data.userId) {
					await hello(ws, message);
					return;
				}
				const { userId, targetId: terminalId } = ws.data;
				if (!terminalId) return;
				if (typeof message === "string") {
					const control = parse<{ t?: string; visible?: unknown }>(message);
					if (control?.t === "ping") {
						ws.send(JSON.stringify({ t: "pong" }));
						return;
					}
					if (control?.t === "visibility") {
						ws.data.visible = control.visible !== false;
						return;
					}
				}
				if (ws.data.kind === "chat") {
					const command = typeof message === "string" ? parse<ChatCommand>(message) : null;
					if (command) {
						chatCommand(chat, userId, terminalId, command, (reason) =>
							ws.send(JSON.stringify({ t: "error", message: reason })),
						);
					}
					return;
				}
				if (typeof message !== "string") {
					store.write(userId, terminalId, message);
					return;
				}
				const control = parse<Control>(message);
				if (control?.t === "input" && typeof control.d === "string") {
					store.write(userId, terminalId, control.d);
				} else if (control?.t === "resize") {
					store.resize(userId, terminalId, control.cols, control.rows);
				}
			},
			close(ws) {
				clearTimeout(helloTimers.get(ws));
				helloTimers.delete(ws);
				ws.data.detach?.();
				ws.data.detach = null;
			},
		},
	});

	async function hello(ws: ServerWebSocket<SocketData>, message: string | Buffer): Promise<void> {
		const first = typeof message === "string" ? parse<Hello>(message) : null;
		if (first?.t !== "hello" || typeof first.token !== "string" || typeof first.id !== "string") {
			ws.close(CLOSE_UNAUTHORIZED, "Expected hello");
			return;
		}
		const userId = await verify(first.token);
		if (!userId) {
			ws.close(CLOSE_UNAUTHORIZED, "Sign in again");
			return;
		}
		ws.data.visible = first.visible !== false;
		if (ws.data.kind === "chat") {
			chatHello(ws, userId, first.id);
			return;
		}
		const attached = store.attach(userId, first.id, {
			output: (bytes) => ws.sendBinary(bytes),
			exited: (code) => ws.send(JSON.stringify({ t: "exit", code })),
			titled: (title) => ws.send(JSON.stringify({ t: "title", title })),
		});
		if (!attached) {
			ws.close(CLOSE_NOT_FOUND, "That terminal does not exist");
			return;
		}
		ws.data = { ...ws.data, kind: "terminal", userId, targetId: first.id, detach: attached.detach };
		ws.send(JSON.stringify({ t: "ready", terminal: attached.info }));
		for (const bytes of attached.history) ws.sendBinary(bytes);
		if (attached.info.exitCode !== null) {
			ws.send(JSON.stringify({ t: "exit", code: attached.info.exitCode }));
		} else if (first.cols && first.rows) {
			store.resize(userId, first.id, first.cols, first.rows);
		}
	}

	/** A chat socket: the session's whole log, then its live events and running state. */
	function chatHello(ws: ServerWebSocket<SocketData>, userId: string, id: string): void {
		try {
			const attached = chat.attach(userId, id, {
				event: (event) => ws.send(JSON.stringify({ t: "event", event })),
				state: (state) => ws.send(JSON.stringify({ t: "state", ...state })),
				watching: () => ws.data.visible,
			});
			ws.data = { ...ws.data, kind: "chat", userId, targetId: id, detach: attached.detach };
			ws.send(
				JSON.stringify({
					t: "ready",
					session: attached.session,
					history: attached.history,
					running: attached.running,
				}),
			);
		} catch (cause) {
			if (cause instanceof ChatError && cause.status === 404)
				ws.close(CLOSE_NOT_FOUND, cause.message);
			else ws.close(1011, cause instanceof Error ? cause.message : "Chat failed");
		}
	}
}

function parse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

function error(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
