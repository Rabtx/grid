/**
 * A tiny MCP server for tests, over stdin and stdout: it lists four tools and answers a call with
 * the tool's name. `FAKE_MCP_TOKEN` in its environment is echoed back by `whoami`.
 */
const TOOLS = ["list_tables", "query", "drop_table", "whoami"].map((name) => ({
	name,
	description: `The ${name} tool`,
	inputSchema: { type: "object" },
}));

function reply(id: unknown, result: unknown): void {
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

async function serve(): Promise<void> {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of process.stdin) {
		buffer += decoder.decode(chunk as Uint8Array, { stream: true });
		let line = buffer.indexOf("\n");
		while (line !== -1) {
			const text = buffer.slice(0, line).trim();
			buffer = buffer.slice(line + 1);
			line = buffer.indexOf("\n");
			if (!text) continue;
			const message = JSON.parse(text) as {
				id?: unknown;
				method?: string;
				params?: { name?: string };
			};
			if (message.method === "initialize")
				reply(message.id, {
					protocolVersion: "2025-06-18",
					capabilities: { tools: {} },
					serverInfo: { name: "fake", version: "1" },
				});
			else if (message.method === "tools/list") reply(message.id, { tools: TOOLS });
			else if (message.method === "tools/call")
				reply(message.id, {
					content: [
						{
							type: "text",
							text:
								message.params?.name === "whoami"
									? (process.env.FAKE_MCP_TOKEN ?? "nobody")
									: `called ${message.params?.name}`,
						},
					],
				});
		}
	}
}

void serve();
