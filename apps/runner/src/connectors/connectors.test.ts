import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claudeArgs } from "../agents/claude";
import { codexMcpArgs } from "../agents/codex";
import { catalogEntry, GENERIC_CAPABILITIES, initialRules } from "./catalog";
import { probe, stdioTransport } from "./mcp-client";
import { authorizeUrl, discover, exchange, fresh, register } from "./oauth";
import { decide, listed, toolPolicy } from "./rules";
import { Connectors, expandArgs } from "./service";
import { ConnectionStore } from "./store";
import { Vault } from "./vault";

const FAKE = join(import.meta.dir, "testing", "fake-mcp.ts");
const dir = mkdtempSync(join(tmpdir(), "grid-connectors-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("rules", () => {
	const github = catalogEntry("github");
	if (!github) throw new Error("GitHub is in the catalog");
	const rules = initialRules(github.capabilities);

	it("follows each capability's rule, and hides what agents may never use", () => {
		const policy = toolPolicy(github.capabilities, rules, "rules");
		expect(decide(policy, "get_file_contents").rule).toBe("allow");
		expect(decide(policy, "create_pull_request").rule).toBe("allow");
		expect(decide(policy, "merge_pull_request").rule).toBe("ask");
		expect(decide(policy, "delete_repository").rule).toBe("never");
		expect(listed(policy, "delete_repository")).toBe(false);
		expect(listed(policy, "merge_pull_request")).toBe(true);
	});

	it("keeps agents off the default branch and out of repositories not shared", () => {
		const policy = toolPolicy(github.capabilities, rules, "rules", {
			repositories: ["rabtx/grid"],
			defaultBranch: "main",
		});
		expect(
			decide(policy, "push_files", { owner: "rabtx", repo: "grid", branch: "main" }).rule,
		).toBe("never");
		expect(
			decide(policy, "push_files", { owner: "rabtx", repo: "grid", branch: "eta-rounding" }).rule,
		).toBe("allow");
		expect(decide(policy, "get_file_contents", { owner: "rabtx", repo: "school" }).rule).toBe(
			"never",
		);
	});

	it("narrows by agent: reading only, or nothing", () => {
		const read = toolPolicy(github.capabilities, rules, "read");
		expect(decide(read, "list_issues").rule).toBe("allow");
		expect(decide(read, "create_branch").rule).toBe("never");
		expect(listed(read, "create_branch")).toBe(false);
		const off = toolPolicy(github.capabilities, rules, "off");
		expect(decide(off, "list_issues").rule).toBe("never");
	});
});

describe("vault", () => {
	it("keeps secrets encrypted, lists only their names, and forgets with the key", async () => {
		const path = join(dir, "vault.db");
		const vault = new Vault(path, join(dir, "vault.key"));
		await vault.set("ws", "DATABASE_URL", "postgres://secret");
		await vault.set("ws", "connector:abc", "{}");
		expect(await vault.get("ws", "DATABASE_URL")).toBe("postgres://secret");
		expect(vault.names("ws").map((item) => item.name)).toEqual(["DATABASE_URL"]);
		const raw = new ConnectionStore(path);
		void raw;
		const other = new Vault(path, join(dir, "other.key"));
		expect(await other.get("ws", "DATABASE_URL")).toBeNull();
	});
});

describe("mcp client", () => {
	it("says hello to a server on this machine and lists its tools", async () => {
		const result = await probe(stdioTransport([process.execPath, FAKE], {}));
		expect(result.server).toBe("fake");
		expect(result.tools.map((tool) => tool.name)).toEqual([
			"list_tables",
			"query",
			"drop_table",
			"whoami",
		]);
	});

	it("explains when a local MCP command stops before answering", async () => {
		await expect(
			probe(stdioTransport([process.execPath, "-e", "process.exit(1)"], {}), 1_000),
		).rejects.toThrow("The local MCP command stopped before answering");
	});
});

