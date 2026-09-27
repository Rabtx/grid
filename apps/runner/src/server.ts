import type { Server, ServerWebSocket } from "bun";

import { setupCommand } from "./agents/setup";
import type { Verified, Verify, Who } from "./auth";
import { type Channel, type ChannelSink, openChat, openTerminal } from "./channels";
import { type ChatHub } from "./chat/hub";
import { DiagnosticRoutes, safeCloseReason } from "./diagnostics/routes";
import type { DiagnosticInput, DiagnosticJournal } from "./diagnostics/journal";
import { chatRequest } from "./chat/routes";
import type { RunnerConfig } from "./config";
import type { PairingStore } from "./environments/pairing";
import { RELAYED_SOCKETS, relayHttp, SocketRelay } from "./environments/relay";
import { type EnvironmentDeps, environmentRequest, pairRequest } from "./environments/routes";
import { insideProjectsDir } from "./folders/folders";
import { folderRequest } from "./folders/routes";
import type { CodespacesLink } from "./github/codespaces";
import type { PullRequests } from "./github/pulls";
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
	/** The workspace (slug) to act in; the person's default one when left out. */
	workspace?: string;
	id?: string;
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
	/** Who said hello, once they have. */
	who: Who | null;
	/** When this socket opened, to measure how long it was up. */
	openedAt: number | null;
	/** The session or terminal named in hello, when it carries one. */
	sessionId: string | null;
	/** Chat and terminal channels carried inside a shared link socket. */
	linkChannels: Map<
		number,
		{ kind: "chat" | "terminal"; sessionId: string; openedAt: number }
	> | null;
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
	verify: Verify,
	chat: ChatHub,
	extras: {
		push?: PushNotifier;
		diagnostics?: DiagnosticJournal;
		/** This Grid's environments (the home side). */
		environments?: EnvironmentDeps;
		/** Other Grids may pair with this runner and drive it (the environment side). */
		pairing?: PairingStore;
		/** GitHub sign-in and Codespaces, through `gh` on this machine. */
		github?: CodespacesLink;
		/** Projects' pull requests, through the same `gh`. */
		pulls?: PullRequests;
	} = {},
): Server<SocketData> {
	const { push, diagnostics, environments, pairing, github, pulls } = extras;
	const diagnosticRoutes = diagnostics ? new DiagnosticRoutes(diagnostics) : null;
	const recordDiagnostic = (entry: Parameters<DiagnosticJournal["record"]>[0]): void => {
		try {
			diagnostics?.record(entry);
		} catch {
			console.error("[runner] could not write a diagnostic event");
		}
	};
	/**
	 * Who a request is from and the workspace it acts in (`X-Grid-Workspace`, a slug; the default
	 * one without it), or the error to answer with.
	 */
	async function whoFrom(request: Request, signIn: string): Promise<Who | Response> {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		if (!token) {
			recordDiagnostic({
				kind: "error",
				source: "auth",
				workspace: null,
				message: "Authentication refused (401)",
				details: { path: new URL(request.url).pathname, status: 401 },
			});
			return error(401, signIn);
		}
		const verified = await verify(token, request.headers.get("x-grid-workspace"));
		if ("who" in verified) return verified.who;
		recordDiagnostic({
			kind: "error",
			source: "auth",
			workspace: null,
			message: `Authentication refused (${verified.status})`,
			details: { path: new URL(request.url).pathname, status: verified.status },
		});
		return error(verified.status, verified.status === 401 ? signIn : verified.message);
	}

	// The hello deadline per socket, cleared when the socket closes so it never fires late.
	const helloTimers = new Map<ServerWebSocket<SocketData>, ReturnType<typeof setTimeout>>();

	return Bun.serve<SocketData>({
		hostname: config.host,
		port: config.port,
		async fetch(request, server) {
			const url = new URL(request.url);
			const startedAt = Date.now();
			try {
				if (diagnosticRoutes && url.pathname.startsWith("/diagnostics")) {
					const who = await whoFrom(request, "Sign in to view runner diagnostics");
					if (who instanceof Response) return who;
					return (await diagnosticRoutes.handle(request, url, who)) ?? error(404, "Not found");
				}

				if (url.pathname === "/health")
					return Response.json({ ok: true, startedAt: RUNNER_STARTED_AT });

				if (url.pathname === "/transcribe" && request.method === "POST") {
					const who = await whoFrom(request, "Sign in to use voice input");
					if (who instanceof Response) return who;
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
						data: {
							kind,
							relay: null,
							who: null,
							openedAt: null,
							sessionId: null,
							linkChannels: null,
							channel: null,
							link: null,
						},
					});
					if (!upgraded) {
						recordDiagnostic({
							kind: "error",
							source: "upgrade",
							workspace: null,
							message: "WebSocket upgrade failed",
							details: { path: url.pathname, status: 426 },
						});
						return new Response("Expected a WebSocket", { status: 426 });
					}
					return undefined;
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
								who: null,
								openedAt: null,
								sessionId: null,
								linkChannels: null,
								channel: null,
								link: null,
							},
						});
						if (!upgraded) {
							recordDiagnostic({
								kind: "error",
								source: "upgrade",
								workspace: null,
								message: "WebSocket upgrade failed",
								details: { path: url.pathname, status: 426 },
							});
							return new Response("Expected a WebSocket", { status: 426 });
						}
						return undefined;
					}
					const who = await whoFrom(request, "Sign in to use your environments");
					if (who instanceof Response) return who;
					const target = environments.store.target(who.workspace, environmentId);
					if (!target) return error(404, "That environment does not exist");
					const response = await relayHttp(request, path, url.search, target, environments.fetcher);
					if (
						request.method === "GET" &&
						/^\/chat\/sessions\/[\w-]+\/attachments\/[\w-]+$/.test(path) &&
						response.ok
					) {
						const mediaType = response.headers.get("Content-Type") ?? "";
						if (!/^image\/(png|jpeg|gif|webp)$/.test(mediaType)) {
							response.headers.set("Content-Type", "application/octet-stream");
							// The file's name may come through; never an inline disposition.
							const disposition = response.headers.get("Content-Disposition") ?? "";
							if (!disposition.startsWith("attachment"))
								response.headers.set("Content-Disposition", "attachment");
						}
						response.headers.set("X-Content-Type-Options", "nosniff");
						response.headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
						response.headers.set("Cache-Control", "private, no-store");
					}
					return response;
				}

				if (github && (url.pathname === "/github" || url.pathname.startsWith("/github/"))) {
					const who = await whoFrom(request, "Sign in to connect GitHub");
					if (who instanceof Response) return who;
					const handled = await githubRequest(
						request,
						url,
						who,
						github,
						pulls && {
							service: pulls,
							folderOf: (workspace, project) => {
								const folder = chat.projectFolders(workspace)[project];
								try {
									return folder ? insideProjectsDir(folder, config.projectsDir) : null;
								} catch {
									// Linked before the projects folder was narrowed: treated as not linked.
									return null;
								}
							},
						},
					);
					if (handled) return handled;
				}

				if (environments && url.pathname.startsWith("/environments")) {
					const who = await whoFrom(request, "Sign in to manage environments");
					if (who instanceof Response) return who;
					const handled = await environmentRequest(request, url, who.workspace, environments);
					if (handled) return handled;
				}

				if (url.pathname.startsWith("/fs/") || url.pathname.startsWith("/projects/")) {
					const who = await whoFrom(request, "Sign in to browse folders");
					if (who instanceof Response) return who;
					const handled = await folderRequest(
						request,
						url,
						who.workspace,
						chat,
						config.projectsDir,
					);
					if (handled) return handled;
				}

				if (push && url.pathname.startsWith("/push/")) {
					const who = await whoFrom(request, "Sign in to get notifications");
					if (who instanceof Response) return who;
					const handled = await pushRequest(request, url, who.userId, push);
					if (handled) return handled;
				}

				// Install or sign in an agent: a terminal here, running the agent's own command.
				const setup = url.pathname.match(/^\/chat\/providers\/([\w-]+)\/setup$/);
				if (setup && request.method === "POST") {
					const who = await whoFrom(request, "Sign in to set up agents");
					if (who instanceof Response) return who;
					const body = (await request.json().catch(() => ({}))) as { step?: unknown };
					const step = body.step === "install" || body.step === "sign-in" ? body.step : null;
					const command = step ? setupCommand(setup[1], step) : null;
					if (!step || !command) return error(404, "Grid cannot do that for this agent");
					const info = store.open(who.userId, { cols: 100, rows: 30 }, undefined, {
						command,
						title: `${step === "install" ? "Install" : "Sign in"} ${setup[1]}`,
					});
					if (!info) return error(429, "Close a terminal before opening another");
					return Response.json({ data: info }, { status: 201 });
				}

				if (url.pathname.startsWith("/chat/")) {
					const who = await whoFrom(request, "Sign in to chat with agents");
					if (who instanceof Response) return who;
					const handled = await chatRequest(request, url, who, chat);
					if (handled) return handled;
				}

				if (url.pathname === "/terminals" || url.pathname.startsWith("/terminals/")) {
					const who = await whoFrom(request, "Sign in to use the terminal");
					if (who instanceof Response) return who;
					const id = url.pathname.slice("/terminals/".length);

					if (request.method === "GET" && !id)
						return Response.json({ data: store.list(who.userId) });
					if (request.method === "POST" && !id) {
						const body = (await request.json().catch(() => ({}))) as {
							cols?: number;
							rows?: number;
							cwd?: string;
						};
						let cwd: string | undefined;
						if (typeof body.cwd === "string" && body.cwd.trim()) {
							try {
								cwd = insideProjectsDir(body.cwd, config.projectsDir);
							} catch {
								return error(400, "Terminal directory must be inside the projects directory");
							}
						}
						const info = store.open(
							who.userId,
							{ cols: body.cols ?? 80, rows: body.rows ?? 24 },
							cwd,
						);
						if (!info) return error(429, "Close a terminal before opening another");
						return Response.json({ data: info }, { status: 201 });
					}
					if (request.method === "DELETE" && id) {
						return store.close(who.userId, id)
							? new Response(null, { status: 204 })
							: error(404, "That terminal does not exist");
					}
					return error(405, "Method not allowed");
				}

				return error(404, "Not found");
			} finally {
				const durationMs = Date.now() - startedAt;
				if (durationMs > 2_000) {
					recordDiagnostic({
						kind: "error",
						source: "http",
						workspace: null,
						message: "Slow request",
						details: { method: request.method, path: url.pathname, durationMs },
					});
				}
			}
		},
		websocket: {
			// Keeps idle sockets alive through proxies and tunnels; Bun pings on its own.
			idleTimeout: 60,
			sendPings: true,
			maxPayloadLength: 1024 * 1024,
			open(ws) {
				ws.data.openedAt = Date.now();
				const timer = setTimeout(() => {
					if (!ws.data.who) ws.close(CLOSE_UNAUTHORIZED, "No hello");
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
				if (!ws.data.who) {
					await hello(ws, message);
					return;
				}
				if (ws.data.link) {
					trackLinkFrame(ws, message, recordDiagnostic);
					linkMessage(
						ws.data.link,
						{
							send: (text) => {
								trackLinkOutput(ws, text, recordDiagnostic);
								ws.send(text);
							},
							sendBinary: (bytes) => ws.sendBinary(bytes),
						},
						ws.data.who,
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
			close(ws, code, reason) {
				const durationMs = Math.max(0, Date.now() - (ws.data.openedAt ?? Date.now()));
				const closeReason = safeCloseReason(String(reason ?? ""));
				recordDiagnostic({
					kind: "connection",
					source: "websocket",
					workspace: ws.data.who?.workspace ?? null,
					message: `${ws.data.kind} socket closed`,
					details: {
						socket: ws.data.kind,
						code,
						reason: closeReason,
						durationMs,
						...(ws.data.sessionId ? { sessionId: ws.data.sessionId } : {}),
					},
				});
				for (const channel of ws.data.linkChannels?.values() ?? []) {
					recordLinkChannelClose(
						channel,
						code,
						closeReason,
						ws.data.who?.workspace ?? null,
						recordDiagnostic,
					);
				}
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
		if (typeof first.id === "string" && safeSessionId(first.id)) ws.data.sessionId = first.id;
		const who = signedIn(ws, await verify(first.token, first.workspace), recordDiagnostic);
		if (!who) return;
		const target = environments?.store.target(who.workspace, relay.environmentId);
		if (!target) {
			ws.close(CLOSE_NOT_FOUND, "That environment does not exist");
			return;
		}
		ws.data.who = who;
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
		if (needsId && typeof first.id === "string" && safeSessionId(first.id))
			ws.data.sessionId = first.id;
		const who = signedIn(ws, await verify(first.token, first.workspace), recordDiagnostic);
		if (!who) return;
		ws.data.who = who;
		clearTimeout(helloTimers.get(ws));
		if (ws.data.kind === "link") {
			ws.data.link = createLink();
			ws.data.linkChannels = new Map();
			ws.send(JSON.stringify({ t: "welcome" }));
			return;
		}
		const sink: ChannelSink = {
			text: (payload) => {
				recordAgentEvent(
					payload,
					ws.data.who?.workspace ?? null,
					ws.data.sessionId,
					recordDiagnostic,
				);
				ws.send(JSON.stringify(payload));
			},
			bytes: (bytes) => ws.sendBinary(bytes),
			close: (code, reason) => ws.close(code, reason),
		};
		const sessionHello = { ...first, id: first.id as string };
		ws.data.channel =
			ws.data.kind === "chat"
				? openChat(chat, who.workspace, sessionHello, sink)
				: openTerminal(store, who.userId, sessionHello, sink);
	}
}

type RecordDiagnostic = (entry: DiagnosticInput) => void;

function trackLinkFrame(
	ws: ServerWebSocket<SocketData>,
	frame: string | Buffer,
	record: RecordDiagnostic,
): void {
	if (typeof frame !== "string") return;
	const message = parse<Record<string, unknown>>(frame);
	if (!message || !isLinkChannel(message.ch)) return;
	const channels = ws.data.linkChannels;
	if (!channels) return;
	const channelId = message.ch as number;
	const existing = channels.get(channelId);
	if (message.t === "close") {
		if (existing) {
			recordLinkChannelClose(
				existing,
				1000,
				"Client detached",
				ws.data.who?.workspace ?? null,
				record,
			);
			channels.delete(channelId);
		}
		return;
	}
	if (
		message.t === "open" &&
		(message.kind === "chat" || message.kind === "terminal") &&
		safeSessionId(message.id)
	) {
		if (existing) {
			recordLinkChannelClose(existing, 1000, "Replaced", ws.data.who?.workspace ?? null, record);
		}
		channels.set(channelId, {
			kind: message.kind,
			sessionId: message.id,
			openedAt: Date.now(),
		});
	}
}

function trackLinkOutput(
	ws: ServerWebSocket<SocketData>,
	text: string,
	record: RecordDiagnostic,
): void {
	const message = parse<Record<string, unknown>>(text);
	if (!message || !isLinkChannel(message.ch)) return;
	const channelId = message.ch as number;
	const channel = ws.data.linkChannels?.get(channelId);
	if (!channel) return;
	if (message.t === "closed") {
		recordLinkChannelClose(
			channel,
			typeof message.code === "number" ? message.code : 1011,
			typeof message.reason === "string" ? safeCloseReason(message.reason) : "",
			ws.data.who?.workspace ?? null,
			record,
		);
		ws.data.linkChannels?.delete(channelId);
	} else if (message.t === "event") {
		recordAgentEvent(message, ws.data.who?.workspace ?? null, channel.sessionId, record);
	}
}

function recordLinkChannelClose(
	channel: { kind: "chat" | "terminal"; sessionId: string; openedAt: number },
	code: number,
	reason: string,
	workspace: string | null,
	record: RecordDiagnostic,
): void {
	record({
		kind: "connection",
		source: channel.kind,
		workspace,
		message: `${channel.kind} link channel closed`,
		details: {
			transport: "link",
			sessionId: channel.sessionId,
			code,
			reason: safeCloseReason(reason),
			durationMs: Math.max(0, Date.now() - channel.openedAt),
		},
	});
}

function recordAgentEvent(
	payload: Record<string, unknown>,
	workspace: string | null,
	sessionId: string | null,
	record: RecordDiagnostic,
): void {
	const event = payload.event;
	if (!event || typeof event !== "object") return;
	const data = event as Record<string, unknown>;
	if (data.type !== "error" && !(data.type === "turn_end" && data.reason === "error")) return;
	record({
		kind: "error",
		source: "agent",
		workspace,
		message: "Agent process reported an error",
		details: {
			...(sessionId ? { sessionId } : {}),
			event: data.type,
		},
	});
}

function safeSessionId(value: unknown): value is string {
	return typeof value === "string" && /^[\w-]{1,120}$/.test(value);
}

function isLinkChannel(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff;
}

/** The person a hello checked out as; otherwise the socket is closed with the reason. */
function signedIn(
	ws: ServerWebSocket<SocketData>,
	verified: Verified,
	recordDiagnostic: (entry: Parameters<DiagnosticJournal["record"]>[0]) => void,
): Who | null {
	if ("who" in verified) return verified.who;
	recordDiagnostic({
		kind: "error",
		source: "auth",
		workspace: null,
		message: `WebSocket authentication refused (${verified.status})`,
		details: { socket: ws.data.kind, status: verified.status },
	});
	ws.close(
		verified.status === 401 ? CLOSE_UNAUTHORIZED : CLOSE_NOT_FOUND,
		verified.status === 401 ? "Sign in again" : verified.message,
	);
	return null;
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
