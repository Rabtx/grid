import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import type { Rule } from "./catalog";
import type { AgentAccess } from "./rules";
import { ConnectorError, type Connectors, type CustomServer } from "./service";

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

async function body<T>(request: Request): Promise<T> {
	return ((await request.json().catch(() => null)) ?? {}) as T;
}

const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function customServer(value: unknown): CustomServer {
	const raw = (value ?? {}) as Record<string, unknown>;
	const env: CustomServer["env"] = {};
	if (raw.env && typeof raw.env === "object") {
		for (const [key, item] of Object.entries(raw.env as Record<string, unknown>)) {
			if (!SECRET_NAME.test(key)) throw new ConnectorError(`${key} is not a variable name`);
			const entry = item as { secret?: unknown; value?: unknown };
			if (typeof entry?.secret === "string") env[key] = { secret: entry.secret };
			else if (typeof entry?.value === "string") env[key] = { value: entry.value };
		}
	}
	return {
		name: typeof raw.name === "string" ? raw.name : "",
		transport: raw.transport === "http" ? "http" : "stdio",
		url: typeof raw.url === "string" ? raw.url.trim() : undefined,
		command: typeof raw.command === "string" ? raw.command.trim() : undefined,
		env,
		key: typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : undefined,
	};
}

/**
 * Settings → Connectors over HTTP: `GET /connectors` (the catalog, what is connected, the vault's
 * secret names); signing in (`POST /connectors/sign-in`, `/sign-in/finish`, `/key`, `/github-cli`);
 * adding (`POST /connectors`) and trying (`POST /connectors/test`) a server; one connector
 * (`GET`/`PATCH`/`DELETE /connectors/:id`, `POST /connectors/:id/test`); and secrets (`POST
 * /secrets`, `DELETE /secrets/:name`). Reading is everyone's; changing takes a role that may
 * manage integrations (Settings → Roles).
 */
