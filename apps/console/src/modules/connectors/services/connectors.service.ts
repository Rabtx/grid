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
