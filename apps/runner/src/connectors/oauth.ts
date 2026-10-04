/**
 * Signing in to a remote MCP server the way the MCP spec lays out: the server names its
 * authorization server (RFC 9728), that server describes itself (RFC 8414), Grid registers itself
 * as a client there (RFC 7591) and signs the person in with a code and PKCE, then keeps the token
 * fresh with the refresh token.
 */

export type ServerAuth = {
	resource: string;
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint: string | null;
	scope: string | null;
};

export type Client = { clientId: string; clientSecret: string | null };

export type Tokens = {
	access: string;
	refresh: string | null;
	/** When the access token runs out, or null for one that does not say. */
	expiresAt: string | null;
};

/** Everything kept to use and renew a sign-in, encrypted in the vault. */
export type Grant = Tokens & {
	tokenEndpoint: string;
	client: Client;
	resource: string;
};

export class OAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OAuthError";
	}
}

function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

export function randomToken(bytes = 32): string {
	return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function challengeFor(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

async function json(response: Response, what: string): Promise<Record<string, unknown>> {
	const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
	if (!response.ok || !body) {
		const detail = typeof body?.error_description === "string" ? `: ${body.error_description}` : "";
		throw new OAuthError(`${what} failed (${response.status})${detail}`);
	}
	return body;
}

/** Where a well-known document lives for a URL with a path (RFC 8414 §3, RFC 9728 §3). */
function wellKnown(url: string, name: string): string[] {
	const parsed = new URL(url);
	const path = parsed.pathname.replace(/\/$/, "");
	const origin = parsed.origin;
	return path && path !== "/"
		? [`${origin}/.well-known/${name}${path}`, `${origin}/.well-known/${name}`]
		: [`${origin}/.well-known/${name}`];
}

async function firstJson(
	urls: string[],
	fetcher: typeof fetch,
): Promise<Record<string, unknown> | null> {
	for (const url of urls) {
		const response = await fetcher(url, { headers: { accept: "application/json" } }).catch(
			() => null,
		);
		if (response?.ok) {
			const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
			if (body) return body;
		}
	}
	return null;
}

/** How a server signs people in, from its 401 and the documents it points to. */
export async function discover(url: string, fetcher: typeof fetch = fetch): Promise<ServerAuth> {
	const probe = await fetcher(url, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }),
	}).catch(() => null);
	const challenge = probe?.headers.get("www-authenticate") ?? "";
	const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
	const challengeScope = /scope="([^"]+)"/.exec(challenge)?.[1] ?? null;
	const resourceMeta = await firstJson(
		metadataUrl ? [metadataUrl] : wellKnown(url, "oauth-protected-resource"),
		fetcher,
	);
	const servers = resourceMeta?.authorization_servers;
	const issuer =
		Array.isArray(servers) && typeof servers[0] === "string" ? servers[0] : new URL(url).origin;
	const meta = await firstJson(
		[
			...wellKnown(issuer, "oauth-authorization-server"),
			...wellKnown(issuer, "openid-configuration"),
		],
		fetcher,
	);
	if (
		!meta ||
		typeof meta.authorization_endpoint !== "string" ||
		typeof meta.token_endpoint !== "string"
	)
		throw new OAuthError("This server does not say how to sign in");
	return {
		resource: typeof resourceMeta?.resource === "string" ? resourceMeta.resource : url,
		issuer,
		authorizationEndpoint: meta.authorization_endpoint,
		tokenEndpoint: meta.token_endpoint,
		registrationEndpoint:
			typeof meta.registration_endpoint === "string" ? meta.registration_endpoint : null,
		scope: challengeScope,
	};
}

/** Grid as a client of that server, for one address to come back to. */
export async function register(
	auth: ServerAuth,
	redirectUri: string,
	fetcher: typeof fetch = fetch,
): Promise<Client> {
	if (!auth.registrationEndpoint)
		throw new OAuthError("This server needs an app registered by hand; use an API key instead");
	const body = await json(
		await fetcher(auth.registrationEndpoint, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				client_name: "Grid",
				redirect_uris: [redirectUri],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: "none",
			}),
		}),
		"Registering Grid",
	);
	if (typeof body.client_id !== "string") throw new OAuthError("The server gave Grid no client id");
	return {
		clientId: body.client_id,
		clientSecret: typeof body.client_secret === "string" ? body.client_secret : null,
	};
}

export function authorizeUrl(
	auth: ServerAuth,
	client: Client,
	input: { redirectUri: string; state: string; challenge: string },
): string {
	const url = new URL(auth.authorizationEndpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", client.clientId);
	url.searchParams.set("redirect_uri", input.redirectUri);
	url.searchParams.set("state", input.state);
	url.searchParams.set("code_challenge", input.challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("resource", auth.resource);
	if (auth.scope) url.searchParams.set("scope", auth.scope);
	return url.toString();
}

function tokensFrom(body: Record<string, unknown>, previous?: string | null): Tokens {
	if (typeof body.access_token !== "string") throw new OAuthError("The server gave no token");
	const seconds = typeof body.expires_in === "number" ? body.expires_in : null;
	return {
		access: body.access_token,
		refresh: typeof body.refresh_token === "string" ? body.refresh_token : (previous ?? null),
		expiresAt: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null,
	};
}

async function tokenRequest(
	endpoint: string,
	client: Client,
	fields: Record<string, string>,
	fetcher: typeof fetch,
	what: string,
): Promise<Record<string, unknown>> {
	const form = new URLSearchParams({ ...fields, client_id: client.clientId });
	if (client.clientSecret) form.set("client_secret", client.clientSecret);
	return json(
		await fetcher(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
			body: form,
		}),
		what,
	);
}

export async function exchange(
	auth: ServerAuth,
	client: Client,
	input: { code: string; verifier: string; redirectUri: string },
	fetcher: typeof fetch = fetch,
): Promise<Grant> {
	const body = await tokenRequest(
		auth.tokenEndpoint,
		client,
		{
			grant_type: "authorization_code",
			code: input.code,
			code_verifier: input.verifier,
			redirect_uri: input.redirectUri,
			resource: auth.resource,
		},
		fetcher,
		"Signing in",
	);
	return {
		...tokensFrom(body),
		tokenEndpoint: auth.tokenEndpoint,
		client,
		resource: auth.resource,
	};
}

/** A grant with a token good for at least another minute, renewed when it needs to be. */
export async function fresh(grant: Grant, fetcher: typeof fetch = fetch): Promise<Grant> {
	const expires = grant.expiresAt ? Date.parse(grant.expiresAt) : null;
	if (!expires || expires - Date.now() > 60_000) return grant;
	if (!grant.refresh) throw new OAuthError("The sign-in ran out: sign in again");
	const body = await tokenRequest(
		grant.tokenEndpoint,
		grant.client,
		{ grant_type: "refresh_token", refresh_token: grant.refresh, resource: grant.resource },
		fetcher,
		"Renewing the sign-in",
	);
	return { ...grant, ...tokensFrom(body, grant.refresh) };
}
