import type { Server, ServerWebSocket } from "bun";

import type { RunnerConfig } from "./config";
import type { TerminalStore } from "./terminals";

/** What the console sends first on a socket: who it is and which terminal it wants. */
type Hello = { t: "hello"; token: string; id: string; cols?: number; rows?: number };

type Control = { t: "resize"; cols: number; rows: number } | { t: "input"; d: string };

type SocketData = { userId: string | null; terminalId: string | null; detach: (() => void) | null };

/** Close codes the console acts on: sign in again, or drop the tab. */
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_NOT_FOUND = 4404;

// A socket must say hello this soon, or it is dropped.
const HELLO_TIMEOUT_MS = 10_000;

export function startServer(
	config: RunnerConfig,
	store: TerminalStore,
	verify: (token: string) => Promise<string | null>,
): Server<SocketData> {
	async function userFrom(request: Request): Promise<string | null> {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		return token ? verify(token) : null;
	}

	return Bun.serve<SocketData>({
		hostname: config.host,
		port: config.port,
		async fetch(request, server) {
			const url = new URL(request.url);

			if (url.pathname === "/health") return Response.json({ ok: true });

			if (url.pathname === "/terminal") {
				const upgraded = server.upgrade(request, {
					data: { userId: null, terminalId: null, detach: null },
				});
				return upgraded ? undefined : new Response("Expected a WebSocket", { status: 426 });
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
				setTimeout(() => {
					if (!ws.data.userId) ws.close(CLOSE_UNAUTHORIZED, "No hello");
				}, HELLO_TIMEOUT_MS);
			},
			async message(ws, message) {
				if (!ws.data.userId) {
					await hello(ws, message);
					return;
				}
				const { userId, terminalId } = ws.data;
				if (!terminalId) return;
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
		const attached = store.attach(userId, first.id, {
			output: (bytes) => ws.sendBinary(bytes),
			exited: (code) => ws.send(JSON.stringify({ t: "exit", code })),
			titled: (title) => ws.send(JSON.stringify({ t: "title", title })),
		});
		if (!attached) {
			ws.close(CLOSE_NOT_FOUND, "That terminal does not exist");
			return;
		}
		ws.data = { userId, terminalId: first.id, detach: attached.detach };
		ws.send(JSON.stringify({ t: "ready", terminal: attached.info }));
		for (const bytes of attached.history) ws.sendBinary(bytes);
		if (attached.info.exitCode !== null) {
			ws.send(JSON.stringify({ t: "exit", code: attached.info.exitCode }));
		} else if (first.cols && first.rows) {
			store.resize(userId, first.id, first.cols, first.rows);
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
