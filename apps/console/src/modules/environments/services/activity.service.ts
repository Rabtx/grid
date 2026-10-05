import { runnerCall } from "@/lib/runner-client";

export type RunActivity = {
	id: string;
	project: string;
	title: string;
	provider: string;
	running: boolean;
	waiting: boolean;
	startedAt: string | null;
	endedAt: string | null;
	result: "done" | "cancelled" | "error" | null;
	tool: string | null;
	steps: { done: number; total: number } | null;
};
export type RunHere = RunActivity & { scope: string };
export const activityService = {
	list: (token: string, project: string, scope = "") =>
		runnerCall<RunActivity[]>(
			`${scope}/chat/activity?project=${encodeURIComponent(project)}`,
			token,
		),
	stop: (token: string, id: string, scope = "") =>
		runnerCall<void>(`${scope}/chat/sessions/${encodeURIComponent(id)}/cancel`, token, {
			method: "POST",
		}),
};
