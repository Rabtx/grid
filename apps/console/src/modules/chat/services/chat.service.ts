import type { ChatProvider, ChatSession, ProviderSettings } from "../types/chat.types";

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
				...init.headers,
				Authorization: `Bearer ${token}`,
				...(init.body ? { "Content-Type": "application/json" } : {}),
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
};
