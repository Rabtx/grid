import { ChatError, type ChatHub } from "./hub";

/**
 * Chat over HTTP: which agents exist, and the session list. Returns null for paths it does not
 * own, so the server can try its other routes.
 */
export async function chatRequest(
	request: Request,
	url: URL,
	userId: string,
	hub: ChatHub,
): Promise<Response | null> {
	if (url.pathname === "/chat/providers" && request.method === "GET") {
		return Response.json({ data: await hub.providerList(userId) });
	}
	const provider = url.pathname.match(/^\/chat\/providers\/([\w-]+)\/(refresh|settings)$/);
	if (provider) {
		const [, id, action] = provider;
		if (action === "refresh" && request.method === "POST") {
			return runAsync(async () => Response.json({ data: await hub.refreshProvider(userId, id) }));
		}
		if (action === "settings" && request.method === "PUT") {
			const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
			if (!body || typeof body !== "object") return failure(400, "Send the settings");
			const text = (key: string) =>
				typeof body[key] === "string" && body[key] ? (body[key] as string) : undefined;
			return run(() => {
				hub.setProviderSettings(userId, id, {
					enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
					model: text("model"),
					effort: text("effort"),
					mode: text("mode"),
				});
				return new Response(null, { status: 204 });
			});
		}
		return failure(405, "Method not allowed");
	}
	if (url.pathname === "/chat/sessions" && request.method === "GET") {
		const project = url.searchParams.get("project");
		if (!project) return failure(400, "Say which project");
		return Response.json({ data: hub.list(userId, project) });
	}
	if (url.pathname === "/chat/sessions" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (typeof body.project !== "string" || typeof body.provider !== "string") {
			return failure(400, "Say which project and which agent");
		}
		return run(() =>
			Response.json(
				{
					data: hub.create(userId, {
						project: body.project as string,
						provider: body.provider as string,
						cwd: typeof body.cwd === "string" ? body.cwd : undefined,
						model: typeof body.model === "string" ? body.model : undefined,
						mode: typeof body.mode === "string" ? body.mode : undefined,
						effort: typeof body.effort === "string" ? body.effort : undefined,
					}),
				},
				{ status: 201 },
			),
		);
	}
	const match = url.pathname.match(/^\/chat\/sessions\/([\w-]+)$/);
	if (match) {
		const id = match[1];
		if (request.method === "DELETE") {
			return run(() => {
				hub.delete(userId, id);
				return new Response(null, { status: 204 });
			});
		}
		if (request.method === "PATCH") {
			const body = (await request.json().catch(() => ({}))) as { title?: unknown };
			if (typeof body.title !== "string") return failure(400, "Nothing to change");
			return run(() => {
				hub.rename(userId, id, body.title as string);
				return new Response(null, { status: 204 });
			});
		}
		return failure(405, "Method not allowed");
	}
	return null;
}

/** What the console sends on a chat socket after hello. */
export type ChatCommand =
	| { t: "prompt"; text: string }
	| { t: "cancel" }
	| { t: "approve"; id: string; optionId: string | null }
	| { t: "configure"; model?: string; mode?: string; effort?: string };

export function chatCommand(
	hub: ChatHub,
	userId: string,
	sessionId: string,
	command: ChatCommand,
	reportError: (message: string) => void,
): void {
	const fail = (cause: unknown) =>
		reportError(cause instanceof Error ? cause.message : String(cause));
	try {
		if (command.t === "prompt" && typeof command.text === "string") {
			hub.prompt(userId, sessionId, command.text).catch(fail);
		} else if (command.t === "cancel") {
			hub.cancel(userId, sessionId);
		} else if (command.t === "approve" && typeof command.id === "string") {
			hub.approve(
				userId,
				sessionId,
				command.id,
				typeof command.optionId === "string" ? command.optionId : null,
			);
		} else if (command.t === "configure") {
			hub
				.configure(userId, sessionId, {
					model: typeof command.model === "string" ? command.model : undefined,
					mode: typeof command.mode === "string" ? command.mode : undefined,
					effort: typeof command.effort === "string" ? command.effort : undefined,
				})
				.catch(fail);
		}
	} catch (cause) {
		fail(cause);
	}
}

function run(respond: () => Response): Response {
	try {
		return respond();
	} catch (cause) {
		if (cause instanceof ChatError) return failure(cause.status, cause.message);
		throw cause;
	}
}

async function runAsync(respond: () => Promise<Response>): Promise<Response> {
	try {
		return await respond();
	} catch (cause) {
		if (cause instanceof ChatError) return failure(cause.status, cause.message);
		throw cause;
	}
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
