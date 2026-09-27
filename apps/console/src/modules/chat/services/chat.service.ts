import { workspaceHeaders } from "@/lib/active-workspace";
import type { ChatAttachment } from "../types/chat.types";
import type { TerminalInfo } from "@/modules/terminal/types/terminal.types";

import type {
	ChatProvider,
	ChatSession,
	ProjectChatSettings,
	ProviderSettings,
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

/** Every call takes the machine's `scope` last: empty for this machine. */
export const chatService = {
	upload: async (token: string, id: string, files: File[], scope = "") => {
		if (files.length > 20 || files.some((file) => file.size > 10 * 1024 * 1024))
			throw new Error("Attach up to 20 files, 10 MB each.");
		const attachments: ChatAttachment[] = [];
		for (const file of files)
			attachments.push(
				await call<ChatAttachment>(
					`/chat/sessions/${id}/attachments?name=${encodeURIComponent(file.name)}`,
					token,
					{ method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file },
					scope,
				),
			);
		return attachments;
	},
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
	setupProvider: (token: string, id: string, step: "install" | "sign-in", scope = "") =>
		call<TerminalInfo>(
			`/chat/providers/${id}/setup`,
			token,
			{ method: "POST", body: JSON.stringify({ step }) },
			scope,
		),
	/** Threads with an agent working right now, across projects. */
	running: (token: string, scope = "") =>
		call<{ id: string; project: string }[]>("/chat/running", token, {}, scope),
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
	saveProjectSettings: (
		token: string,
		project: string,
		settings: ProjectChatSettings,
		scope = "",
	) =>
		call<void>(
			`/chat/projects/${project}/settings`,
			token,
			{ method: "PUT", body: JSON.stringify(settings) },
			scope,
		),
};
