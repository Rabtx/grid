import { runnerCall } from "@/lib/runner-client";

/** Another machine's Grid that this one drives: a Codespace, a VPS, a second laptop. */
export type Environment = { id: string; label: string; url: string; createdAt: string };

export const environmentsService = {
	list: (token: string) => runnerCall<Environment[]>("/environments", token),
	/** Pair with the code the environment showed (`bun run grid:pair` there). */
	add: (token: string, input: { url: string; code: string; label: string }) =>
		runnerCall<Environment>("/environments", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	remove: (token: string, id: string) =>
		runnerCall<void>(`/environments/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
	reachable: async (token: string, id: string) =>
		(
			await runnerCall<{ reachable: boolean }>(
				`/environments/${encodeURIComponent(id)}/health`,
				token,
			)
		).reachable,
};
