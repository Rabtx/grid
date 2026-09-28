import { runnerCall } from "@/lib/runner-client";

export type Trigger =
	| { kind: "schedule"; cadence: "hourly"; minute: number; timezone: string }
	| {
			kind: "schedule";
			cadence: "daily" | "weekdays" | "weekly";
			time: string;
			day?: number;
			timezone: string;
	  }
	| { kind: "event"; event: "pull_opened" | "review_requested" | "checks_failed" };

export type AutomationInput = {
	name: string;
	prompt: string;
	provider: string;
	model: string | null;
	effort: string | null;
	mode: string | null;
	project: string;
	workspaceMode: "folder" | "worktree";
	enabled: boolean;
	triggers: Trigger[];
};
export type AutomationRun = {
	id: string;
	automationId: string;
	trigger: "schedule" | "event" | "manual";
	status: "running" | "succeeded" | "failed" | "skipped";
	error: string | null;
	sessionId: string | null;
	scheduledFor: string | null;
	startedAt: string | null;
	finishedAt: string | null;
};
export type Automation = AutomationInput & {
	id: string;
	workspace: string;
	ownerId: string;
	nextRunAt: string | null;
	createdAt: string;
	updatedAt: string;
	lastRun?: AutomationRun | null;
};
export type Template = {
	id: string;
	name: string;
	prompt: string;
	cadence?: "daily" | "weekly";
	event?: "pull_opened" | "checks_failed";
};

const path = "/automations";
export const automationsService = {
	list: (token: string) => runnerCall<Automation[]>(path, token),
	templates: (token: string) => runnerCall<Template[]>(`${path}/templates`, token),
	runs: (token: string, id: string) => runnerCall<AutomationRun[]>(`${path}/${id}/runs`, token),
	create: (token: string, input: AutomationInput) =>
		runnerCall<Automation>(path, token, { method: "POST", body: JSON.stringify(input) }),
	update: (token: string, id: string, input: AutomationInput) =>
		runnerCall<Automation>(`${path}/${id}`, token, { method: "PUT", body: JSON.stringify(input) }),
	delete: (token: string, id: string) =>
		runnerCall<void>(`${path}/${id}`, token, { method: "DELETE" }),
	toggle: (token: string, id: string) =>
		runnerCall<Automation>(`${path}/${id}/toggle`, token, { method: "POST" }),
	run: (token: string, id: string) =>
		runnerCall<AutomationRun>(`${path}/${id}/run`, token, { method: "POST" }),
};
