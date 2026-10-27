import { workspaceHeaders } from "@/lib/active-workspace";
import type { ChatAttachment } from "../types/chat.types";
import type { TerminalInfo } from "@/modules/terminal/types/terminal.types";

import type {
	AccountsListing,
	BrowserState,
	ChatEvent,
	ChatProvider,
	ChatSession,
	Crew,
	ProjectChatSettings,
	ThreadGoal,
	ProviderAccount,
	ProviderSettings,
	Role,
	RoleDraft,
	RunningThread,
	WaitingApproval,
	WorktreeStatus,
} from "../types/chat.types";

/**
 * The runner, on the console's own origin (`/runner`), like the terminals. `scope` points a call
 * at an environment's runner (`/env/<id>`, from `placementsStore.scopeOf`); empty is this machine.
 */
function runnerUrl(path: string, scope = ""): string {
	return `${window.location.origin}/runner${scope}${path}`;
}

export function chatSocketUrl(scope = ""): string {
	return runnerUrl("/chat", scope).replace(/^http/, "ws");
}

async function call<T>(
	path: string,
	token: string,
	init: RequestInit = {},
	scope = "",
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(runnerUrl(path, scope), {
			...init,
			headers: {
				...workspaceHeaders(),
				...init.headers,
				Authorization: `Bearer ${token}`,
				...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
			},
		});
	} catch {
		throw new Error("The runner is not reachable. Start it with: bun --cwd=apps/runner run dev");
	}
	if (response.status === 204) return undefined as T;
	const body = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
	if (!response.ok) {
		throw new Error(
			body?.message ??
				(response.status >= 500 ? "The runner is not running." : response.statusText),
		);
	}
	return body?.data as T;
}

/**
 * Uploads already made or under way, so a file sent right after it was added is not uploaded
 * twice. Keyed by the file and then by the machine and thread it went to: the same file attached
 * to another thread is a new upload there, never another thread's attachment id.
 */
const uploadedAttachments = new WeakMap<
	File,
	Map<string, Promise<ChatAttachment> | ChatAttachment>
>();
const uploadKey = (scope: string, id: string) => `${scope}\n${id}`;

