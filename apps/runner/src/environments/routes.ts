import type { PairingStore } from "./pairing";
import { type Environment, EnvironmentError, type EnvironmentStore } from "./registry";

// How long the home Grid waits on an environment before calling it unreachable.
const REMOTE_TIMEOUT_MS = 10_000;

export type EnvironmentDeps = {
	store: EnvironmentStore;
	/** Validates an address someone typed; see `checkEnvironmentUrl`. */
	checkUrl: (raw: string) => URL;
	fetcher?: typeof fetch;
};

/**
 * The environment side: `POST /pair` trades a one-time code for a pairing, and `DELETE /pair`
 * lets the home Grid end it. Only mounted when this runner takes part in pairing.
 */
export async function pairRequest(
	request: Request,
	url: URL,
	pairing: PairingStore,
): Promise<Response | null> {
	if (url.pathname !== "/pair") return null;
	if (request.method === "POST") {
		const body = (await request.json().catch(() => null)) as {
			code?: unknown;
			label?: unknown;
			ownerId?: unknown;
		} | null;
		if (typeof body?.code !== "string" || typeof body.ownerId !== "string" || !body.ownerId) {
			return failure(400, "Send the pairing code");
		}
		const paired = pairing.pair(
			body.code,
			typeof body.label === "string" ? body.label : "",
			body.ownerId,
		);
		return paired
			? Response.json({ data: paired })
			: failure(403, "That code is wrong or has expired. Make a new one on the environment.");
	}
	if (request.method === "DELETE") {
		const header = request.headers.get("authorization") ?? "";
		const token = header.startsWith("Bearer ") ? header.slice(7) : "";
		return pairing.unpair(token) ? new Response(null, { status: 204 }) : failure(401, "Not paired");
	}
	return failure(405, "Method not allowed");
}

/**
 * The home side: the workspace's environments (adding one with a code, removing one), and which
 * environment each project runs on.
 */
export async function environmentRequest(
	request: Request,
	url: URL,
	workspace: string,
	deps: EnvironmentDeps,
): Promise<Response | null> {
	const fetcher = deps.fetcher ?? fetch;
	if (url.pathname === "/environments/placements" && request.method === "GET") {
		return Response.json({ data: deps.store.placements(workspace) });
	}
	const placement = url.pathname.match(/^\/environments\/placements\/([\w-]+)$/);
	if (placement && request.method === "PUT") {
		const body = (await request.json().catch(() => null)) as { environment?: unknown } | null;
		const environment = body?.environment;
		if (environment !== null && typeof environment !== "string") {
			return failure(400, "Say which environment, or null for this machine");
		}
		try {
			deps.store.place(workspace, placement[1], environment);
			return new Response(null, { status: 204 });
		} catch (cause) {
			return fromError(cause);
		}
	}
	if (url.pathname === "/environments" && request.method === "GET") {
		return Response.json({ data: deps.store.list(workspace) });
	}
	if (url.pathname === "/environments" && request.method === "POST") {
		const body = (await request.json().catch(() => null)) as {
			url?: unknown;
			code?: unknown;
			label?: unknown;
		} | null;
		if (typeof body?.url !== "string" || typeof body.code !== "string") {
			return failure(400, "Send the environment's address and its pairing code");
		}
		try {
			const added = await pairEnvironment(deps, workspace, {
				url: body.url,
				code: body.code,
				label: typeof body.label === "string" ? body.label : "",
			});
			return Response.json({ data: added }, { status: 201 });
		} catch (cause) {
			return fromError(cause);
		}
	}
	const one = url.pathname.match(/^\/environments\/([\w-]+)(\/health)?$/);
	if (!one) return null;
	const [, id, health] = one;
	const target = deps.store.target(workspace, id);
	if (!target) return failure(404, "That environment does not exist");

	if (health && request.method === "GET") {
		try {
			const response = await remote(fetcher, `${target.url}/health`, {});
			return Response.json({ data: { reachable: response.ok } });
		} catch {
			return Response.json({ data: { reachable: false } });
		}
	}
	if (!health && request.method === "DELETE") {
		// End the pairing on the environment too, when it can be reached; forget it here regardless.
		await remote(fetcher, `${target.url}/pair`, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${target.token}` },
		}).catch(() => undefined);
		deps.store.remove(workspace, id);
		return new Response(null, { status: 204 });
	}
	return failure(405, "Method not allowed");
}

/**
 * Pair with an environment: trade its one-time code for a pairing token, and keep it as one of
 * the workspace's environments. Throws `EnvironmentError` with a message worth showing.
 */
export async function pairEnvironment(
	deps: EnvironmentDeps,
	workspace: string,
	input: { url: string; code: string; label: string; codespace?: string },
): Promise<Environment> {
	const origin = deps.checkUrl(input.url).origin;
	const response = await remote(deps.fetcher ?? fetch, `${origin}/pair`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		// The environment keeps its chats and folders under this key: the home workspace. (Named
		// `ownerId` on the wire, as environments paired before workspaces expect.)
		body: JSON.stringify({ code: input.code, label: "Home Grid", ownerId: workspace }),
	});
	const answer = (await response.json().catch(() => null)) as {
		data?: { peerId?: unknown; secret?: unknown };
		message?: string;
	} | null;
	const peerId = answer?.data?.peerId;
	const secret = answer?.data?.secret;
	if (!response.ok || typeof peerId !== "string" || typeof secret !== "string") {
		throw new EnvironmentError(
			answer?.message ?? "The environment did not accept the pairing",
			response.status === 403 ? 403 : 502,
		);
	}
	return deps.store.add(workspace, {
		label: input.label,
		url: origin,
		peerId,
		secret,
		codespace: input.codespace,
	});
}

async function remote(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
	try {
		return await fetcher(url, {
			...init,
			redirect: "error",
			signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
		});
	} catch {
		throw new EnvironmentError(
			"Could not reach the environment. Is it on your tailnet, with its runner running?",
			502,
		);
	}
}

function fromError(cause: unknown): Response {
	if (cause instanceof EnvironmentError) return failure(cause.status, cause.message);
	throw cause;
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
