/**
 * The runner (this machine's terminals, agents and folders), on the console's own origin at
 * `/runner`, like the API at `/api`. Its errors carry a message worth showing as is.
 */
export async function runnerCall<T>(
	path: string,
	token: string,
	init: RequestInit = {},
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(`${window.location.origin}/runner${path}`, {
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
