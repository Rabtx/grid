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
		return Response.json({ data: hub.providerList() });
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
	| { t: "configure"; model?: string; mode?: string };

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

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
