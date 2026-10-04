import { apiClient } from "@/lib/api-client";
import { inWorkspace } from "@/lib/active-workspace";
import { runnerCall } from "@/lib/runner-client";

export interface ThreadHit {
	id: string;
	project: string;
	provider: string;
	title: string;
	updatedAt: string;
	passage: string;
}

export interface FileHit {
	project: string;
	path: string;
}

export interface TaskHit {
	project: string;
	projectName: string;
	number: number;
	title: string;
	status: string;
	passage: string | null;
}

export interface NoteHit {
	project: string;
	projectName: string;
	id: string;
	title: string;
	passage: string;
}

export interface AskSource {
	n: number;
	kind: "note" | "thread" | "task" | "commit" | "pull";
	title: string;
	meta: string;
	href: string | null;
}

export interface AskAnswer {
	answer: string;
	cited: number[];
	followUps: string[];
	sources: AskSource[];
	agent: string | null;
}

/** Search across the workspace: threads and files on this machine, tasks and notes in the API. */
export const searchService = {
	local: (token: string, query: string, project: string | null) =>
		runnerCall<{ threads: ThreadHit[]; files: FileHit[] }>(
			`/search?${new URLSearchParams({ q: query, ...(project ? { project } : {}) })}`,
			token,
		),
	work: (token: string, query: string, project: string | null) =>
		apiClient.get<{ tasks: TaskHit[]; notes: NoteHit[] }>(
			`${inWorkspace("/search")}?${new URLSearchParams({ q: query, ...(project ? { project } : {}) })}`,
			{ accessToken: token },
		),
	ask: (
		token: string,
		input: {
			question: string;
			project: string | null;
			history: { question: string; answer: string }[];
		},
	) => runnerCall<AskAnswer>("/ask", token, { method: "POST", body: JSON.stringify(input) }),
};
