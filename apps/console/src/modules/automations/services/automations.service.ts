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

/** How it runs beyond its prompt: its role, branch, what it does after, and its guardrails. */
export type AutomationOptions = {
	role: string | null;
	branch: string | null;
	pullRequest: boolean;
	waitForReview: boolean;
	minutes: number | null;
	budgetUsd: number | null;
	offLimits: string[];
	icon: string | null;
};

export const DEFAULT_OPTIONS: AutomationOptions = {
	role: null,
	branch: null,
	pullRequest: false,
	waitForReview: false,
	minutes: null,
	budgetUsd: null,
	offLimits: [],
	icon: null,
};

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
	options: AutomationOptions;
};
/** A step of a run as its tools did it. */
export type RunStep = { title: string; detail: string | null };
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
	summary: string | null;
	pullNumber: number | null;
	costUsd: number | null;
	steps: RunStep[];
};
/** A run in the strip of recent ones. */
export type RecentRun = Pick<AutomationRun, "status" | "pullNumber" | "startedAt">;
export type Automation = AutomationInput & {
	id: string;
	workspace: string;
	ownerId: string;
	nextRunAt: string | null;
	createdAt: string;
	updatedAt: string;
	lastRun?: AutomationRun | null;
	/** Its last runs, oldest first. */
	recent?: RecentRun[];
	/** The machine it runs on. */
	machine?: string;
};
export type Template = {
	id: string;
	name: string;
	prompt: string;
	cadence?: "daily" | "weekly";
	event?: "pull_opened" | "checks_failed";
	icon?: string;
	description?: string;
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
