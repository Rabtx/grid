import { runnerCall } from "@/lib/runner-client";

import type {
	AgentAccess,
	Connection,
	ConnectionDetail,
	ConnectorsView,
	CustomServerInput,
	HeldGrant,
	Probe,
	Rule,
	SignInOutcome,
} from "../types/connector.types";

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** Settings → Connectors on this machine's runner. */
export const connectorsService = {
	view: (token: string) => runnerCall<ConnectorsView>("/connectors", token),
	get: (token: string, id: string) =>
		runnerCall<ConnectionDetail>(`/connectors/${encodeURIComponent(id)}`, token),
	/** Starts signing in to a service: the address to open. */
	startSignIn: (token: string, input: { service: string; redirectUri: string }) =>
		runnerCall<{ url: string; state: string }>("/connectors/sign-in", token, json(input)),
	finishSignIn: (token: string, input: { state: string; code: string }) =>
		runnerCall<HeldGrant>("/connectors/sign-in/finish", token, json(input)),
	/** Where a sign-in started here stands: still waiting, finished in its window, or failed. */
	signInOutcome: (token: string, state: string) =>
		runnerCall<SignInOutcome>(
			`/connectors/sign-in/outcome?state=${encodeURIComponent(state)}`,
			token,
		),
	/**
	 * The sign-in window's page finishing the sign-in. Not signed in to Grid (it may be another
	 * browser, a phone's outside an installed app), so the sign-in's state is what it proves with.
	 */
	completeSignIn: async (input: {
		state: string;
		code: string | null;
		error: string | null;
	}): Promise<{ name: string }> => {
		const response = await fetch("/runner/connectors/sign-in/callback", json(input)).catch(() => {
			throw new Error("Grid's runner could not be reached to finish signing in");
		});
		const body = (await response.json().catch(() => null)) as {
			data?: { name: string };
			message?: string;
		} | null;
		if (!response.ok || !body?.data) throw new Error(body?.message ?? "Signing in failed");
		return body.data;
	},
	useKey: (token: string, input: { service: string; key: string }) =>
		runnerCall<HeldGrant>("/connectors/key", token, json(input)),
	useGithubCli: (token: string) =>
		runnerCall<HeldGrant>("/connectors/github-cli", token, { method: "POST" }),
	addService: (
		token: string,
		input: { service: string; grant: string; rules: Record<string, Rule> },
	) => runnerCall<Connection>("/connectors", token, json(input)),
	addServer: (token: string, server: CustomServerInput) =>
		runnerCall<Connection>("/connectors", token, json({ server })),
	tryServer: (token: string, server: CustomServerInput) =>
		runnerCall<Probe>("/connectors/test", token, json({ server })),
	check: (token: string, id: string) =>
		runnerCall<Connection>(`/connectors/${encodeURIComponent(id)}/test`, token, {
			method: "POST",
		}),
	update: (
		token: string,
		id: string,
		patch: {
			enabled?: boolean;
			rules?: Record<string, Rule>;
			agents?: Record<string, AgentAccess | null>;
			hiddenRepositories?: string[];
		},
	) =>
		runnerCall<Connection>(`/connectors/${encodeURIComponent(id)}`, token, {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),
	remove: (token: string, id: string) =>
		runnerCall<void>(`/connectors/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
	saveSecret: (token: string, name: string, value: string) =>
		runnerCall<void>("/secrets", token, json({ name, value })),
};