export async function connectorRequest(
	request: Request,
	url: URL,
	who: Who,
	connectors: Connectors,
): Promise<Response | null> {
	const path = url.pathname;
	if (!(path === "/connectors" || path.startsWith("/connectors/") || path.startsWith("/secrets")))
		return null;
	const { workspace, userId } = who;
	const changing = request.method !== "GET";
	if (changing && !may(who, "integrations")) return failure(403, NOT_ALLOWED);
	try {
		if (path === "/connectors" && request.method === "GET")
			return Response.json({ data: connectors.view(workspace) });

		if (path === "/connectors/sign-in" && request.method === "POST") {
			const input = await body<{ service?: string; url?: string; redirectUri?: string }>(request);
			if (typeof input.redirectUri !== "string" || !/^https?:\/\//.test(input.redirectUri))
				return failure(400, "Say where to come back to");
			return Response.json({
				data: await connectors.startSignIn(workspace, userId, {
					service: input.service,
					url: input.url,
					redirectUri: input.redirectUri,
				}),
			});
		}
		if (path === "/connectors/sign-in/outcome" && request.method === "GET") {
			const state = url.searchParams.get("state");
			if (!state) return failure(400, "Say which sign-in");
			return Response.json({ data: connectors.signInOutcome(workspace, state) });
		}
		if (path === "/connectors/sign-in/finish" && request.method === "POST") {
			const input = await body<{ state?: string; code?: string }>(request);
			if (typeof input.state !== "string" || typeof input.code !== "string")
				return failure(400, "Missing the sign-in's code");
			return Response.json({
				data: await connectors.finishSignIn(workspace, input.state, input.code),
			});
		}
		if (path === "/connectors/key" && request.method === "POST") {
			const input = await body<{ service?: string; url?: string; key?: string }>(request);
			if (typeof input.key !== "string" || !input.key.trim()) return failure(400, "Paste the key");
			return Response.json({
				data: await connectors.useKey(workspace, {
					service: input.service,
					url: input.url,
					key: input.key,
				}),
			});
		}
		if (path === "/connectors/github-cli" && request.method === "POST")
			return Response.json({ data: await connectors.useGithubCli(workspace) });

		if (path === "/connectors/test" && request.method === "POST") {
			const input = await body<{ server?: unknown }>(request);
			return Response.json({
				data: await connectors.testCustom(workspace, customServer(input.server)),
			});
		}
		if (path === "/connectors" && request.method === "POST") {
			const input = await body<{
				service?: string;
				grant?: string;
				rules?: Record<string, Rule>;
				server?: unknown;
			}>(request);
			const added =
				input.server !== undefined
					? await connectors.addCustom(workspace, userId, customServer(input.server))
					: typeof input.service === "string" && typeof input.grant === "string"
						? await connectors.addService(workspace, userId, {
								service: input.service,
								grant: input.grant,
								rules: input.rules,
							})
						: null;
			if (!added) return failure(400, "Say what to connect");
			return Response.json({ data: connectors.connectionView(added) }, { status: 201 });
		}

		if (path === "/secrets" && request.method === "POST") {
			const input = await body<{ name?: string; value?: string }>(request);
			if (typeof input.name !== "string" || !SECRET_NAME.test(input.name))
				return failure(400, "Name it with letters, digits and underscores");
			if (typeof input.value !== "string" || !input.value) return failure(400, "Give its value");
			await connectors.saveSecret(workspace, input.name, input.value);
			return new Response(null, { status: 204 });
		}
		const secret = path.match(/^\/secrets\/([A-Za-z0-9_]+)$/);
		if (secret && request.method === "DELETE") {
			connectors.deleteSecret(workspace, secret[1] ?? "");
			return new Response(null, { status: 204 });
		}

		const one = path.match(/^\/connectors\/([A-Za-z0-9_-]+)(\/test)?$/);
		if (one) {
			const [, id = "", test] = one;
			if (test && request.method === "POST")
				return Response.json({
					data: connectors.connectionView(await connectors.test(workspace, id)),
				});
			if (request.method === "GET") {
				const connection = connectors.get(workspace, id);
				return Response.json({
					data: {
						connection: connectors.connectionView(connection),
						activity: connectors.activity(workspace, id),
						repositories:
							connection.kind === "github" ? connectors.repositories(workspace, id) : null,
						agentsWithoutConnectors: connectors.view(workspace).agentsWithoutConnectors,
					},
				});
			}
			if (request.method === "PATCH") {
				const input = await body<{
					enabled?: boolean;
					name?: string;
					rules?: Record<string, Rule>;
					agents?: Record<string, AgentAccess | null>;
					hiddenRepositories?: string[];
				}>(request);
				return Response.json({
					data: connectors.connectionView(connectors.update(workspace, id, input)),
				});
			}
			if (request.method === "DELETE") {
				connectors.remove(workspace, id);
				return new Response(null, { status: 204 });
			}
		}
		return failure(404, "Not found");
	} catch (cause) {
		if (cause instanceof ConnectorError) return failure(cause.status, cause.message);
		throw cause;
	}
}

/**
 * What an agent's proxy asks of the runner (`/connectors/proxy/:id…`), proved with the key the
 * runner gave it rather than a person's sign-in: the server and its rules, a token, a question
 * for the person, and what it did.
 */
export async function connectorProxyRequest(
	request: Request,
	url: URL,
	connectors: Connectors,
): Promise<Response | null> {
	const match = url.pathname.match(
		/^\/connectors\/proxy\/([A-Za-z0-9_-]+)(\/(token|activity|ask))?$/,
	);
	if (!match) return null;
	if (request.headers.get("x-grid-connector-key") !== connectors.proxyKey)
		return failure(401, "Not one of this runner's agents");
	const [, id = "", , action] = match;
	try {
		if (!action && request.method === "GET")
			return Response.json({
				data: await connectors.proxyConfig(id, url.searchParams.get("agent") ?? "agent"),
			});
		if (action === "token" && request.method === "GET")
			return Response.json({ data: await connectors.proxyToken(id) });
		if (action === "activity" && request.method === "POST") {
			const input = await body<{
				agent?: string;
				thread?: string | null;
				tool?: string;
				outcome?: string;
			}>(request);
			const outcome = ["done", "blocked", "denied", "failed"].includes(input.outcome ?? "")
				? (input.outcome as "done" | "blocked" | "denied" | "failed")
				: "done";
			connectors.proxyActivity(id, {
				agent: String(input.agent ?? "agent").slice(0, 60),
				thread: typeof input.thread === "string" ? input.thread : null,
				tool: String(input.tool ?? "").slice(0, 120),
				outcome,
			});
			return new Response(null, { status: 204 });
		}
		if (action === "ask" && request.method === "POST") {
			const input = await body<{ thread?: string | null; tool?: string; detail?: string }>(request);
			return Response.json({
				data: await connectors.proxyAsk(
					id,
					typeof input.thread === "string" ? input.thread : null,
					String(input.tool ?? ""),
					String(input.detail ?? "").slice(0, 2000),
				),
			});
		}
		return failure(404, "Not found");
	} catch (cause) {
		if (cause instanceof ConnectorError) return failure(cause.status, cause.message);
		return failure(502, cause instanceof Error ? cause.message : "The connector failed");
	}
}

/**
 * `POST /connectors/sign-in/callback`: the sign-in window's own page hands back the code. It is not
 * signed in to Grid (it may be a different browser from the one that started), so the sign-in's
 * single-use state is what proves it. Answers only with the service's name, never the grant.
 */
export async function connectorCallbackRequest(
	request: Request,
	url: URL,
	connectors: Connectors,
): Promise<Response | null> {
	if (url.pathname !== "/connectors/sign-in/callback" || request.method !== "POST") return null;
	const input = await body<{ state?: unknown; code?: unknown; error?: unknown }>(request);
	if (typeof input.state !== "string" || input.state.length < 16)
		return failure(400, "This page did not come from a Grid sign-in");
	try {
		return Response.json({
			data: await connectors.completeSignIn(input.state, {
				code: typeof input.code === "string" ? input.code : null,
				error: typeof input.error === "string" ? input.error.slice(0, 300) : null,
			}),
		});
	} catch (cause) {
		if (cause instanceof ConnectorError) return failure(cause.status, cause.message);
		throw cause;
	}
}
