import { MAX_ATTACHMENT_BYTES } from "./attachments";
import type { Who } from "../auth";
import { may, NOT_ALLOWED, readOnly } from "../permissions";
import type { RoleStore } from "../roles/store";
import type { ChatSessionRow } from "./store";

import { ChatError, type ChatHub, type QueueAction } from "./hub";

/**
 * A thread as devices are sent it: the notes it started with stay on this machine (they can be
 * long, and every thread list would carry them); only whether it has them is said.
 */
function listed(
	session: ChatSessionRow,
): Omit<ChatSessionRow, "notes" | "forkToken" | "agentTokens"> & { sharedNotes: boolean } {
	// Agents' session ids beyond the current one are Grid's to use, not the console's.
	const { notes, forkToken: _fork, agentTokens: _tokens, ...rest } = session;
	return { ...rest, sharedNotes: Boolean(notes) };
}

/** What a thread may start with from its project's shared notes (characters). */
const MAX_SHARED_NOTES = 64_000;

/**
 * Chat over HTTP: which agents exist, and the session list. Returns null for paths it does not
 * own, so the server can try its other routes.
 */
export async function chatRequest(
	request: Request,
	url: URL,
	who: Who,
	hub: ChatHub,
	/** The workspace's roles, for a thread started as one. */
	roles?: RoleStore,
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
	if (url.pathname === "/chat/activity" && request.method === "GET") {
		const project = url.searchParams.get("project");
		if (!project) return failure(400, "Say which project");
		return Response.json({ data: hub.activity(workspace, project) });
	}
	// Earlier history, a page at a time, as a reader scrolls up past what opening the thread sent.
	const earlier = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/events$/);
	if (earlier && request.method === "GET") {
		const before = Number(url.searchParams.get("before"));
		if (!Number.isSafeInteger(before) || before < 1) return failure(400, "Say where to read from");
		try {
			return Response.json({ data: hub.earlierEvents(workspace, earlier[1] ?? "", before) });
		} catch (cause) {
			if (cause instanceof ChatError) return failure(cause.status, cause.message);
			throw cause;
		}
	}
	const cancel = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/cancel$/);
	if (cancel && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		try {
			await hub.stopRunning(workspace, cancel[1] ?? "");
			return new Response(null, { status: 204 });
		} catch (cause) {
			if (cause instanceof ChatError) return failure(cause.status, cause.message);
			return failure(502, "The agent could not receive Stop");
		}
	}

	// Approvals waiting across the workspace, and answering one without opening its thread.
	if (url.pathname === "/chat/waiting" && request.method === "GET") {
		return Response.json({ data: hub.waiting(workspace) });
	}
	const approve = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/approve$/);
	if (approve && request.method === "POST") {
		if (!may(who, "approveCommands")) return failure(403, NOT_ALLOWED);
		const body = (await request.json().catch(() => ({}))) as {
			approvalId?: unknown;
			optionId?: unknown;
		};
		if (
			!body ||
			typeof body !== "object" ||
			Array.isArray(body) ||
			typeof body.approvalId !== "string"
		)
			return failure(400, "Say which approval");
		if (body.optionId !== undefined && body.optionId !== null && typeof body.optionId !== "string")
			return failure(400, "Choose an approval option");
		const approvalId = body.approvalId;
		const optionId = typeof body.optionId === "string" ? body.optionId : null;
		try {
			await hub.answerPending(workspace, approve[1] ?? "", approvalId, optionId);
			return new Response(null, { status: 204 });
		} catch (cause) {
			if (cause instanceof ChatError) return failure(cause.status, cause.message);
			return failure(502, "The agent could not receive the answer");
		}
	}
	if (url.pathname === "/chat/sessions" && request.method === "GET") {
		const project = url.searchParams.get("project");
		if (!project) return failure(400, "Say which project");
		return Response.json({ data: hub.list(workspace, project).map(listed) });
	}
	if (url.pathname === "/chat/sessions" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (typeof body.project !== "string" || typeof body.provider !== "string") {
			return failure(400, "Say which project and which agent");
		}
		const input = {
			project: body.project,
			provider: body.provider,
			cwd: typeof body.cwd === "string" ? body.cwd : undefined,
			model: typeof body.model === "string" ? body.model : undefined,
			mode: typeof body.mode === "string" ? body.mode : undefined,
			effort: typeof body.effort === "string" ? body.effort : undefined,
			worktree: typeof body.worktree === "boolean" ? body.worktree : undefined,
			branch: typeof body.branch === "string" ? body.branch : undefined,
			existing: typeof body.existing === "boolean" ? body.existing : undefined,
			pull:
				typeof body.pull === "number" && Number.isInteger(body.pull) && body.pull > 0
					? body.pull
					: undefined,
			fork: body.fork === true,
			account: typeof body.account === "string" ? body.account : undefined,
			role: undefined as { id: string; name: string; icon: string; brief: string } | undefined,
			notes: undefined as { text: string } | undefined,
		};
		// The notes the project shares with agents, which the console reads from the API.
		if (body.notes !== undefined) {
			if (typeof body.notes !== "string" || body.notes.length > MAX_SHARED_NOTES)
				return failure(400, "The shared notes are too long to start a thread with");
			input.notes = { text: body.notes };
		}
		if (body.role !== undefined) {
			const role = typeof body.role === "string" ? roles?.get(workspace, body.role) : null;
			if (!role) return failure(400, "That role is gone; choose another");
			input.role = { id: role.id, name: role.name, icon: role.icon, brief: role.brief };
		}
		// An existing branch is fetched first, without blocking the runner while it waits.
		if (input.worktree && (input.existing || input.pull !== undefined)) {
			try {
				await hub.prepareWorktree(who, input);
			} catch (cause) {
				if (!(cause instanceof ChatError)) throw cause;
				return failure(cause.status, cause.message);
			}
		}
		return run(() => Response.json({ data: listed(hub.create(who, input)) }, { status: 201 }));
	}
	// What agents suggested adding to a project's notes, and someone adding or dismissing one.
	const suggestions = url.pathname.match(
		/^\/chat\/notes\/([a-z0-9-]+)\/suggestions(?:\/([\w-]+))?$/,
	);
	if (suggestions && !suggestions[2] && request.method === "GET") {
		return Response.json({ data: hub.noteSuggestions(workspace, suggestions[1]) });
	}
	if (suggestions?.[2] && request.method === "DELETE") {
		const id = suggestions[2];
		return run(() => {
			hub.dropNoteSuggestion(workspace, id);
			return new Response(null, { status: 204 });
		});
	}
	// A project's chat settings on this machine: whether new chats get their own worktree, and
	// whether idle Claude Code threads are compacted before their cache expires.
	const settings = url.pathname.match(/^\/chat\/projects\/([a-z0-9-]+)\/settings$/);
	if (settings && request.method === "GET") {
		return Response.json({ data: hub.projectSettings(workspace, settings[1]) });
	}
	if (settings && request.method === "PUT") {
		const body = (await request.json().catch(() => ({}))) as {
			worktrees?: unknown;
			idleCompact?: unknown;
		};
		const given = (["worktrees", "idleCompact"] as const).filter((key) => body[key] !== undefined);
		if (!given.length || given.some((key) => typeof body[key] !== "boolean"))
			return failure(400, "Say whether to use worktrees, or whether to compact idle threads");
		const current = hub.projectSettings(workspace, settings[1]);
		hub.setProjectSettings(workspace, settings[1], {
			...current,
			...(typeof body.worktrees === "boolean" ? { worktrees: body.worktrees } : {}),
			...(typeof body.idleCompact === "boolean" ? { idleCompact: body.idleCompact } : {}),
		});
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
	const attachment = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/attachments(?:\/([\w-]+))?$/);
	if (attachment) {
		const [, session, id] = attachment;
		return runAsync(async () => {
			hub.checkSession(workspace, session);
			if (!id && request.method === "POST") {
				const name = url.searchParams.get("name") ?? "file";
				const reader = request.body?.getReader();
				if (!reader) return failure(400, "Send a file");
				const chunks: Uint8Array[] = [];
				let size = 0;
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						size += value.length;
						if (size > MAX_ATTACHMENT_BYTES) {
							await reader.cancel();
							return failure(413, "Each file must be 10 MB or smaller");
						}
						chunks.push(value);
					}
				} finally {
					reader.releaseLock();
				}
				return Response.json(
					{ data: hub.upload(workspace, session, name, Buffer.concat(chunks)) },
					{ status: 201 },
				);
			}
			if (id && request.method === "GET") {
				const { metadata, bytes } = hub.attachment(workspace, session, id);
				return new Response(bytes, {
					headers: {
						"Content-Type": metadata.mimeType,
						"Content-Disposition": `${metadata.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy": "default-src 'none'; sandbox",
						"Cache-Control": "private, no-store",
					},
				});
			}
			return failure(405, "Method not allowed");
		});
	}
	// A new thread that carries on from this one (`{ at?: messageId, worktree?: boolean }`).
	const fork = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/fork$/);
	if (fork && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		const body = (await request.json().catch(() => ({}))) as { at?: unknown; worktree?: unknown };
		if (body.at !== undefined && typeof body.at !== "string")
			return failure(400, "Say which message");
		return run(() =>
			Response.json(
				{
					data: listed(
						hub.fork(who, fork[1] ?? "", {
							...(typeof body.at === "string" ? { at: body.at } : {}),
							worktree: body.worktree === true,
						}),
					),
				},
				{ status: 201 },
			),
		);
	}
	// Hand the thread to another agent: here, or in a new thread (`newThread`).
	const handoff = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/handoff$/);
	if (handoff && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		if (typeof body.provider !== "string") return failure(400, "Say which agent to hand off to");
		const text = (key: string) =>
			typeof body[key] === "string" ? (body[key] as string) : undefined;
		return run(() => {
			const session = hub.handoff(who, handoff[1] ?? "", {
				provider: body.provider as string,
				model: text("model"),
				mode: text("mode"),
				effort: text("effort"),
				newThread: body.newThread === true,
			});
			return Response.json(
				{ data: listed(session) },
				{ status: body.newThread === true ? 201 : 200 },
			);
		});
	}
	// Bring a fork's work back into the thread it was forked from, as that thread's next message.
	const merge = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/merge$/);
	if (merge && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		return run(() => {
			const { into, turns } = hub.mergeBack(who, merge[1] ?? "");
			return Response.json({ data: { into: listed(into), turns } });
		});
	}
	// A thread's side chats: listing them, and opening one (`{ provider?, model? }`).
	const sides = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/sides$/);
	if (sides && request.method === "GET") {
		return run(() => Response.json({ data: hub.sides(workspace, sides[1] ?? "").map(listed) }));
	}
	if (sides && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		return run(() =>
			Response.json(
				{
					data: listed(
						hub.side(who, sides[1] ?? "", {
							...(typeof body.provider === "string" ? { provider: body.provider } : {}),
							...(typeof body.model === "string" ? { model: body.model } : {}),
						}),
					),
				},
				{ status: 201 },
			),
		);
	}
	// Undo a turn: the thread's files back to how that turn found them.
	const undo = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/checkpoints\/(\d+)\/restore$/);
	if (undo && request.method === "POST") {
		if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
		const turn = Number(undo[2]);
		if (!Number.isSafeInteger(turn) || turn < 1) return failure(400, "Say which turn");
		return runAsync(async () => {
			await hub.restoreCheckpoint(workspace, undo[1] ?? "", turn);
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
	| {
			t: "prompt";
			text: string;
			attachments?: string[];
			delivery?: "send" | "steer";
			/** Names the send: one arriving again with the same id (a retry) is not sent twice. */
			requestId?: string;
	  }
	| { t: "answer"; id: string; answers: Record<string, string[]> | null }
	| { t: "queue"; action: QueueAction; id?: string }
	| { t: "cancel" }
	| { t: "approve"; id: string; optionId: string | null }
	| { t: "configure"; model?: string; mode?: string; effort?: string };

export function chatCommand(
	hub: ChatHub,
	who: Who,
	sessionId: string,
	command: ChatCommand,
	reportError: (message: string) => void,
): void {
	const { workspace } = who;
	const fail = (cause: unknown) =>
		reportError(cause instanceof Error ? cause.message : String(cause));
	// Writing to an agent is starting its work; answering it is approving; a viewer only watches.
	const needs =
		command.t === "prompt" || command.t === "answer" || command.t === "queue"
			? may(who, "startAgents")
			: command.t === "approve"
				? may(who, "approveCommands")
				: !readOnly(who);
	if (!needs) {
		reportError(NOT_ALLOWED);
		return;
	}
	try {
		if (command.t === "prompt" && typeof command.text === "string") {
			hub
				.prompt(
					workspace,
					sessionId,
					command.text,
					command.attachments,
					command.delivery === "steer" ? "steer" : "send",
					typeof command.requestId === "string" ? { requestId: command.requestId } : {},
				)
				.catch(fail);
		} else if (command.t === "answer" && typeof command.id === "string") {
			const answers = readAnswers(command.answers);
			if (answers === undefined) return reportError("Send an answer for each question");
			hub.answerQuestion(workspace, sessionId, command.id, answers).catch(fail);
		} else if (command.t === "queue" && QUEUE_ACTIONS.has(command.action)) {
			hub
				.queueAction(
					workspace,
					sessionId,
					command.action,
					typeof command.id === "string" ? command.id : undefined,
				)
				.catch(fail);
		} else if (command.t === "cancel") {
			hub.cancel(workspace, sessionId, true);
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

const QUEUE_ACTIONS = new Set<QueueAction>(["remove", "clear", "pause", "resume", "steer"]);

/**
 * Answers as a question takes them: up to 20 questions, each a list of short strings, or null to
 * dismiss. Undefined when they are not that.
 */
export function readAnswers(raw: unknown): Record<string, string[]> | null | undefined {
	if (raw === null) return null;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const entries = Object.entries(raw as Record<string, unknown>);
	if (entries.length > 20) return undefined;
	const answers: Record<string, string[]> = {};
	for (const [id, value] of entries) {
		if (!Array.isArray(value) || value.length > 20) return undefined;
		if (value.some((item) => typeof item !== "string" || item.length > 4_000)) return undefined;
		answers[id] = value as string[];
	}
	return answers;
}

/**
 * Grid's own tools calling back from an agent (`grid-tools.ts`): proved with the key the runner
 * started them with, not a person's sign-in. Null for paths it does not own.
 */
export async function chatToolsRequest(
	request: Request,
	url: URL,
	hub: ChatHub,
): Promise<Response | null> {
	const key = request.headers.get("x-grid-tools-key") ?? "";
	if (url.pathname === "/chat/tools" && request.method === "GET") {
		const thread = url.searchParams.get("thread") ?? "";
		return run(() => Response.json({ data: hub.toolsFor(key, thread) }));
	}
	if (url.pathname !== "/chat/tools/call" || request.method !== "POST") return null;
	const body = (await request.json().catch(() => null)) as {
		thread?: unknown;
		name?: unknown;
		args?: unknown;
	} | null;
	if (!body || typeof body.thread !== "string" || typeof body.name !== "string")
		return failure(400, "Say which thread, and which tool");
	const args =
		body.args && typeof body.args === "object" && !Array.isArray(body.args)
			? (body.args as Record<string, unknown>)
			: {};
	return runAsync(async () => {
		const answer = await hub.answerTool(key, body.thread as string, body.name as string, args);
		return Response.json({ data: typeof answer === "string" ? { text: answer } : answer });
	});
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
