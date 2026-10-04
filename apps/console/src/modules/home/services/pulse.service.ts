import { runnerCall } from "@/lib/runner-client";

/** A number Pulse reads from a service: now, how it moved, and across the period. */
export interface Metric {
	value: number;
	change: number | null;
	series: number[];
}

export interface Insight {
	title: string;
	detail: string;
	source: string;
	tone: "good" | "warn" | "info";
}

export interface Reading {
	mrr: (Metric & { currency: string }) | null;
	activeUsers: Metric | null;
	activation: Metric | null;
	errorRate: Metric | null;
	insights: Insight[];
	missing: Record<string, string>;
}

export interface PulseView {
	days: number;
	sources: { stripe: boolean; posthog: boolean; sentry: boolean };
	shipping: {
		deploys: number;
		merged: number;
		leadTimeHours: number | null;
		byAgents: number;
		byPeople: number;
		repositories: number;
		failed: { repository: string; reason: string }[];
	};
	snapshot: {
		reading: Reading | null;
		project: string | null;
		thread: string | null;
		agent: string | null;
		error: string | null;
		at: string;
	} | null;
	/** An agent is reading the numbers right now. */
	reading: boolean;
}

/** Home → Pulse on this machine's runner. */
export const pulseService = {
	view: (token: string, days: number) => runnerCall<PulseView>(`/pulse?days=${days}`, token),
	refresh: (token: string, days: number) =>
		runnerCall<{ reading: boolean }>("/pulse/refresh", token, {
			method: "POST",
			body: JSON.stringify({ days }),
		}),
};
