import { runnerCall } from "@/lib/runner-client";

/** GitHub as the runner sees it (apps/runner/src/github/codespaces.ts). */
export type GitHubStatus = {
	installed: boolean;
	login: string | null;
	canManageCodespaces: boolean;
	claimedBy: "you" | "someone-else" | null;
	pending: { code: string; url: string } | null;
	error: string | null;
};

export type Codespace = {
	name: string;
	displayName: string;
	repository: string;
	state: string;
	machine: string;
	lastUsedAt: string;
	environment: string | null;
	connecting: { step: string; error: string | null } | null;
};

export const githubService = {
	status: (token: string) => runnerCall<GitHubStatus>("/github", token),
	/** Sign in (or use the machine's existing GitHub sign-in); may return a code to enter. */
	signIn: (token: string) => runnerCall<GitHubStatus>("/github/sign-in", token, { method: "POST" }),
	signOut: (token: string) => runnerCall<void>("/github", token, { method: "DELETE" }),
	codespaces: (token: string) => runnerCall<Codespace[]>("/github/codespaces", token),
	create: (token: string, input: { repository: string; branch?: string }) =>
		runnerCall<{ name: string }>("/github/codespaces", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	/** Start, stop, or connect as an environment (in the background: watch `codespaces`). */
	act: (token: string, name: string, action: "start" | "stop" | "connect") =>
		runnerCall<void>(`/github/codespaces/${encodeURIComponent(name)}/${action}`, token, {
			method: "POST",
		}),
};
