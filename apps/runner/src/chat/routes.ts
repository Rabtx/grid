import type { Who } from "../auth";
import { ChatError, type ChatHub } from "./hub";

/**
 * Chat over HTTP: which agents exist, and the session list. Returns null for paths it does not
 * own, so the server can try its other routes.
 */
export async function chatRequest(
	request: Request,
	url: URL,
	who: Who,
	hub: ChatHub,
): Promise<Response | null> {
	const { userId, workspace } = who;
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
	if (url.pathname === "/chat/running" && request.method === "GET") {
		return Response.json({ data: hub.running(workspace) });
	}
	if (url.pathname === "/chat/sessions" && request.method === "GET") {
		const project = url.searchParams.get("project");
		if (!project) return failure(400, "Say which project");
		return Response.json({ data: hub.list(workspace, project) });
	}
	if (url.pathname === "/chat/sessions" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (typeof body.project !== "string" || typeof body.provider !== "string") {
			return failure(400, "Say which project and which agent");
		}
		return run(() =>
			Response.json(
				{
					data: hub.create(who, {
						project: body.project as string,
						provider: body.provider as string,
						cwd: typeof body.cwd === "string" ? body.cwd : undefined,
						model: typeof body.model === "string" ? body.model : undefined,
						mode: typeof body.mode === "string" ? body.mode : undefined,
						effort: typeof body.effort === "string" ? body.effort : undefined,
						worktree: typeof body.worktree === "boolean" ? body.worktree : undefined,
						branch: typeof body.branch === "string" ? body.branch : undefined,
					}),
				},
				{ status: 201 },
			),
		);
	}
	// A project's chat settings on this machine: whether new chats get their own worktree.
	const settings = url.pathname.match(/^\/chat\/projects\/([a-z0-9-]+)\/settings$/);
	if (settings && request.method === "GET") {
		return Response.json({ data: hub.projectSettings(workspace, settings[1]) });
	}
	if (settings && request.method === "PUT") {
		const body = (await request.json().catch(() => ({}))) as { worktrees?: unknown };
		if (typeof body.worktrees !== "boolean") return failure(400, "Say whether to use worktrees");
		hub.setProjectSettings(workspace, settings[1], { worktrees: body.worktrees });
		return new Response(null, { status: 204 });
	}
	// Every worktree of the workspace (Settings → Worktrees), removing one, and cleaning up.
	if (url.pathname === "/chat/worktrees" && request.method === "GET") {
		return run(() => Response.json({ data: hub.worktrees(workspace) }));
	}
	if (url.pathname === "/chat/worktrees/remove" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (typeof body.path !== "string") return failure(400, "Say which worktree");
		return run(() => {
			hub.removeWorktreeAt(workspace, body.path as string, {
				deleteBranch: body.deleteBranch === true,
				force: body.force === true,
			});
			return new Response(null, { status: 204 });
		});
	}
	if (url.pathname === "/chat/worktrees/clean" && request.method === "POST") {
		return run(() => Response.json({ data: { removed: hub.cleanWorktrees(workspace) } }));
	}
	// A chat's worktree: how it stands, and discarding it (`{ deleteBranch, force }`).
	const worktree = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/worktree(\/discard)?$/);
	if (worktree && !worktree[2] && request.method === "GET") {
		return run(() => Response.json({ data: hub.worktree(workspace, worktree[1]) }));
	}
	if (worktree?.[2] && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as {
			deleteBranch?: unknown;
			force?: unknown;
		};
		return run(() => {
			hub.discardWorktree(workspace, worktree[1], {
				deleteBranch: body.deleteBranch === true,
				force: body.force === true,
			});
			return new Response(null, { status: 204 });
		});
	}
	const match = url.pathname.match(/^\/chat\/sessions\/([\w-]+)$/);
	if (match) {
		const id = match[1];
		if (request.method === "DELETE") {
			return run(() => {
				hub.delete(workspace, id);
				return new Response(null, { status: 204 });
			});
		}
		if (request.method === "PATCH") {
			const body = (await request.json().catch(() => ({}))) as { title?: unknown };
			if (typeof body.title !== "string") return failure(400, "Nothing to change");
			return run(() => {
				hub.rename(workspace, id, body.title as string);
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
	workspace: string,
	sessionId: string,
	command: ChatCommand,
	reportError: (message: string) => void,
): void {
	const fail = (cause: unknown) =>
		reportError(cause instanceof Error ? cause.message : String(cause));
	try {
		if (command.t === "prompt" && typeof command.text === "string") {
			hub.prompt(workspace, sessionId, command.text).catch(fail);
		} else if (command.t === "cancel") {
			hub.cancel(workspace, sessionId);
		} else if (command.t === "approve" && typeof command.id === "string") {
			hub.approve(
				workspace,
				sessionId,
				command.id,
				typeof command.optionId === "string" ? command.optionId : null,
			);
		} else if (command.t === "configure") {
			hub
				.configure(workspace, sessionId, {
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
