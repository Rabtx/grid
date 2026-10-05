import { runnerCall } from "@/lib/runner-client";

/** An approval waiting in a running thread, as the runner lists them. */
export interface Waiting {
	sessionId: string;
	project: string;
	thread: string;
	provider: string;
	approval: {
		id: string;
		title: string;
		detail: string | null;
		options: { id: string; label: string; kind: "allow" | "allow_always" | "deny" }[];
	};
}

/** What waits on a person across a machine's threads, and answering it from anywhere in Grid. */
export const attentionService = {
	waiting: (token: string, scope = "") => runnerCall<Waiting[]>(`${scope}/chat/waiting`, token),
	approve: (
		token: string,
		scope: string,
		sessionId: string,
		approvalId: string,
		optionId: string,
	) =>
		runnerCall<void>(`${scope}/chat/sessions/${sessionId}/approve`, token, {
			method: "POST",
			body: JSON.stringify({ approvalId, optionId }),
		}),
};
