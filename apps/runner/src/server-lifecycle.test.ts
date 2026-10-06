import { expect, test } from "bun:test";

import type { Verified } from "./auth";
import type { ChatHub } from "./chat/hub";
import { readConfig } from "./config";
import type { EnvironmentStore } from "./environments/registry";
import { startServer } from "./server";
import type { TerminalStore } from "./terminals";

for (const kind of ["terminal", "chat", "relay"] as const) {
	test(`${kind} disconnect during hello verification never opens a channel later`, async () => {
		const pending = Promise.withResolvers<Verified>();
		const started = Promise.withResolvers<void>();
		const finished = Promise.withResolvers<void>();
		let attachments = 0;
		let detachments = 0;
		let targets = 0;
		let remoteConnections = 0;
		const away = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request, server) {
				if (server.upgrade(request)) return;
				return new Response("Expected a socket", { status: 426 });
			},
			websocket: {
				open() {
					remoteConnections++;
				},
				message() {},
			},
		});
		const detach = () => {
			detachments++;
		};
		const store = {
			attach: () => {
				attachments++;
				return {
					info: { id: "fixture", exitCode: null },
					history: [],
					resumed: false,
					at: 0,
					detach,
				};
			},
		} as unknown as TerminalStore;
		const chat = {
			attach: () => {
				attachments++;
				return {
					session: { id: "fixture" },
					history: [],
					running: false,
					cursor: { epoch: "test", next: 0 },
					detach,
				};
			},
		} as unknown as ChatHub;
		const environments = {
			store: {
				target: () => {
					targets++;
					return { url: `http://127.0.0.1:${away.port}`, token: "fixture-pairing" };
				},
			} as unknown as EnvironmentStore,
			checkUrl: (raw: string) => new URL(raw),
		};
		const home = startServer(
			{ ...readConfig({}), host: "127.0.0.1", port: 0 },
			store,
			async () => {
				started.resolve();
				const result = await pending.promise;
				finished.resolve();
				return result;
			},
			chat,
			{ environments },
		);
		let socket: WebSocket | null = null;
		try {
			const path = kind === "relay" ? "/env/fixture/terminal" : `/${kind}`;
			socket = new WebSocket(`ws://127.0.0.1:${home.port}${path}`);
			const opened = new Promise<void>((resolve) =>
				socket!.addEventListener("open", () => resolve()),
			);
			const closed = new Promise<void>((resolve) =>
				socket!.addEventListener("close", () => resolve()),
			);
			await opened;
			socket.send(JSON.stringify({ t: "hello", token: "fixture", id: "fixture" }));
			await started.promise;
			socket.close();
			await closed;
			// Wait for the server to process close, not just the client's earlier close event.
			for (let attempt = 0; home.pendingWebSockets && attempt < 100; attempt++) await Bun.sleep(1);
			expect(home.pendingWebSockets).toBe(0);
			pending.resolve({ who: { userId: "fixture", workspace: "fixture", role: "owner" } });
			await finished.promise;
			// Drain the server continuation and any outgoing loopback socket handshake.
			await Bun.sleep(20);
			expect(attachments).toBe(0);
			expect(detachments).toBe(0);
			expect(targets).toBe(0);
			expect(remoteConnections).toBe(0);
		} finally {
			pending.resolve({ who: { userId: "fixture", workspace: "fixture", role: "owner" } });
			socket?.close();
			await home.stop(true);
			await away.stop(true);
		}
	});
}
