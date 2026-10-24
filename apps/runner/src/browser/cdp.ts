import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A Chromium on this machine, driven over the Chrome DevTools Protocol: started headless with its
 * own profile folder, spoken to over its WebSocket. No browser library: the protocol is small for
 * what Grid needs (pages, input, screenshots, script).
 */

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
export type CdpListener = (
	method: string,
	params: Record<string, unknown>,
	session?: string,
) => void;

const CALL_TIMEOUT_MS = 30_000;
const LAUNCH_TIMEOUT_MS = 20_000;

export class CdpError extends Error {}

export class Cdp {
	private next = 1;
	private readonly pending = new Map<number, Pending>();
	private readonly listeners = new Set<CdpListener>();
	private closed = false;

	private constructor(private readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => this.receive(String(event.data)));
		socket.addEventListener("close", () => {
			this.closed = true;
			for (const call of this.pending.values()) call.reject(new CdpError("The browser closed"));
			this.pending.clear();
		});
	}

	static connect(url: string): Promise<Cdp> {
		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			socket.addEventListener("open", () => resolve(new Cdp(socket)), { once: true });
			socket.addEventListener("error", () => reject(new CdpError("Could not reach the browser")), {
				once: true,
			});
		});
	}

	get open(): boolean {
		return !this.closed;
	}

	send<T = Record<string, unknown>>(
		method: string,
		params: Record<string, unknown> = {},
		session?: string,
	): Promise<T> {
		if (this.closed) return Promise.reject(new CdpError("The browser closed"));
		const id = this.next++;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new CdpError(`The browser did not answer ${method}`));
			}, CALL_TIMEOUT_MS);
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value as T);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
			this.socket.send(
				JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }),
			);
		});
	}

	on(listener: CdpListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** The next event of one of these kinds (on this session): true, or false after `timeoutMs`. */
	waitFor(
		methods: string | readonly string[],
		session: string | undefined,
		timeoutMs: number,
	): Promise<boolean> {
		const wanted = typeof methods === "string" ? [methods] : methods;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				stop();
				resolve(false);
			}, timeoutMs);
			const stop = this.on((name, _params, from) => {
				if (!wanted.includes(name) || from !== session) return;
				clearTimeout(timer);
				stop();
				resolve(true);
			});
		});
	}

	close(): void {
		this.closed = true;
		this.socket.close();
	}

	private receive(raw: string): void {
		let message: {
			id?: number;
			result?: unknown;
			error?: { message?: string };
			method?: string;
			params?: Record<string, unknown>;
			sessionId?: string;
		};
		try {
			message = JSON.parse(raw);
		} catch {
			return;
		}
		if (typeof message.id === "number") {
			const call = this.pending.get(message.id);
			if (!call) return;
			this.pending.delete(message.id);
			if (message.error) call.reject(new CdpError(message.error.message ?? "The browser refused"));
			else call.resolve(message.result ?? {});
			return;
		}
		if (message.method)
			for (const listener of this.listeners)
				listener(message.method, message.params ?? {}, message.sessionId);
	}
}

/** Where a Chromium is on this machine: `GRID_BROWSER`, then the usual places, else null. */
export function findBrowser(env: Record<string, string | undefined> = process.env): string | null {
	const candidates = [
		env.GRID_BROWSER,
		env.CHROME_PATH,
		"/opt/pw-browsers/chromium",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
	];
	return (
		candidates.find((path): path is string => Boolean(path) && existsSync(path as string)) ?? null
	);
}

/** Start a headless Chromium with its own profile and connect to it. */
export async function launchBrowser(
	binary: string,
	profile: string,
): Promise<{ cdp: Cdp; stop: () => void }> {
	const child = Bun.spawn(
		[
			binary,
			"--headless=new",
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			"--hide-scrollbars",
			"--mute-audio",
			"--disable-background-networking",
			// Chromium refuses its sandbox to root, as in containers.
			...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
			"about:blank",
		],
		{ stdin: "ignore", stdout: "ignore", stderr: "pipe" },
	);
	const url = await new Promise<string>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new CdpError("The browser did not start")),
			LAUNCH_TIMEOUT_MS,
		);
		void (async () => {
			const decoder = new TextDecoder();
			let text = "";
			let found = false;
			// Read to the end: a pipe nobody drains would stall the browser once it fills.
			for await (const chunk of child.stderr as ReadableStream<Uint8Array>) {
				if (found) continue;
				text += decoder.decode(chunk, { stream: true });
				const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
				if (match?.[1]) {
					found = true;
					text = "";
					clearTimeout(timer);
					resolve(match[1]);
				}
			}
			if (found) return;
			clearTimeout(timer);
			reject(new CdpError("The browser stopped before it started"));
		})();
	}).catch((cause: unknown) => {
		child.kill();
		throw cause;
	});
	const cdp = await Cdp.connect(url).catch((cause: unknown) => {
		child.kill();
		throw cause;
	});
	return {
		cdp,
		stop: () => {
			cdp.close();
			child.kill();
		},
	};
}