/** Every call takes the machine's `scope` last: empty for this machine. */
export const chatService = {
	roles: (token: string, scope = "") => call<Role[]>("/roles", token, {}, scope),
	createRole: (token: string, draft: RoleDraft, scope = "") =>
		call<Role>("/roles", token, { method: "POST", body: JSON.stringify(draft) }, scope),
	updateRole: (token: string, id: string, patch: Partial<RoleDraft>, scope = "") =>
		call<Role>(`/roles/${id}`, token, { method: "PATCH", body: JSON.stringify(patch) }, scope),
	removeRole: (token: string, id: string, scope = "") =>
		call<void>(`/roles/${id}`, token, { method: "DELETE" }, scope),
	uploadOne: async (
		token: string,
		id: string,
		file: File,
		scope = "",
		options?: {
			onProgress?: (percent: number) => void;
			signal?: AbortSignal;
		},
	): Promise<ChatAttachment> => {
		if (file.size > 10 * 1024 * 1024) throw new Error("Each file must be 10 MB or smaller.");

		const key = uploadKey(scope, id);
		const uploads = uploadedAttachments.get(file) ?? new Map();
		uploadedAttachments.set(file, uploads);
		const cached = uploads.get(key);
		if (cached) return await cached;

		const doUpload = async (): Promise<ChatAttachment> => {
			const path = `/chat/sessions/${id}/attachments?name=${encodeURIComponent(file.name)}`;
			const url = runnerUrl(path, scope);

			// Use XMLHttpRequest if available for real upload progress
			if (typeof XMLHttpRequest !== "undefined") {
				return new Promise<ChatAttachment>((resolve, reject) => {
					const xhr = new XMLHttpRequest();
					xhr.open("POST", url);
					xhr.setRequestHeader("Authorization", `Bearer ${token}`);
					xhr.setRequestHeader("Content-Type", "application/octet-stream");
					const headers = workspaceHeaders();
					for (const [key, value] of Object.entries(headers)) {
						if (value) xhr.setRequestHeader(key, value);
					}

					if (options?.signal) {
						if (options.signal.aborted) {
							xhr.abort();
							return reject(new DOMException("Aborted", "AbortError"));
						}
						options.signal.addEventListener("abort", () => {
							xhr.abort();
							reject(new DOMException("Aborted", "AbortError"));
						});
					}

					if (xhr.upload && options?.onProgress) {
						xhr.upload.onprogress = (event) => {
							if (event.lengthComputable && event.total > 0) {
								options.onProgress?.(Math.round((event.loaded / event.total) * 100));
							}
						};
					}

					xhr.onload = () => {
						let body: { data?: ChatAttachment; message?: string } | null = null;
						try {
							body = JSON.parse(xhr.responseText);
						} catch {
							// non-json response
						}
						if (xhr.status >= 200 && xhr.status < 300 && body?.data) {
							options?.onProgress?.(100);
							resolve(body.data);
						} else {
							const msg =
								body?.message ||
								(xhr.status === 413
									? "Each file must be 10 MB or smaller"
									: xhr.statusText || "Upload failed");
							reject(new Error(msg));
						}
					};

					xhr.onerror = () => {
						reject(
							new Error(
								"The runner is not reachable. Start it with: bun --cwd=apps/runner run dev",
							),
						);
					};

					xhr.send(file);
				});
			}

			// Fallback to fetch (e.g. Node environments or mock)
			let response: Response;
			try {
				response = await fetch(url, {
					method: "POST",
					headers: {
						...workspaceHeaders(),
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/octet-stream",
					},
					body: file,
					signal: options?.signal,
				});
			} catch {
				if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
				throw new Error(
					"The runner is not reachable. Start it with: bun --cwd=apps/runner run dev",
				);
			}
			const body = (await response.json().catch(() => null)) as {
				data?: ChatAttachment;
				message?: string;
			} | null;
			if (!response.ok) {
				throw new Error(
					body?.message ??
						(response.status === 413
							? "Each file must be 10 MB or smaller"
							: response.status >= 500
								? "The runner is not running."
								: response.statusText),
				);
			}
			options?.onProgress?.(100);
			return body?.data as ChatAttachment;
		};

		const promise = doUpload();
		uploads.set(key, promise);
		try {
			const result = await promise;
			uploads.set(key, result);
			return result;
		} catch (error) {
			uploads.delete(key);
			throw error;
		}
	},
	clearUpload: (file: File) => {
		uploadedAttachments.delete(file);
	},
	upload: async (token: string, id: string, files: File[], scope = "") => {
		if (files.length > 20 || files.some((file) => file.size > 10 * 1024 * 1024))
			throw new Error("Attach up to 20 files, 10 MB each.");
		const attachments: ChatAttachment[] = [];
		for (const file of files) {
			attachments.push(await chatService.uploadOne(token, id, file, scope));
		}
		return attachments;
	},
	/** A page of a thread's history from before `before` (see the `ready` message's `earlier`). */
	/** A new thread carrying on from this one, up to the turn of message `at` (all of it when unset). */
	fork: (token: string, id: string, input: { at?: string; worktree?: boolean }, scope = "") =>
		call<ChatSession>(
			`/chat/sessions/${id}/fork`,
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	/** A thread's goal, or null without one. */
	goal: (token: string, id: string, scope = "") =>
		call<ThreadGoal | null>(`/chat/sessions/${id}/goal`, token, {}, scope),
	/** Set a thread's goal (`objective`), or pause, resume or clear it (`action`). */
	setGoal: (
		token: string,
		id: string,
		input: { objective: string; maxTurns?: number } | { action: "pause" | "resume" | "clear" },
		scope = "",
	) =>
		call<ThreadGoal | null>(
			`/chat/sessions/${id}/goal`,
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	/** Don't carry the thread on when its usage limit resets. */
	cancelLimitWait: (token: string, id: string, scope = "") =>
		call<void>(`/chat/sessions/${id}/limit-wait`, token, { method: "DELETE" }, scope),
	/** Bring a fork's work back into the thread it was forked from, as that thread's next message. */
	mergeBack: (token: string, id: string, scope = "") =>
		call<{ into: ChatSession; turns: number }>(
			`/chat/sessions/${id}/merge`,
			token,
			{ method: "POST" },
			scope,
		),
	/** Hand the thread to another agent, here or (with `newThread`) in a copy. */
	handoff: (
		token: string,
		id: string,
		input: { provider: string; model?: string; newThread?: boolean },
		scope = "",
	) =>
		call<ChatSession>(
			`/chat/sessions/${id}/handoff`,
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	/** Open a side chat beside a thread, optionally with another agent. */
	side: (token: string, id: string, input: { provider?: string } = {}, scope = "") =>
		call<ChatSession>(
			`/chat/sessions/${id}/sides`,
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	/** A crew, by its id or its coordinator thread's id; null when the thread is no crew's. */
	crew: (token: string, id: string, scope = "") =>
		call<Crew | null>(`/chat/crews/${id}`, token, {}, scope),
	createCrew: (
		token: string,
		input: {
			project: string;
			name: string;
			provider: string;
			model?: string;
			cwd?: string;
			instructions?: string;
			parallel?: number;
		},
		scope = "",
	) =>
		call<{ crew: Crew; session: ChatSession }>(
			"/chat/crews",
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	updateCrew: (
		token: string,
		id: string,
		patch: Partial<Pick<Crew, "name" | "instructions" | "parallel" | "paused">>,
		scope = "",
	) =>
		call<Crew>(`/chat/crews/${id}`, token, { method: "PATCH", body: JSON.stringify(patch) }, scope),
	crewWorker: (token: string, crew: string, worker: string, action: "retry" | "stop", scope = "") =>
		call<void>(`/chat/crews/${crew}/workers/${worker}/${action}`, token, { method: "POST" }, scope),
	/** Approvals waiting across the workspace, for answering a crew member's from its coordinator. */
	waiting: (token: string, scope = "") =>
		call<WaitingApproval[]>("/chat/waiting", token, {}, scope),
	answerApproval: (
		token: string,
		id: string,
		approvalId: string,
		optionId: string | null,
		scope = "",
	) =>
		call<void>(
			`/chat/sessions/${id}/approve`,
			token,
			{ method: "POST", body: JSON.stringify({ approvalId, optionId }) },
			scope,
		),
	/** Undo a turn: the thread's files put back to how that turn found them. */
	restoreCheckpoint: (token: string, id: string, turn: number, scope = "") =>
		call<void>(
			`/chat/sessions/${id}/checkpoints/${turn}/restore`,
			token,
			{ method: "POST" },
			scope,
		),
	earlierEvents: (token: string, id: string, before: number, scope = "") =>
		call<{ events: ChatEvent[]; earlier: number | null }>(
			`/chat/sessions/${id}/events?before=${before}`,
			token,
			{},
			scope,
		),
	attachment: async (
		token: string,
		session: string,
		id: string,
		scope = "",
		signal?: AbortSignal,
	) => {
		const response = await fetch(runnerUrl(`/chat/sessions/${session}/attachments/${id}`, scope), {
			headers: { ...workspaceHeaders(), Authorization: `Bearer ${token}` },
			signal,
		});
		if (!response.ok) throw new Error("Attachment could not be loaded. Try again.");
		return response.blob();
	},
	providers: (token: string, scope = "") =>
		call<ChatProvider[]>("/chat/providers", token, {}, scope),
	/** Ask one agent for its models again (they are kept otherwise). */
	refreshProvider: (token: string, id: string, scope = "") =>
		call<ChatProvider>(`/chat/providers/${id}/refresh`, token, { method: "POST" }, scope),
	saveProviderSettings: (token: string, id: string, settings: ProviderSettings, scope = "") =>
		call<void>(
			`/chat/providers/${id}/settings`,
			token,
			{ method: "PUT", body: JSON.stringify(settings) },
			scope,
		),
	/**
	 * Install or sign in an agent on its machine: opens a terminal there running the agent's own
	 * command, to watch and answer.
	 */
	/** Where the thread's browser page is (Grid's browser, which its agent drives). */
	browser: (token: string, thread: string, scope = "") =>
		call<BrowserState>(`/chat/browser/${thread}`, token, {}, scope),
	/** A picture of the thread's browser page as it is now; null when nothing is open. */
	async browserFrame(token: string, thread: string, scope = ""): Promise<Blob | null> {
		const response = await fetch(runnerUrl(`/chat/browser/${thread}/frame`, scope), {
			headers: { ...workspaceHeaders(), Authorization: `Bearer ${token}` },
		}).catch(() => null);
		return response?.ok ? response.blob() : null;
	},
	/** The person using the thread's browser: open an address, click, type, press, scroll, go back. */
	browserAct: (
		token: string,
		thread: string,
		action: "open" | "back" | "reload" | "click" | "type" | "key" | "scroll" | "close",
		body: Record<string, unknown> = {},
		scope = "",
	) =>
		call<BrowserState | undefined>(
			`/chat/browser/${thread}/${action}`,
			token,
			{ method: "POST", body: JSON.stringify(body) },
			scope,
		),
	/** This person's provider accounts on the machine, and what each has used of its plan. */
	accounts: (token: string, scope = "") =>
		call<AccountsListing>("/chat/accounts", token, {}, scope),
	createAccount: (token: string, input: { provider: string; label: string }, scope = "") =>
		call<ProviderAccount>(
			"/chat/accounts",
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	renameAccount: (token: string, id: string, label: string, scope = "") =>
		call<ProviderAccount>(
			`/chat/accounts/${id}`,
			token,
			{ method: "PATCH", body: JSON.stringify({ label }) },
			scope,
		),
	removeAccount: (token: string, id: string, scope = "") =>
		call<void>(`/chat/accounts/${id}`, token, { method: "DELETE" }, scope),
	/** A terminal running the agent's own sign-in for that account. */
	signInAccount: (token: string, id: string, scope = "") =>
		call<TerminalInfo>(`/chat/accounts/${id}/sign-in`, token, { method: "POST" }, scope),
	setupProvider: (token: string, id: string, step: "install" | "sign-in", scope = "") =>
		call<TerminalInfo>(
			`/chat/providers/${id}/setup`,
			token,
			{ method: "POST", body: JSON.stringify({ step }) },
			scope,
		),
	/** Threads with an agent working right now, across projects. */
	running: (token: string, scope = "") => call<RunningThread[]>("/chat/running", token, {}, scope),
	sessions: (token: string, project: string, scope = "") =>
		call<ChatSession[]>(`/chat/sessions?project=${encodeURIComponent(project)}`, token, {}, scope),
	create: (
		token: string,
		input: {
			project: string;
			provider: string;
			cwd?: string;
			model?: string;
			mode?: string;
			effort?: string;
			/** Its own git worktree; by default what the project is set to. */
			worktree?: boolean;
			/** The worktree's branch; `grid/chat-<id>` when not given. */
			branch?: string;
			/** Work on `branch` as it is (one that exists here or on the remote), not a new one. */
			existing?: boolean;
			/** The pull request this worktree's branch is. */
			pull?: number;
			/** That pull request comes from a fork: its ref is fetched onto `branch`. */
			fork?: boolean;
			/** The role it starts as: its brief goes with the first message. */
			role?: string;
			/** The project's notes shared with agents; they go with the first message too. */
			notes?: string;
			/** The provider account it runs as; the machine's own sign-in when not given. */
			account?: string;
		},
		scope = "",
	) =>
		call<ChatSession>(
			"/chat/sessions",
			token,
			{ method: "POST", body: JSON.stringify(input) },
			scope,
		),
	rename: (token: string, id: string, title: string, scope = "") =>
		call<void>(
			`/chat/sessions/${id}`,
			token,
			{ method: "PATCH", body: JSON.stringify({ title }) },
			scope,
		),
	remove: (token: string, id: string, scope = "") =>
		call<void>(`/chat/sessions/${id}`, token, { method: "DELETE" }, scope),
	worktree: (token: string, id: string, scope = "") =>
		call<WorktreeStatus | null>(`/chat/sessions/${id}/worktree`, token, {}, scope),
	/** Remove a chat's worktree (and its branch); refuses to lose work unless `force`. */
	discardWorktree: (
		token: string,
		id: string,
		options: { deleteBranch: boolean; force?: boolean },
		scope = "",
	) =>
		call<void>(
			`/chat/sessions/${id}/worktree/discard`,
			token,
			{ method: "POST", body: JSON.stringify(options) },
			scope,
		),
	projectSettings: (token: string, project: string, scope = "") =>
		call<ProjectChatSettings>(`/chat/projects/${project}/settings`, token, {}, scope),
	/** Change some of a project's chat settings; those left out stay as they are. */
	saveProjectSettings: (
		token: string,
		project: string,
		settings: Partial<ProjectChatSettings>,
		scope = "",
	) =>
		call<void>(
			`/chat/projects/${project}/settings`,
			token,
			{ method: "PUT", body: JSON.stringify(settings) },
			scope,
		),
};
