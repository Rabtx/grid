import type { Server, ServerWebSocket } from "bun";

import { setupCommand } from "./agents/setup";
import { type Channel, type ChannelSink, openChat, openTerminal } from "./channels";
import { type ChatHub } from "./chat/hub";
import { chatRequest } from "./chat/routes";
import type { RunnerConfig } from "./config";
import type { PairingStore } from "./environments/pairing";
import { RELAYED_SOCKETS, relayHttp, SocketRelay } from "./environments/relay";
import { type EnvironmentDeps, environmentRequest, pairRequest } from "./environments/routes";
import { folderRequest } from "./folders/routes";
import type { CodespacesLink } from "./github/codespaces";
import { githubRequest } from "./github/routes";
import { closeLink, createLink, type LinkState, linkMessage } from "./link";
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
	/** A terminal: how many bytes of its output the device already has, to get only the rest. */
	offset?: number;
	/** A chat: where the device got to (the cursor it was given), to get only what it missed. */
	resume?: unknown;
};

type SocketData = {
	/** A terminal's byte stream, a chat session's event stream, or the link carrying many. */
	kind: "terminal" | "chat" | "link";
	/** Set when the socket belongs to an environment: carried there rather than served here. */
	relay: {
		environmentId: string;
		path: string;
		link: SocketRelay | null;
		/** Frames that arrived while the hello was still being checked; sent once linked. */
		early: (string | Buffer)[] | null;
	} | null;
	userId: string | null;
	/** The terminal or chat session this socket carries, once attached. */
	channel: Channel | null;
	/** The link's channels, once signed in (kind "link"). */
	link: LinkState | null;
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
	extras: {
		push?: PushNotifier;
		/** This Grid's environments (the home side). */
		environments?: EnvironmentDeps;
		/** Other Grids may pair with this runner and drive it (the environment side). */
		pairing?: PairingStore;
		/** GitHub sign-in and Codespaces, through `gh` on this machine. */
		github?: CodespacesLink;
	} = {},
): Server<SocketData> {
	const { push, environments, pairing, github } = extras;
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

			if (url.pathname === "/terminal" || url.pathname === "/chat" || url.pathname === "/link") {
				const kind =
					url.pathname === "/chat" ? "chat" : url.pathname === "/link" ? "link" : "terminal";
				const upgraded = server.upgrade(request, {
					data: { kind, relay: null, userId: null, channel: null, link: null },
				});
				return upgraded ? undefined : new Response("Expected a WebSocket", { status: 426 });
			}

			if (pairing) {
				const handled = await pairRequest(request, url, pairing);
				if (handled) return handled;
			}

			// `/env/<id>/…`: the same routes, on one of this person's environments.
			const relayed = environments ? url.pathname.match(/^\/env\/([\w-]+)(\/.*)$/) : null;
			if (environments && relayed) {
				const [, environmentId, path] = relayed;
				if (RELAYED_SOCKETS.has(path)) {
					const upgraded = server.upgrade(request, {
						data: {
							kind: path === "/chat" ? "chat" : path === "/link" ? "link" : "terminal",
							relay: { environmentId, path, link: null, early: null },
							userId: null,
							channel: null,
							link: null,
						},
					});
					return upgraded ? undefined : new Response("Expected a WebSocket", { status: 426 });
				}
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to use your environments");
				const target = environments.store.target(userId, environmentId);
				if (!target) return error(404, "That environment does not exist");
				return relayHttp(request, path, url.search, target, environments.fetcher);
			}

			if (github && (url.pathname === "/github" || url.pathname.startsWith("/github/"))) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to connect GitHub");
				const handled = await githubRequest(request, url, userId, github);
				if (handled) return handled;
			}

			if (environments && url.pathname.startsWith("/environments")) {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to manage environments");
				const handled = await environmentRequest(request, url, userId, environments);
				if (handled) return handled;
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

			// Install or sign in an agent: a terminal here, running the agent's own command.
			const setup = url.pathname.match(/^\/chat\/providers\/([\w-]+)\/setup$/);
			if (setup && request.method === "POST") {
				const userId = await userFrom(request);
				if (!userId) return error(401, "Sign in to set up agents");
				const body = (await request.json().catch(() => ({}))) as { step?: unknown };
				const step = body.step === "install" || body.step === "sign-in" ? body.step : null;
				const command = step ? setupCommand(setup[1], step) : null;
				if (!step || !command) return error(404, "Grid cannot do that for this agent");
				const info = store.open(userId, { cols: 100, rows: 30 }, undefined, {
					command,
					title: `${step === "install" ? "Install" : "Sign in"} ${setup[1]}`,
				});
				if (!info) return error(429, "Close a terminal before opening another");
				return Response.json({ data: info }, { status: 201 });
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
				const relay = ws.data.relay;
				if (relay) {
					if (relay.link) relay.link.forward(message);
					else if (relay.early) {
						if (relay.early.length < 256) relay.early.push(message);
					} else await relayHello(ws, message);
					return;
				}
				if (!ws.data.userId) {
					await hello(ws, message);
					return;
				}
				if (ws.data.link) {
					linkMessage(
						ws.data.link,
						{ send: (text) => ws.send(text), sendBinary: (bytes) => ws.sendBinary(bytes) },
						ws.data.userId,
						typeof message === "string" ? message : new Uint8Array(message),
						{ store, chat },
					);
					return;
				}
				const channel = ws.data.channel;
				if (!channel) return;
				if (typeof message === "string") {
					const control = parse<{ t?: string; visible?: unknown }>(message);
					if (control?.t === "ping") {
						ws.send(JSON.stringify({ t: "pong" }));
						return;
					}
					if (control?.t === "visibility") {
						channel.visible(control.visible !== false);
						return;
					}
					channel.input(message);
					return;
				}
				channel.input(message);
			},
			close(ws) {
				clearTimeout(helloTimers.get(ws));
				helloTimers.delete(ws);
				ws.data.relay?.link?.close();
				ws.data.channel?.detach();
				ws.data.channel = null;
				if (ws.data.link) closeLink(ws.data.link);
			},
		},
	});

	/**
	 * The console's hello on an environment socket: check the person here, then carry the socket
	 * through with the environment's own token in place of theirs.
	 */
	async function relayHello(
		ws: ServerWebSocket<SocketData>,
		message: string | Buffer,
	): Promise<void> {
		const relay = ws.data.relay;
		const first = typeof message === "string" ? parse<Hello>(message) : null;
		if (!relay || first?.t !== "hello" || typeof first.token !== "string") {
			ws.close(CLOSE_UNAUTHORIZED, "Expected hello");
			return;
		}
		relay.early = [];
		const userId = await verify(first.token);
		if (!userId) {
			ws.close(CLOSE_UNAUTHORIZED, "Sign in again");
			return;
		}
		const target = environments?.store.target(userId, relay.environmentId);
		if (!target) {
			ws.close(CLOSE_NOT_FOUND, "That environment does not exist");
			return;
		}
		ws.data.userId = userId;
		clearTimeout(helloTimers.get(ws));
		relay.link = new SocketRelay({
			send: (data) => {
				if (typeof data === "string") ws.send(data);
				else ws.sendBinary(data);
			},
			close: (code, reason) => ws.close(code, reason),
		});
		relay.link.open(target, relay.path, first);
		for (const frame of relay.early) relay.link.forward(frame);
		relay.early = null;
	}

	async function hello(ws: ServerWebSocket<SocketData>, message: string | Buffer): Promise<void> {
		const first = typeof message === "string" ? parse<Hello>(message) : null;
		const needsId = ws.data.kind !== "link";
		if (
			first?.t !== "hello" ||
			typeof first.token !== "string" ||
			(needsId && typeof first.id !== "string")
		) {
			ws.close(CLOSE_UNAUTHORIZED, "Expected hello");
			return;
		}
		const userId = await verify(first.token);
		if (!userId) {
			ws.close(CLOSE_UNAUTHORIZED, "Sign in again");
			return;
		}
		ws.data.userId = userId;
		clearTimeout(helloTimers.get(ws));
		if (ws.data.kind === "link") {
			ws.data.link = createLink();
			ws.send(JSON.stringify({ t: "welcome" }));
			return;
		}
		const sink: ChannelSink = {
			text: (payload) => ws.send(JSON.stringify(payload)),
			bytes: (bytes) => ws.sendBinary(bytes),
			close: (code, reason) => ws.close(code, reason),
		};
		ws.data.channel =
			ws.data.kind === "chat"
				? openChat(chat, userId, first, sink)
				: openTerminal(store, userId, first, sink);
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
