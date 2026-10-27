import { runnerCall } from "@/lib/runner-client";

export type BudgetScope = "workspace" | "person" | "project" | "automation";
export type BudgetPeriod = "day" | "month";

/** A spending limit and what has been spent against it this period (the runner's `spend/`). */
export type BudgetStatus = {
	id: string;
	scope: BudgetScope;
	target: string | null;
	period: BudgetPeriod;
	limitUsd: number;
	createdBy: string;
	spentUsd: number;
	since: string;
	state: "ok" | "warning" | "reached";
};

export type BudgetInput = {
	scope: BudgetScope;
	target: string | null;
	period: BudgetPeriod;
	limitUsd: number;
};

export type Spending = {
	today: number;
	month: number;
	byProject: { key: string; usd: number }[];
	byPerson: { key: string; usd: number }[];
	budgets: BudgetStatus[];
	canManage: boolean;
};

export type AuditActorKind = "person" | "agent_key" | "guest" | "webhook" | "automation" | "grid";

export type AuditEntry = {
	id: string;
	at: string;
	actor: { kind: AuditActorKind; id: string | null; name: string };
	action: string;
	project: string | null;
	sessionId: string | null;
	target: string | null;
	detail: string | null;
	/** What the entry's thread has cost so far; null for an entry without one. */
	costUsd: number | null;
};

export const spendService = {
	get: (token: string) => runnerCall<Spending>("/spend", token),
	createBudget: (token: string, input: BudgetInput) =>
		runnerCall<BudgetStatus>("/spend/budgets", token, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	removeBudget: (token: string, id: string) =>
		runnerCall<void>(`/spend/budgets/${id}`, token, { method: "DELETE" }),
	audit: (token: string, query: { before?: string; kind?: AuditActorKind } = {}) => {
		const params = new URLSearchParams();
		if (query.before) params.set("before", query.before);
		if (query.kind) params.set("kind", query.kind);
		const search = params.toString();
		return runnerCall<AuditEntry[]>(`/audit${search ? `?${search}` : ""}`, token);
	},
};

/** Dollars as Grid shows them: "$1.23", and "<$0.01" for less than a cent. */
export function dollars(value: number): string {
	if (value > 0 && value < 0.01) return "<$0.01";
	return `$${value.toFixed(2)}`;
}
