import type { TerminalInfo } from "../types/terminal.types";

/**
 * The runner sits behind the console's own origin (`/runner`, proxied by Vite), like the API
 * does, so it works the same over localhost, the LAN and an HTTPS tunnel.
 */
function runnerUrl(path: string): string {
	return `${window.location.origin}/runner${path}`;
}

export function terminalSocketUrl(): string {
	return runnerUrl("/terminal").replace(/^http/, "ws");
}

/** The runner's own failure, or a sign that it is not running at all. */
export class RunnerError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "RunnerError";
	}
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
	let response: Response;
	try {
		response = await fetch(runnerUrl(path), {
			...init,
			headers: { ...init.headers, Authorization: `Bearer ${token}` },
		});
	} catch {
		throw new RunnerError("The terminal service is not reachable.", 0);
	}
	if (response.status === 204) return undefined as T;
	const body = (await response.json().catch(() => null)) as { data?: T; message?: string } | null;
	if (!response.ok) {
		// The dev proxy answers 5xx with no JSON when nothing listens on the runner's port.
		const message =
			body?.message ?? (response.status >= 500 ? "The terminal service is not running." : "");
		throw new RunnerError(message || response.statusText, response.status);
	}
	return body?.data as T;
}

export const terminalsService = {
	list: (token: string) => call<TerminalInfo[]>("/terminals", token),
	open: (token: string, size: { cols: number; rows: number }, cwd?: string) =>
		call<TerminalInfo>("/terminals", token, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...size, ...(cwd ? { cwd } : {}) }),
		}),
	close: (token: string, id: string) =>
		call<void>(`/terminals/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
};
