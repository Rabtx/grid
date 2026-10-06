import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConnectorError, Connectors } from "./service";
import { ConnectionStore } from "./store";
import { Vault } from "./vault";

const dir = mkdtempSync(join(tmpdir(), "grid-connector-sign-in-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const MCP = "https://mcp.linear.app/mcp";
const AUTH = "https://auth.example.com";

/**
 * A service's MCP server and its authorization server, as the runner meets them. `accepts` says
 * which addresses to come back to its registration takes, the way real servers differ.
 */
function service(accepts: (redirect: string) => boolean | "approved-only") {
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = input.toString();
		const headers = new Headers(init?.headers);
		if (url === MCP && !headers.get("authorization"))
			return new Response(null, {
				status: 401,
				headers: {
					"www-authenticate": `Bearer resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp"`,
				},
			});
		if (url === MCP) {
			const message = JSON.parse(String(init?.body)) as { id?: number; method: string };
			if (message.id === undefined) return new Response(null, { status: 202 });
			const result =
				message.method === "initialize"
					? { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake" } }
					: { tools: [{ name: "list_issues", description: "", inputSchema: { type: "object" } }] };
			return Response.json({ jsonrpc: "2.0", id: message.id, result });
		}
		if (url.endsWith("/.well-known/oauth-protected-resource/mcp"))
			return Response.json({ resource: MCP, authorization_servers: [AUTH] });
		if (url === `${AUTH}/.well-known/oauth-authorization-server`)
			return Response.json({
				authorization_endpoint: `${AUTH}/authorize`,
				token_endpoint: `${AUTH}/token`,
				registration_endpoint: `${AUTH}/register`,
			});
		if (url === `${AUTH}/register`) {
			const redirect = (JSON.parse(String(init?.body)) as { redirect_uris: string[] })
				.redirect_uris[0];
			const verdict = accepts(redirect ?? "");
			if (verdict === "approved-only")
				return new Response("not an approved client", { status: 403 });
			if (!verdict)
				return Response.json(
					{
						error: "invalid_redirect_uri",
						error_description: "The provided redirect URIs are not approved",
					},
					{ status: 400 },
				);
			return Response.json({ client_id: "grid-client" });
		}
		if (url === `${AUTH}/token`) return Response.json({ access_token: "access", expires_in: 3600 });
		return new Response(null, { status: 404 });
	}) as typeof fetch;
}

function connectors(fetcher: typeof fetch, name: string): Connectors {
	return new Connectors({
		store: new ConnectionStore(join(dir, `${name}.db`)),
		vault: new Vault(join(dir, `${name}.db`), join(dir, `${name}.key`)),
		githubToken: async () => null,
		folders: () => ({}),
		ask: async () => true,
		runnerUrl: () => "http://127.0.0.1:4100",
		fetcher,
	});
}

const PHONE = "https://grid.tail1234.ts.net:8443/oauth/callback";

describe("connector sign-in from its own window", () => {
	it("finishes in the window it came back to, and the dialog collects the result once", async () => {
		const grid = connectors(
			service(() => true),
			"window",
		);
		const started = await grid.startSignIn("w1", "u1", { service: "linear", redirectUri: PHONE });
		expect(grid.signInOutcome("w1", started.state)).toEqual({ status: "waiting" });

		// The callback page is not signed in to Grid: the state alone finishes it.
		expect(await grid.completeSignIn(started.state, { code: "code", error: null })).toEqual({
			name: "Linear",
		});
		const outcome = grid.signInOutcome("w1", started.state);
		expect(outcome.status).toBe("done");
		if (outcome.status === "done")
			expect(outcome.tools.map((tool) => tool.name)).toEqual(["list_issues"]);
		// Handed over once; and a state cannot be used twice.
		expect(grid.signInOutcome("w1", started.state).status).toBe("failed");
		await expect(grid.completeSignIn(started.state, { code: "code", error: null })).rejects.toThrow(
			"expired",
		);
	});

	it("keeps one workspace's sign-in from another", async () => {
		const grid = connectors(
			service(() => true),
			"workspaces",
		);
		const started = await grid.startSignIn("w1", "u1", { service: "linear", redirectUri: PHONE });
		await grid.completeSignIn(started.state, { code: "code", error: null });
		expect(grid.signInOutcome("w2", started.state).status).toBe("failed");
		expect(grid.signInOutcome("w1", started.state).status).toBe("done");
	});

	it("reports a sign-in the person turned down", async () => {
		const grid = connectors(
			service(() => true),
			"declined",
		);
		const started = await grid.startSignIn("w1", "u1", { service: "linear", redirectUri: PHONE });
		await expect(
			grid.completeSignIn(started.state, { code: null, error: "access_denied" }),
		).rejects.toThrow("access_denied");
		expect(grid.signInOutcome("w1", started.state)).toEqual({
			status: "failed",
			message: "access_denied",
		});
	});

	it("refuses a made-up state", async () => {
		const grid = connectors(
			service(() => true),
			"made-up",
		);
		await expect(
			grid.completeSignIn("not-a-real-state-at-all", { code: "c", error: null }),
		).rejects.toThrow(ConnectorError);
	});
});

describe("services that turn down the address to come back to", () => {
	it("says to connect from the computer Grid runs on when only loopback is accepted", async () => {
		const loopbackOnly = (uri: string) => new URL(uri).hostname === "localhost";
		const grid = connectors(service(loopbackOnly), "loopback");
		await expect(
			grid.startSignIn("w1", "u1", { service: "linear", redirectUri: PHONE }),
		).rejects.toThrow("only accepts sign-ins from the computer Grid runs on");
		// From that computer it works.
		const started = await grid.startSignIn("w1", "u1", {
			service: "linear",
			redirectUri: "http://localhost:3001/oauth/callback",
		});
		expect(started.url).toContain(`${AUTH}/authorize`);
	});

	it("says plainly when the service takes only apps it approved", async () => {
		const grid = connectors(
			service(() => "approved-only"),
			"approved",
		);
		await expect(
			grid.startSignIn("w1", "u1", { service: "linear", redirectUri: PHONE }),
		).rejects.toThrow("only lets apps it has approved itself");
	});
});
