/**
 * Grid's own tools for the agent in a thread, served as an MCP server over stdin and stdout
 * (`bun grid-tools.ts`, started by the agent beside the workspace's connectors). Which tools a
 * thread has (`show_visual`, the board, a crew's) is the runner's to say, and each call is handed
 * to the runner to do; this process holds no state and no secrets beyond the key it was given.
 */

type JsonRpc = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
};

type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };

const runner = process.env.GRID_RUNNER_URL ?? "";
const key = process.env.GRID_TOOLS_KEY ?? "";
const thread = process.env.GRID_TOOLS_THREAD ?? "";

async function ask<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${runner}${path}`, {
		...init,
		headers: { "x-grid-tools-key": key, "content-type": "application/json", ...init.headers },
	});
	const body = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
	if (!response.ok) throw new Error(body?.message ?? `Grid answered ${response.status}.`);
	return body?.data as T;
}

function write(message: JsonRpc): void {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: JsonRpc["id"], text: string, isError = false): JsonRpc {
	return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } };
}

async function list(id: JsonRpc["id"]): Promise<void> {
	try {
		const tools = await ask<Tool[]>(`/chat/tools?thread=${encodeURIComponent(thread)}`);
		write({ jsonrpc: "2.0", id, result: { tools } });
	} catch (cause) {
		write({
			jsonrpc: "2.0",
			id,
			error: { code: -32000, message: cause instanceof Error ? cause.message : String(cause) },
		});
	}
}

async function call(id: JsonRpc["id"], name: string, args: Record<string, unknown>): Promise<void> {
	try {
		const done = await ask<{ text: string }>("/chat/tools/call", {
			method: "POST",
			body: JSON.stringify({ thread, name, args }),
		});
		write(result(id, done.text));
	} catch (cause) {
		write(result(id, cause instanceof Error ? cause.message : String(cause), true));
	}
}

function handle(message: JsonRpc): void {
	if (message.id === undefined || message.id === null) return;
	switch (message.method) {
		case "initialize":
			write({
				jsonrpc: "2.0",
				id: message.id,
				result: {
					protocolVersion:
						(message.params as { protocolVersion?: string } | undefined)?.protocolVersion ??
						"2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: "grid", version: "0.1.0" },
				},
			});
			return;
		case "ping":
			write({ jsonrpc: "2.0", id: message.id, result: {} });
			return;
		case "tools/list":
			void list(message.id);
			return;
		case "tools/call": {
			const params = (message.params ?? {}) as {
				name?: string;
				arguments?: Record<string, unknown>;
			};
			void call(message.id, params.name ?? "", params.arguments ?? {});
			return;
		}
		default:
			write({
				jsonrpc: "2.0",
				id: message.id,
				error: { code: -32601, message: `Grid does not answer ${message.method}` },
			});
	}
}

async function main(): Promise<void> {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of process.stdin) {
		buffer += decoder.decode(chunk as Uint8Array, { stream: true });
		let line = buffer.indexOf("\n");
		while (line !== -1) {
			const text = buffer.slice(0, line).trim();
			buffer = buffer.slice(line + 1);
			if (text) {
				try {
					handle(JSON.parse(text) as JsonRpc);
				} catch {
					// Not JSON; nothing to answer.
				}
			}
			line = buffer.indexOf("\n");
		}
	}
}

if (import.meta.main) {
	main().catch((cause: unknown) => {
		process.stderr.write(`[grid tools] ${cause instanceof Error ? cause.message : cause}\n`);
		process.exit(1);
	});
}
