import type { ChatProvider, ChatSession } from "../types/chat.types";

/** The runner, on the console's own origin (`/runner`), like the terminals. */
function runnerUrl(path: string): string {
	return `${window.location.origin}/runner${path}`;
}

export function chatSocketUrl(): string {
	return runnerUrl("/chat").replace(/^http/, "ws");
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(runnerUrl(path), {
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

export const chatService = {
	providers: (token: string) => call<ChatProvider[]>("/chat/providers", token),
	sessions: (token: string, project: string) =>
		call<ChatSession[]>(`/chat/sessions?project=${encodeURIComponent(project)}`, token),
	create: (
		token: string,
		input: { project: string; provider: string; cwd?: string; model?: string; mode?: string },
	) => call<ChatSession>("/chat/sessions", token, { method: "POST", body: JSON.stringify(input) }),
	rename: (token: string, id: string, title: string) =>
		call<void>(`/chat/sessions/${id}`, token, { method: "PATCH", body: JSON.stringify({ title }) }),
	remove: (token: string, id: string) =>
		call<void>(`/chat/sessions/${id}`, token, { method: "DELETE" }),
};