describe("oauth", () => {
	it("discovers the sign-in, registers Grid, signs in with PKCE and renews", async () => {
		const calls: string[] = [];
		const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
			const url = input.toString();
			calls.push(`${init?.method ?? "GET"} ${url}`);
			if (url === "https://mcp.example.com/mcp")
				return new Response(null, {
					status: 401,
					headers: {
						"www-authenticate":
							'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
					},
				});
			if (url.endsWith("/.well-known/oauth-protected-resource/mcp"))
				return Response.json({
					resource: "https://mcp.example.com/mcp",
					authorization_servers: ["https://auth.example.com"],
				});
			if (url === "https://auth.example.com/.well-known/oauth-authorization-server")
				return Response.json({
					authorization_endpoint: "https://auth.example.com/authorize",
					token_endpoint: "https://auth.example.com/token",
					registration_endpoint: "https://auth.example.com/register",
				});
			if (url === "https://auth.example.com/register")
				return Response.json({ client_id: "grid-1" });
			if (url === "https://auth.example.com/token") {
				const form = new URLSearchParams(String(init?.body));
				return Response.json(
					form.get("grant_type") === "refresh_token"
						? { access_token: "renewed", expires_in: 3600 }
						: { access_token: "first", refresh_token: "r1", expires_in: 1 },
				);
			}
			return new Response(null, { status: 404 });
		}) as typeof fetch;

		const auth = await discover("https://mcp.example.com/mcp", fetcher);
		expect(auth.tokenEndpoint).toBe("https://auth.example.com/token");
		const client = await register(
			auth,
			"http://localhost:3011/settings/connectors/callback",
			fetcher,
		);
		const url = new URL(
			authorizeUrl(auth, client, {
				redirectUri: "http://localhost:3011/settings/connectors/callback",
				state: "s1",
				challenge: "c1",
			}),
		);
		expect(url.searchParams.get("client_id")).toBe("grid-1");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
		const grant = await exchange(
			auth,
			client,
			{ code: "code", verifier: "v", redirectUri: "http://localhost:3011/x" },
			fetcher,
		);
		expect(grant.access).toBe("first");
		// One second left: renewed with the refresh token, which it keeps.
		const renewed = await fresh(grant, fetcher);
		expect(renewed.access).toBe("renewed");
		expect(renewed.refresh).toBe("r1");
	});
});

