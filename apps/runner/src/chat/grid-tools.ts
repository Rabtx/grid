/**
 * Grid's own tools for the agent in a thread, served as an MCP server over stdin and stdout
 * (`bun grid-tools.ts`, started by the agent beside the workspace's connectors). Today that is
 * `show_visual`, which puts a chart, table or other visual into the agent's reply. Each call is
 * handed to the runner, which checks it and writes it into the thread; this process holds no
 * state and no secrets beyond the key the runner started it with.
 */
import { SHOW_VISUAL_DESCRIPTION } from "./visuals";

type JsonRpc = {
	jsonrpc: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
};

const runner = process.env.GRID_RUNNER_URL ?? "";
const key = process.env.GRID_TOOLS_KEY ?? "";
const thread = process.env.GRID_TOOLS_THREAD ?? "";

const TOOLS = [
	{
		name: "show_visual",
		description: SHOW_VISUAL_DESCRIPTION,
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string", description: "A short name for the visual (not shown)." },
				blocks: {
					type: "array",
					description: "The components to draw, in reading order.",
					items: { type: "object" },
				},
				html: {
					type: "string",
					description: "One self-contained HTML document, instead of blocks.",
				},
				height: { type: "number", description: "For html: the frame's starting height in pixels." },
			},
			required: ["title"],
		},
	},
];

function write(message: JsonRpc): void {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: JsonRpc["id"], text: string, isError = false): JsonRpc {
	return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } };
}

async function call(id: JsonRpc["id"], name: string, args: Record<string, unknown>): Promise<void> {
	if (name !== "show_visual") {
		write(result(id, `Grid has no tool called ${name}.`, true));
		return;
	}
	try {
		const response = await fetch(`${runner}/chat/tools/visual`, {
			method: "POST",
			headers: { "x-grid-tools-key": key, "content-type": "application/json" },
			body: JSON.stringify({ thread, args }),
		});
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		if (!response.ok) {
			write(result(id, body?.message ?? `Grid answered ${response.status}.`, true));
			return;
		}
		write(
			result(
				id,
				"Shown to the reader above your reply. Do not describe it or say where it is; state the key finding in words.",
			),
		);
	} catch (cause) {
		write(
			result(id, `Grid could not show it: ${cause instanceof Error ? cause.message : cause}`, true),
		);
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
			write({ jsonrpc: "2.0", id: message.id, result: { tools: TOOLS } });
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
