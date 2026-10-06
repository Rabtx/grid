/**
 * Speaking MCP to a server: over HTTP (the streamable transport: JSON-RPC posted, answered as JSON
 * or a stream of events) or to a command on this machine over its stdin and stdout. Used to test a
 * server (Settings → Connectors) and by the proxy that stands between an agent and a server.
 */

export type JsonRpc = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

export const PROTOCOL_VERSION = "2025-06-18";

export class McpAuthError extends Error {
	constructor(message = "Sign in again") {
		super(message);
		this.name = "McpAuthError";
	}
}

/** One way to a server: send a message, get every message the server sends back for it. */
export type Transport = {
	send: (message: JsonRpc) => AsyncGenerator<JsonRpc>;
	close: () => void;
};

/** Messages out of an event stream, as they come. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<JsonRpc> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let end = buffer.search(/\r?\n\r?\n/);
		while (end !== -1) {
			const block = buffer.slice(0, end);
			buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
			const data = block
				.split(/\r?\n/)
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).replace(/^ /, ""))
				.join("\n");
			if (data) {
				try {
					yield JSON.parse(data) as JsonRpc;
				} catch {
					// Not a message (a keep-alive); skipped.
				}
			}
			end = buffer.search(/\r?\n\r?\n/);
		}
	}
}

/** A remote server. `token` is asked for on every request, so a renewed one is used at once. */
export function httpTransport(
	url: string,
	token: () => Promise<string | null>,
	fetcher: typeof fetch = fetch,
): Transport {
	let session: string | null = null;
	let initialized = false;
	return {
		async *send(message) {
			const bearer = await token();
			const response = await fetcher(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
					...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
					...(session ? { "mcp-session-id": session } : {}),
					...(initialized ? { "mcp-protocol-version": PROTOCOL_VERSION } : {}),
				},
				body: JSON.stringify(message),
			});
			if (response.status === 401 || response.status === 403) throw new McpAuthError();
			const issued = response.headers.get("mcp-session-id");
			if (issued) session = issued;
			if (message.method === "initialize") initialized = true;
			if (response.status === 202 || response.status === 204) return;
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				throw new Error(
					`The server answered ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
				);
			}
			const type = response.headers.get("content-type") ?? "";
			if (type.includes("text/event-stream") && response.body) {
				for await (const event of events(response.body)) {
					yield event;
					// The stream ends once this request is answered.
					if (message.id !== undefined && event.id === message.id) break;
				}
				return;
			}
			const body = (await response.json().catch(() => null)) as JsonRpc | JsonRpc[] | null;
			if (Array.isArray(body)) yield* body;
			else if (body) yield body;
		},
		close() {
			if (!session) return;
			void fetcher(url, { method: "DELETE", headers: { "mcp-session-id": session } }).catch(
				() => undefined,
			);
		},
	};
}

/** A command on this machine, spoken to line by line. Unanswered messages go to `onOther`. */
export function stdioTransport(
	command: string[],
	env: Record<string, string>,
	onOther: (message: JsonRpc) => void = () => {},
): Transport {
	const proc = Bun.spawn(command, {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, ...env },
	});
	const waiting = new Map<string, { id: number | string; resolve: (message: JsonRpc) => void }>();
	const stopped = (id: number | string): JsonRpc => ({
		jsonrpc: "2.0",
		id,
		error: {
			code: -32000,
			message:
				"The local MCP command stopped before answering. Check that it is installed and runs an MCP server over stdin/stdout.",
		},
	});
	void (async () => {
		const decoder = new TextDecoder();
		let buffer = "";
		for await (const chunk of proc.stdout) {
			buffer += decoder.decode(chunk, { stream: true });
			let line = buffer.indexOf("\n");
			while (line !== -1) {
				const text = buffer.slice(0, line).trim();
				buffer = buffer.slice(line + 1);
				if (text) {
					try {
						const message = JSON.parse(text) as JsonRpc;
						const key = message.id !== undefined && message.id !== null ? String(message.id) : null;
						const waiter = key && !message.method ? waiting.get(key) : undefined;
						if (waiter && key) {
							waiting.delete(key);
							waiter.resolve(message);
						} else onOther(message);
					} catch {
						// A line that is not JSON (a log); skipped.
					}
				}
				line = buffer.indexOf("\n");
			}
		}
		for (const [key, waiter] of waiting) {
			waiting.delete(key);
			waiter.resolve(stopped(waiter.id));
		}
	})();
	return {
		async *send(message) {
			// Only a request is answered; a reply to the server (no method) or a notification is not.
			const key = message.id !== undefined && message.id !== null ? String(message.id) : null;
			const answer =
				message.method && key !== null
					? new Promise<JsonRpc>((resolve) => {
							waiting.set(key, { id: message.id as number | string, resolve });
						})
					: null;
			try {
				proc.stdin.write(`${JSON.stringify(message)}\n`);
				proc.stdin.flush();
			} catch {
				if (answer && key !== null) {
					waiting.delete(key);
					yield stopped(message.id as number | string);
					return;
				}
				throw new Error("The local MCP command stopped before answering");
			}
			if (answer) yield await answer;
		},
		close() {
			proc.kill();
		},
	};
}

/** The answer to one request, or an error carrying the server's message. */
export async function request(
	transport: Transport,
	id: number,
	method: string,
	params?: unknown,
): Promise<unknown> {
	for await (const message of transport.send({ jsonrpc: "2.0", id, method, params })) {
		if (message.id !== id) continue;
		if (message.error) throw new Error(message.error.message || "The server refused");
		return message.result;
	}
	throw new Error(`No answer to ${method}`);
}

export type Probe = {
	server: string | null;
	tools: { name: string; description: string | null }[];
	ms: number;
};

/** Connects, says hello and lists the server's tools, then lets go. */
export async function probe(transport: Transport, timeoutMs = 30_000): Promise<Probe> {
	const started = performance.now();
	const work = (async () => {
		const hello = (await request(transport, 1, "initialize", {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: { name: "grid", version: "0.1.0" },
		})) as { serverInfo?: { name?: string } } | null;
		for await (const _ of transport.send({ jsonrpc: "2.0", method: "notifications/initialized" })) {
			// Nothing is expected back.
		}
		const tools: Probe["tools"] = [];
		let cursor: string | undefined;
		for (let page = 0; page < 10; page++) {
			const listed = (await request(
				transport,
				2 + page,
				"tools/list",
				cursor ? { cursor } : {},
			)) as {
				tools?: { name: string; description?: string }[];
				nextCursor?: string;
			} | null;
			for (const tool of listed?.tools ?? [])
				tools.push({ name: tool.name, description: tool.description ?? null });
			cursor = listed?.nextCursor;
			if (!cursor) break;
		}
		return { server: hello?.serverInfo?.name ?? null, tools };
	})();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error("The server did not answer in time")), timeoutMs);
			}),
		]);
		return { ...result, ms: Math.round(performance.now() - started) };
	} finally {
		clearTimeout(timer);
		transport.close();
	}
}
