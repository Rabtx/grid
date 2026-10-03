import type { Server, ServerWebSocket } from "bun";

import { setupCommand } from "./agents/setup";
import { automationRequest } from "./automations/routes";
import type { Automations } from "./automations/service";
import type { Verified, Verify, Who } from "./auth";
import { type Channel, type ChannelSink, openChat, openTerminal } from "./channels";
import { type ChatHub } from "./chat/hub";
import type { DiagnosticInput, DiagnosticJournal } from "./diagnostics/journal";
import { RefusalTally } from "./diagnostics/refusals";
import { DiagnosticRoutes, safeCloseReason } from "./diagnostics/routes";
import { watchEventLoop } from "./diagnostics/stall";
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
import { type InboxDeps, inboxRequest } from "./inbox/routes";
import { type RoleDeps, roleRequest } from "./roles/routes";
import { closeLink, createLink, type LinkObserver, type LinkState, linkMessage } from "./link";
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
	/** A hello is being checked right now: frames that arrive meanwhile are not another one. */
	helloing: boolean;
	/** Frames that arrived while the hello was being checked; replayed once it is open. */
	early: (string | Buffer)[] | null;
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
		/** What is waiting on the people in a workspace, and the GitHub half of it. */
		inbox?: InboxDeps;
		automations?: Automations;
		/** The workspace's team: the roles its threads are started as. */
		roles?: RoleDeps;
	} = {},
): Server<SocketData> {
	const { push, diagnostics, environments, pairing, github, pulls, inbox, automations, roles } =
		extras;
	const diagnosticRoutes = diagnostics ? new DiagnosticRoutes(diagnostics) : null;
	const recordDiagnostic = (entry: DiagnosticInput): void => {
		try {
			diagnostics?.record(entry);
		} catch {
			console.error("[runner] could not write a diagnostic event");
		}
	};
	// Anyone can knock without a token, so refusals are counted, not written one by one.
	const refusals = new RefusalTally(recordDiagnostic);
	const refusalTimer = diagnostics ? setInterval(() => refusals.flush(), 15_000) : null;
	refusalTimer?.unref();
	const stopStallWatch = diagnostics
		? watchEventLoop((lagMs) =>
				recordDiagnostic({
					kind: "error",
					source: "runtime",
					workspace: null,
					message: "Runner event loop stalled",
					details: { lagMs },
				}),
			)
		: null;
	/** Who each request turned out to be, so its slow-request row lands in their workspace. */
	const signedInRequests = new WeakMap<Request, Who>();
	const refusedSignIn = (route: string, status: number): void =>
		refusals.note(`auth:${route}:${status}`, {
			kind: "error",
			source: "auth",
			label: "Sign-in refused",
			details: { route, status },
		});
	const failedUpgrade = (route: string): void =>
		refusals.note(`upgrade:${route}`, {
			kind: "error",
			source: "upgrade",
			label: "WebSocket upgrade failed",
			details: { route, status: 426 },
		});
	/**
	 * Who a request is from and the workspace it acts in (`X-Grid-Workspace`, a slug; the default
	 * one without it), or the error to answer with.
	 */
	async function whoFrom(request: Request, signIn: string): Promise<Who | Response> {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		if (!token) {
			refusedSignIn(routeKind(new URL(request.url).pathname), 401);
			return error(401, signIn);
		}
		const verified = await verify(token, request.headers.get("x-grid-workspace"));
		if ("who" in verified) {
			signedInRequests.set(request, verified.who);
			return verified.who;
		}
		refusedSignIn(routeKind(new URL(request.url).pathname), verified.status);
		return error(verified.status, verified.status === 401 ? signIn : verified.message);
	}

	// The hello deadline per socket, cleared when the socket closes so it never fires late.
	const helloTimers = new Map<ServerWebSocket<SocketData>, ReturnType<typeof setTimeout>>();

	const served = Bun.serve<SocketData>({
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
							helloing: false,
							early: null,
							openedAt: null,
							sessionId: null,
							linkChannels: null,
							channel: null,
							link: null,
						},
					});
					if (!upgraded) {
						failedUpgrade(kind);
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
								helloing: false,
								early: null,
								openedAt: null,
								sessionId: null,
								linkChannels: null,
								channel: null,
								link: null,
							},
						});
						if (!upgraded) {
							failedUpgrade("env");
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
							threadsOf: (workspace, project) => chat.branchThreads(workspace, project),
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

				if (inbox && url.pathname.startsWith("/inbox")) {
					const who = await whoFrom(request, "Sign in to see your inbox");
					if (who instanceof Response) return who;
					const handled = await inboxRequest(request, url, who, inbox);
					if (handled) return handled;
				}

				if (
					automations &&
					(url.pathname === "/automations" || url.pathname.startsWith("/automations/"))
				) {
					const who = await whoFrom(request, "Sign in to manage automations");
					if (who instanceof Response) return who;
					return automationRequest(
						request,
						url,
						who,
						automations,
						chat,
						inbox?.github?.available(who.userId) ?? false,
					);
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

				if (roles && (url.pathname === "/roles" || url.pathname.startsWith("/roles/"))) {
					const who = await whoFrom(request, "Sign in to see your team");
					if (who instanceof Response) return who;
					const handled = await roleRequest(request, url, who, roles);
					if (handled) return handled;
				}

				if (url.pathname.startsWith("/chat/")) {
					const who = await whoFrom(request, "Sign in to chat with agents");
					if (who instanceof Response) return who;
					const handled = await chatRequest(request, url, who, chat, roles?.store);
					if (handled) return handled;
				}

				if (url.pathname === "/terminals" || url.pathname.startsWith("/terminals/")) {
					const who = await whoFrom(request, "Sign in to use the terminal");
					if (who instanceof Response) return who;
					const id = url.pathname.slice("/terminals/".length);

					if (request.method === "GET" && !id)
						return Response.json({
							// With `status`, what each one is doing too (the Terminals panel asks for it).
							data:
								url.searchParams.get("status") === "1"
									? await store.statuses(who.userId)
									: store.list(who.userId),
						});
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
					// Paths carry ids: only a signed-in person's own workspace sees them.
					const who = signedInRequests.get(request);
					recordDiagnostic({
						kind: "error",
						source: "http",
						workspace: who?.workspace ?? null,
						message: "Slow request",
						details: {
							method: request.method,
							...(who ? { path: url.pathname } : { route: routeKind(url.pathname) }),
							durationMs,
						},
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
					if (ws.data.helloing) {
						// Held rather than treated as a hello of its own, and given to the channel
						// below once it opens: this is a keystroke typed while signing in. The relay
						// path keeps its early frames the same way.
						if (ws.data.early && ws.data.early.length < 256) ws.data.early.push(message);
						return;
					}
					await hello(ws, message);
					return;
				}
				if (ws.data.link) {
					linkMessage(
						ws.data.link,
						{ send: (text) => ws.send(text), sendBinary: (bytes) => ws.sendBinary(bytes) },
						ws.data.who,
						typeof message === "string" ? message : new Uint8Array(message),
						{ store, chat },
						linkObserver(ws, recordDiagnostic),
					);
					return;
				}
				const channel = ws.data.channel;
				if (!channel) return;
				toChannel(ws, channel, message);
			},
			close(ws, code, reason) {
				const durationMs = Math.max(0, Date.now() - (ws.data.openedAt ?? Date.now()));
				const closeReason = safeCloseReason(String(reason ?? ""));
				const who = ws.data.who;
				if (!who) {
					// Never signed in: counted, with nothing that names a session.
					refusals.note(`socket:${ws.data.kind}`, {
						kind: "connection",
						source: "websocket",
						label: `${ws.data.kind} socket closed before sign-in`,
						details: { socket: ws.data.kind },
					});
				} else {
					recordDiagnostic({
						kind: "connection",
						source: "websocket",
						workspace: who.workspace,
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
						recordLinkChannelClose(channel, code, closeReason, who.workspace, recordDiagnostic);
					}
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
	// The diagnostics timers end with the server.
	const stop = served.stop.bind(served);
	served.stop = (closeActiveConnections?: boolean) => {
		automations?.stop();
		if (refusalTimer) clearInterval(refusalTimer);
		stopStallWatch?.();
		return stop(closeActiveConnections);
	};
	return served;

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
		const who = signedIn(ws, await verify(first.token, first.workspace), (status) =>
			refusedSignIn(ws.data.kind, status),
		);
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

	/** One frame from a device to the terminal or chat session it is attached to. */
	function toChannel(
		ws: ServerWebSocket<SocketData>,
		channel: Channel,
		message: string | Buffer,
	): void {
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
	}

	async function hello(ws: ServerWebSocket<SocketData>, message: string | Buffer): Promise<void> {
		// Verifying the token awaits, and Bun hands the next frame to `message` without waiting for
		// this one. `who` is only set at the end, so a frame arriving mid-hello looked like the
		// start of a new one: an ordinary keystroke was closed as "Expected hello", and a second
		// hello opened a second channel on the one socket, leaving the first attached for good.
		ws.data.helloing = true;
		ws.data.early = [];
		try {
			await openHello(ws, message);
		} finally {
			ws.data.helloing = false;
		}
	}

	async function openHello(
		ws: ServerWebSocket<SocketData>,
		message: string | Buffer,
	): Promise<void> {
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
		const who = signedIn(ws, await verify(first.token, first.workspace), (status) =>
			refusedSignIn(ws.data.kind, status),
		);
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
			text: (payload) => ws.send(JSON.stringify(payload)),
			bytes: (bytes) => ws.sendBinary(bytes),
			close: (code, reason) => ws.close(code, reason),
		};
		const sessionHello = { ...first, id: first.id as string };
		ws.data.channel?.detach();
		const channel =
			ws.data.kind === "chat"
				? openChat(chat, who.workspace, sessionHello, sink)
				: openTerminal(store, who.userId, sessionHello, sink);
		ws.data.channel = channel;
		// Nothing to attach: the sink has already closed the socket, and the frames held for it
		// have nowhere to go.
		if (channel) for (const early of ws.data.early ?? []) toChannel(ws, channel, early);
		ws.data.early = null;
	}
}

type RecordDiagnostic = (entry: DiagnosticInput) => void;

/** Keep the link's chat and terminal channels, as the link opens and ends them, for close rows. */
function linkObserver(ws: ServerWebSocket<SocketData>, record: RecordDiagnostic): LinkObserver {
	return {
		opened: (ch, kind, id) => {
			if (safeSessionId(id))
				ws.data.linkChannels?.set(ch, { kind, sessionId: id, openedAt: Date.now() });
		},
		closed: (ch, code, reason) => {
			const channel = ws.data.linkChannels?.get(ch);
			const workspace = ws.data.who?.workspace;
			if (!channel || !workspace) return;
			ws.data.linkChannels?.delete(ch);
			recordLinkChannelClose(channel, code, reason, workspace, record);
		},
	};
}

function recordLinkChannelClose(
	channel: { kind: "chat" | "terminal"; sessionId: string; openedAt: number },
	code: number,
	reason: string,
	workspace: string,
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

function safeSessionId(value: unknown): value is string {
	return typeof value === "string" && /^[\w-]{1,120}$/.test(value);
}

/** The person a hello checked out as; otherwise the socket is closed with the reason. */
function signedIn(
	ws: ServerWebSocket<SocketData>,
	verified: Verified,
	refused: (status: number) => void,
): Who | null {
	if ("who" in verified) return verified.who;
	refused(verified.status);
	ws.close(
		verified.status === 401 ? CLOSE_UNAUTHORIZED : CLOSE_NOT_FOUND,
		verified.status === 401 ? "Sign in again" : verified.message,
	);
	return null;
}

const ROUTE_KINDS = new Set([
	"automations",
	"chat",
	"diagnostics",
	"env",
	"environments",
	"fs",
	"github",
	"link",
	"projects",
	"push",
	"terminal",
	"terminals",
	"transcribe",
]);

/** A request's first path segment when it is one of ours: coarse enough to show every workspace. */
function routeKind(pathname: string): string {
	const first = pathname.split("/")[1] ?? "";
	return ROUTE_KINDS.has(first) ? first : "other";
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