describe("connectors", () => {
	const store = new ConnectionStore(join(dir, "connectors.db"));
	const vault = new Vault(join(dir, "connectors.db"), join(dir, "connectors.key"));
	const asked: string[] = [];
	let answer = true;
	let port = 0;
	const connectors = new Connectors({
		store,
		vault,
		githubToken: async () => null,
		folders: () => ({}),
		ask: async (_thread, question) => {
			asked.push(question.title);
			return answer;
		},
		runnerUrl: () => `http://127.0.0.1:${port}`,
	});
	// The routes a proxy calls, as the runner serves them.
	const server = Bun.serve({
		port: 0,
		async fetch(request) {
			const { connectorProxyRequest } = await import("./routes");
			return (
				(await connectorProxyRequest(request, new URL(request.url), connectors)) ??
				new Response(null, { status: 404 })
			);
		},
	});
	port = server.port ?? 0;
	afterAll(() => void server.stop(true));

	it("adds a server from a command, its secrets from the vault, and checks it", async () => {
		await vault.set("ws", "TOKEN", "s3cret");
		const added = await connectors.addCustom("ws", "u1", {
			name: "Postgres",
			transport: "stdio",
			command: `${process.execPath} ${FAKE}`,
			env: { FAKE_MCP_TOKEN: { secret: "TOKEN" } },
		});
		expect(added.tools).toHaveLength(4);
		expect(added.status).toBe("healthy");
		const view = connectors.view("ws");
		expect(view.connections[0]?.env).toEqual({ FAKE_MCP_TOKEN: { secret: "TOKEN" } });
		expect(JSON.stringify(view)).not.toContain("s3cret");
		await expect(
			connectors.addCustom("ws", "u1", {
				name: "Broken",
				transport: "stdio",
				command: `${process.execPath} ${FAKE}`,
				env: { X: { secret: "MISSING" } },
			}),
		).rejects.toThrow("MISSING");
	});

	it("gives each agent its servers behind the proxy, and none it may not use", () => {
		const [connection] = store.list("ws");
		if (!connection) throw new Error("added above");
		const servers = connectors.serversFor("ws", "claude", "thread-1");
		expect(servers).toHaveLength(1);
		expect(servers[0]?.name).toBe("postgres");
		expect(servers[0]?.env.GRID_CONNECTOR_ID).toBe(connection.id);
		expect(JSON.stringify(servers)).not.toContain("s3cret");
		connectors.update("ws", connection.id, { agents: { codex: "off" } });
		expect(connectors.serversFor("ws", "codex", "thread-1")).toHaveLength(0);
	});

	it("proxies an agent's calls: hides and refuses what is never allowed, asks, and records", async () => {
		const [connection] = store.list("ws");
		if (!connection) throw new Error("added above");
		// Reading goes ahead; changes ask; drop_table is never allowed.
		connectors.update("ws", connection.id, { rules: { read: "allow", write: "ask" } });
		const [spec] = connectors.serversFor("ws", "claude", "thread-1");
		if (!spec) throw new Error("one server");
		const proxy = Bun.spawn([spec.command, ...spec.args], {
			env: { ...process.env, ...spec.env },
			stdin: "pipe",
			stdout: "pipe",
			stderr: "inherit",
		});
		const replies = new Map<number, unknown>();
		void (async () => {
			let buffer = "";
			for await (const chunk of proxy.stdout) {
				buffer += new TextDecoder().decode(chunk);
				let line = buffer.indexOf("\n");
				while (line !== -1) {
					const message = JSON.parse(buffer.slice(0, line)) as { id: number };
					replies.set(message.id, message);
					buffer = buffer.slice(line + 1);
					line = buffer.indexOf("\n");
				}
			}
		})();
		const send = async (id: number, method: string, params: unknown = {}) => {
			proxy.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
			proxy.stdin.flush();
			for (let tries = 0; tries < 200 && !replies.has(id); tries++) await Bun.sleep(10);
			return replies.get(id) as { result: Record<string, unknown> };
		};
		await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {} });
		const tools = (await send(2, "tools/list")).result.tools as { name: string }[];
		expect(tools.map((tool) => tool.name)).toEqual([
			"list_tables",
			"query",
			"drop_table",
			"whoami",
		]);

		connectors.update("ws", connection.id, { rules: { write: "never" } });
		// The proxy reads its rules again when they are old; a fresh proxy sees them at once.
		const read = (await send(3, "tools/call", { name: "list_tables", arguments: {} })).result;
		expect(JSON.stringify(read.content)).toContain("called list_tables");
		proxy.kill();

		const [again] = connectors.serversFor("ws", "claude", "thread-1");
		const second = Bun.spawn([again?.command ?? "", ...(again?.args ?? [])], {
			env: { ...process.env, ...again?.env },
			stdin: "pipe",
			stdout: "pipe",
		});
		const out: string[] = [];
		void (async () => {
			for await (const chunk of second.stdout) out.push(new TextDecoder().decode(chunk));
		})();
		second.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`,
		);
		second.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "drop_table", arguments: {} } })}\n`,
		);
		second.stdin.flush();
		for (let tries = 0; tries < 200 && out.join("").split("\n").length < 3; tries++)
			await Bun.sleep(10);
		const text = out.join("");
		expect(text).toContain('"list_tables"');
		expect(text).not.toContain('"name":"drop_table"');
		expect(text).toContain("Grid does not let agents use drop_table");
		second.kill();

		connectors.update("ws", connection.id, { rules: { write: "ask" } });
		answer = false;
		const [third] = connectors.serversFor("ws", "claude", "thread-1");
		const asking = Bun.spawn([third?.command ?? "", ...(third?.args ?? [])], {
			env: { ...process.env, ...third?.env },
			stdin: "pipe",
			stdout: "pipe",
		});
		const said: string[] = [];
		void (async () => {
			for await (const chunk of asking.stdout) said.push(new TextDecoder().decode(chunk));
		})();
		asking.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "drop_table", arguments: { table: "users" } } })}\n`,
		);
		asking.stdin.flush();
		for (let tries = 0; tries < 200 && said.length === 0; tries++) await Bun.sleep(10);
		expect(said.join("")).toContain("did not allow drop_table");
		expect(asked).toContain("Postgres: drop table");
		asking.kill();

		const activity = connectors.activity("ws", connection.id).map((entry) => entry.outcome);
		expect(activity).toEqual(expect.arrayContaining(["done", "blocked", "denied"]));
	});

	it("records a call before answering it, so an agent that exits takes nothing with it", async () => {
		// The agent reads the reply and its process is gone: the write of the record was fire and
		// forget, so the call went unrecorded whenever the proxy lost that race.
		const [connection] = store.list("ws");
		if (!connection) throw new Error("added above");
		connectors.update("ws", connection.id, { rules: { read: "allow", write: "ask" } });
		const [spec] = connectors.serversFor("ws", "claude", "thread-2");
		if (!spec) throw new Error("one server");
		const proxy = Bun.spawn([spec.command, ...spec.args], {
			env: { ...process.env, ...spec.env },
			stdin: "pipe",
			stdout: "pipe",
			stderr: "inherit",
		});
		const seen: { id: number; method: string }[] = [];
		void (async () => {
			let buffer = "";
			for await (const chunk of proxy.stdout) {
				buffer += new TextDecoder().decode(chunk);
				let line = buffer.indexOf("\n");
				while (line !== -1) {
					const message = JSON.parse(buffer.slice(0, line)) as {
						id: number;
						method?: string;
						result?: { content?: { text?: string }[] };
					};
					seen.push({
						id: message.id,
						method: message.result?.content?.[0]?.text ?? "",
					});
					buffer = buffer.slice(line + 1);
					line = buffer.indexOf("\n");
				}
			}
		})();
		proxy.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } })}\n`,
		);
		proxy.stdin.flush();
		for (let tries = 0; tries < 200 && !seen.some((entry) => entry.id === 1); tries++)
			await Bun.sleep(10);
		proxy.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_tables", arguments: {} } })}\n`,
		);
		proxy.stdin.flush();
		// Kill it the instant it is answered, which is what an agent does when it ends its turn.
		for (let tries = 0; tries < 200 && !seen.some((entry) => entry.id === 2); tries++)
			await Bun.sleep(10);
		proxy.kill();
		await Bun.sleep(50);

		const activity = connectors.activity("ws", connection.id).map((entry) => entry.outcome);
		expect(activity).toContain("done");
	});

	it("fills $VARIABLES into a command's arguments, as a shell would", () => {
		expect(
			expandArgs(["--url", "$DATABASE_URL", "${HOST}:5432", "$MISSING"], {
				DATABASE_URL: "postgres://x",
				HOST: "db",
			}),
		).toEqual(["--url", "postgres://x", "db:5432", "$MISSING"]);
	});

	it("keeps generic rules for servers the catalog does not know", () => {
		expect(initialRules(GENERIC_CAPABILITIES)).toEqual({ read: "allow", write: "ask" });
	});
});

describe("agents get their connectors", () => {
	const servers = [
		{
			name: "postgres",
			command: "/usr/bin/bun",
			args: ["proxy.ts"],
			env: { GRID_CONNECTOR_ID: "c1" },
		},
	];

	it("passes them to Claude Code as --mcp-config", () => {
		const args = claudeArgs("claude", { mcpServers: servers });
		const config = JSON.parse(args[args.indexOf("--mcp-config") + 1] ?? "{}");
		expect(config.mcpServers.postgres).toEqual({
			type: "stdio",
			command: "/usr/bin/bun",
			args: ["proxy.ts"],
			env: { GRID_CONNECTOR_ID: "c1" },
		});
	});

	it("passes them to Codex as config overrides", () => {
		expect(codexMcpArgs(servers)).toEqual([
			"-c",
			'mcp_servers.postgres.command="/usr/bin/bun"',
			"-c",
			'mcp_servers.postgres.args=["proxy.ts"]',
			"-c",
			'mcp_servers.postgres.env={"GRID_CONNECTOR_ID"="c1"}',
		]);
	});
});
