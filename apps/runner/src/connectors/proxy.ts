/**
 * Grid's stand-in for a connected MCP server, started by an agent as one of its MCP servers
 * (`bun proxy.ts`, over stdin and stdout). It asks the runner where the real server is and what
 * this agent may do there, then passes messages through: tools the agent may never use are not
 * listed and are refused if called anyway, a tool set to "Ask me" waits for the person in the
 * thread, and every call is written to the connector's activity.
 *
 * It holds no secrets of its own: the runner hands it the server's address and a fresh token
 * when it needs one, against the key the runner gave it.
 */
import { decide, listed, type ToolPolicy } from "./rules";
import { httpTransport, type JsonRpc, stdioTransport, type Transport } from "./mcp-client";

type Config = {
	name: string;
	transport: "http" | "stdio";
	url: string | null;
	command: string[] | null;
	env: Record<string, string>;
	policy: ToolPolicy;
};

const runner = process.env.GRID_RUNNER_URL ?? "";
const key = process.env.GRID_CONNECTOR_KEY ?? "";
const id = process.env.GRID_CONNECTOR_ID ?? "";
const agent = process.env.GRID_CONNECTOR_AGENT ?? "agent";
const thread = process.env.GRID_CONNECTOR_THREAD ?? null;

// The rules are read again this often, so a change in Settings reaches a thread already going.
const POLICY_TTL_MS = 30_000;

async function ask<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${runner}/connectors/proxy/${encodeURIComponent(id)}${path}`, {
		...init,
		headers: { "x-grid-connector-key": key, "content-type": "application/json", ...init.headers },
	});
	const body = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
	if (!response.ok) throw new Error(body?.message ?? `The runner answered ${response.status}`);
	return body?.data as T;
}

function write(message: JsonRpc): void {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function refusal(requestId: JsonRpc["id"], text: string): JsonRpc {
	return {
		jsonrpc: "2.0",
		id: requestId,
		result: { content: [{ type: "text", text }], isError: true },
	};
}

async function main(): Promise<void> {
	let config = await ask<Config>(`?agent=${encodeURIComponent(agent)}`);
	let loadedAt = Date.now();
	const policy = async (): Promise<ToolPolicy> => {
		if (Date.now() - loadedAt > POLICY_TTL_MS) {
			try {
				config = await ask<Config>(`?agent=${encodeURIComponent(agent)}`);
				loadedAt = Date.now();
			} catch {
				// The runner is away for a moment: the rules last read still hold.
			}
		}
		return config.policy;
	};

	const upstream: Transport =
		config.transport === "http"
			? httpTransport(config.url ?? "", () => ask<string | null>("/token"))
			: stdioTransport(config.command ?? [], config.env, write);

	const record = (tool: string, outcome: "done" | "blocked" | "denied" | "failed") =>
		void ask("/activity", {
			method: "POST",
			body: JSON.stringify({ agent, thread, tool, outcome }),
		}).catch(() => undefined);

	async function forward(message: JsonRpc, filter?: (message: JsonRpc) => JsonRpc): Promise<void> {
		try {
			for await (const reply of upstream.send(message)) write(filter ? filter(reply) : reply);
		} catch (cause) {
			if (message.id !== undefined && message.method)
				write({
					jsonrpc: "2.0",
					id: message.id,
					error: { code: -32000, message: cause instanceof Error ? cause.message : String(cause) },
				});
		}
	}

	async function handle(message: JsonRpc): Promise<void> {
		if (message.method === "tools/list") {
			const rules = await policy();
			await forward(message, (reply) => {
				const result = reply.result as { tools?: { name: string }[] } | undefined;
				if (reply.id !== message.id || !result?.tools) return reply;
				return {
					...reply,
					result: { ...result, tools: result.tools.filter((tool) => listed(rules, tool.name)) },
				};
			});
			return;
		}
		if (message.method === "tools/call") {
			const params = (message.params ?? {}) as {
				name?: string;
				arguments?: Record<string, unknown>;
			};
			const tool = params.name ?? "";
			const decision = decide(await policy(), tool, params.arguments ?? {});
			if (decision.rule === "never") {
				record(tool, "blocked");
				write(
					refusal(
						message.id,
						`Grid does not let agents use ${tool} on ${config.name}${decision.reason ? `: ${decision.reason}` : ""}. Change it in Settings → Connectors.`,
					),
				);
				return;
			}
			if (decision.rule === "ask") {
				const detail = JSON.stringify(params.arguments ?? {}, null, 2).slice(0, 1500);
				const allowed = await ask<boolean>("/ask", {
					method: "POST",
					body: JSON.stringify({ thread, tool, detail }),
				}).catch(() => false);
				if (!allowed) {
					record(tool, "denied");
					write(refusal(message.id, `The person did not allow ${tool} on ${config.name}.`));
					return;
				}
			}
			let failed = false;
			await forward(message, (reply) => {
				if (
					reply.id === message.id &&
					(reply.error || (reply.result as { isError?: boolean })?.isError)
				)
					failed = true;
				return reply;
			});
			record(tool, failed ? "failed" : "done");
			return;
		}
		await forward(message);
	}

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
					// Each message on its own: a long call does not hold up the rest.
					void handle(JSON.parse(text) as JsonRpc);
				} catch {
					// Not JSON; nothing to pass on.
				}
			}
			line = buffer.indexOf("\n");
		}
	}
	upstream.close();
}

if (import.meta.main) {
	main().catch((cause: unknown) => {
		process.stderr.write(`[grid connector] ${cause instanceof Error ? cause.message : cause}\n`);
		process.exit(1);
	});
}
