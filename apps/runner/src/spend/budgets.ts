import type { Database } from "bun:sqlite";

import type { Who } from "../auth";
import type { InboxStore } from "../inbox/store";
import { isAdmin } from "../permissions";
import { openPrivateDatabase } from "../private-database";
import type { SpendLedger, SpendTags } from "./ledger";

/**
 * Spending limits (Settings → Spending): a workspace, a person, a project or an automation may
 * spend so much a day or a month on agents. At 80% Grid says so once (Inbox, and a notification
 * to whoever set it); at 100% it stops the turns going on in that scope and refuses new ones until
 * the period starts again. Days and months are UTC.
 */

export type BudgetScope = "workspace" | "person" | "project" | "automation";
export type BudgetPeriod = "day" | "month";

export type Budget = {
	id: string;
	workspaceId: string;
	scope: BudgetScope;
	/** Who or what it is for: a person's id, a project, an automation; null for the workspace. */
	target: string | null;
	period: BudgetPeriod;
	limitUsd: number;
	createdBy: string;
	createdAt: string;
};

export type BudgetStatus = Budget & {
	spentUsd: number;
	/** When this period began (ISO). */
	since: string;
	state: "ok" | "warning" | "reached";
};

export class BudgetError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

const SCOPES: readonly BudgetScope[] = ["workspace", "person", "project", "automation"];
const PERIODS: readonly BudgetPeriod[] = ["day", "month"];
const WARN_AT = 0.8;
const MOST_BUDGETS = 50;

/** When the period a moment falls in began (UTC). */
export function periodStart(period: BudgetPeriod, now: number): number {
	const at = new Date(now);
	return period === "day"
		? Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
		: Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
}

/** Whether a budget counts this spending (its scope and target match what the cost is for). */
export function covers(budget: Budget, tags: SpendTags): boolean {
	if (budget.workspaceId !== tags.workspaceId) return false;
	switch (budget.scope) {
		case "workspace":
			return true;
		case "person":
			return budget.target === tags.ownerId;
		case "project":
			return budget.target === tags.project;
		case "automation":
			return Boolean(tags.automationId) && budget.target === tags.automationId;
	}
}

/** A budget in words: "The workspace's monthly budget", "Ana's daily budget". */
export function budgetName(
	budget: Budget,
	names: (budget: Budget) => string | null = () => null,
): string {
	const period = budget.period === "day" ? "daily" : "monthly";
	const whose =
		budget.scope === "workspace"
			? "The workspace's"
			: `${names(budget) ?? budget.target ?? budget.scope}'s`;
	return `${whose} ${period} budget`;
}

type Row = {
	id: string;
	workspace_id: string;
	scope: BudgetScope;
	target: string | null;
	period: BudgetPeriod;
	limit_usd: number;
	created_by: string;
	created_at: string;
};

const budgetOf = (row: Row): Budget => ({
	id: row.id,
	workspaceId: row.workspace_id,
	scope: row.scope,
	target: row.target,
	period: row.period,
	limitUsd: row.limit_usd,
	createdBy: row.created_by,
	createdAt: row.created_at,
});

const usd = (value: number) => `$${value.toFixed(2)}`;

export type BudgetDeps = {
	ledger: SpendLedger;
	inbox?: InboxStore;
	/** Tell a person something (a push notification). */
	notify?: (userId: string, title: string, body: string) => void;
	/** Stop the turns going on that a reached budget covers; returns how many it stopped. */
	stop?: (budget: Budget) => number;
	/** A target's name as people know it (a person's, an automation's). */
	names?: (budget: Budget) => string | null;
	/** Something to note in the audit log. */
	audit?: (budget: Budget, action: "budget.warning" | "budget.reached", detail: string) => void;
};

export class Budgets {
	private readonly db: Database;

	constructor(
		path: string,
		private readonly deps: BudgetDeps,
	) {
		this.db = openPrivateDatabase(path);
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS budgets (
				id TEXT PRIMARY KEY,
				workspace_id TEXT NOT NULL,
				scope TEXT NOT NULL,
				target TEXT,
				period TEXT NOT NULL,
				limit_usd REAL NOT NULL,
				created_by TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS budgets_by_workspace ON budgets (workspace_id);
			CREATE TABLE IF NOT EXISTS budget_alerts (
				budget_id TEXT NOT NULL,
				period_start INTEGER NOT NULL,
				level TEXT NOT NULL,
				at TEXT NOT NULL,
				PRIMARY KEY (budget_id, period_start, level)
			);
		`);
	}

	list(workspace: string): Budget[] {
		return this.db
			.query<Row, [string]>("SELECT * FROM budgets WHERE workspace_id = ? ORDER BY created_at")
			.all(workspace)
			.map(budgetOf);
	}

	/** Each budget with what has been spent against it this period. */
	status(workspace: string, now = Date.now()): BudgetStatus[] {
		return this.list(workspace).map((budget) => this.statusOf(budget, now));
	}

	private statusOf(budget: Budget, now: number): BudgetStatus {
		const since = periodStart(budget.period, now);
		const filter =
			budget.scope === "person"
				? { ownerId: budget.target ?? "" }
				: budget.scope === "project"
					? { project: budget.target ?? "" }
					: budget.scope === "automation"
						? { automationId: budget.target ?? "" }
						: {};
		const spentUsd = this.deps.ledger.total(budget.workspaceId, filter, since);
		const ratio = budget.limitUsd > 0 ? spentUsd / budget.limitUsd : 1;
		return {
			...budget,
			spentUsd,
			since: new Date(since).toISOString(),
			state: ratio >= 1 ? "reached" : ratio >= WARN_AT ? "warning" : "ok",
		};
	}

	/** Make a budget, or change one (admins only). */
	save(who: Who, input: Record<string, unknown>, id?: string): Budget {
		if (!isAdmin(who)) throw new BudgetError("Only owners and admins set budgets", 403);
		const scope = input.scope as BudgetScope;
		if (!SCOPES.includes(scope)) throw new BudgetError(`scope is one of ${SCOPES.join(", ")}`, 400);
		const period = input.period as BudgetPeriod;
		if (!PERIODS.includes(period)) throw new BudgetError("period is day or month", 400);
		const limitUsd = Number(input.limitUsd);
		if (!Number.isFinite(limitUsd) || limitUsd < 0.01 || limitUsd > 1_000_000)
			throw new BudgetError("limitUsd is between 0.01 and 1,000,000", 400);
		const target =
			scope === "workspace" ? null : typeof input.target === "string" ? input.target.trim() : "";
		if (scope !== "workspace" && (!target || target.length > 200))
			throw new BudgetError(`Say which ${scope} the budget is for`, 400);
		const existing = id ? this.byId(who.workspace, id) : null;
		if (id && !existing) throw new BudgetError("No such budget", 404);
		if (!existing && this.list(who.workspace).length >= MOST_BUDGETS)
			throw new BudgetError(`A workspace has ${MOST_BUDGETS} budgets at most`, 409);
		const budget: Budget = {
			id: existing?.id ?? crypto.randomUUID(),
			workspaceId: who.workspace,
			scope,
			target,
			period,
			limitUsd: Math.round(limitUsd * 100) / 100,
			createdBy: existing?.createdBy ?? who.userId,
			createdAt: existing?.createdAt ?? new Date().toISOString(),
		};
		this.db
			.query(
				`INSERT INTO budgets (id, workspace_id, scope, target, period, limit_usd, created_by, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT (id) DO UPDATE SET scope = excluded.scope, target = excluded.target,
				 period = excluded.period, limit_usd = excluded.limit_usd`,
			)
			.run(
				budget.id,
				budget.workspaceId,
				budget.scope,
				budget.target,
				budget.period,
				budget.limitUsd,
				budget.createdBy,
				budget.createdAt,
			);
		// A changed budget is judged afresh: its notices may come again.
		this.db.query("DELETE FROM budget_alerts WHERE budget_id = ?").run(budget.id);
		return budget;
	}

	remove(who: Who, id: string): void {
		if (!isAdmin(who)) throw new BudgetError("Only owners and admins set budgets", 403);
		if (!this.byId(who.workspace, id)) throw new BudgetError("No such budget", 404);
		this.db.query("DELETE FROM budgets WHERE id = ?").run(id);
		this.db.query("DELETE FROM budget_alerts WHERE budget_id = ?").run(id);
	}

	private byId(workspace: string, id: string): Budget | null {
		const row = this.db
			.query<Row, [string, string]>("SELECT * FROM budgets WHERE id = ? AND workspace_id = ?")
			.get(id, workspace);
		return row ? budgetOf(row) : null;
	}

	/** Why work on this may not start now (a budget it counts against is used up), or null. */
	refusal(tags: SpendTags, now = Date.now()): string | null {
		for (const budget of this.list(tags.workspaceId)) {
			if (!covers(budget, tags)) continue;
			const status = this.statusOf(budget, now);
			if (status.state === "reached")
				return `${budgetName(budget, this.deps.names)} of ${usd(budget.limitUsd)} is used up (${usd(status.spentUsd)} this ${budget.period}). It starts again ${budget.period === "day" ? "tomorrow" : "next month"} (UTC), or an admin can raise it in Settings → Spending.`;
		}
		return null;
	}

	/**
	 * Something was spent (`ledger.report` added `added`): each budget it counts against is
	 * checked, and says so the first time this period it passes 80% and when it is reached.
	 */
	spent(tags: SpendTags, added: number, now = Date.now()): void {
		if (added <= 0) return;
		for (const budget of this.list(tags.workspaceId)) {
			if (!covers(budget, tags)) continue;
			const status = this.statusOf(budget, now);
			if (status.state === "ok") continue;
			const start = periodStart(budget.period, now);
			if (status.state === "reached" && this.firstAlert(budget.id, start, "reached")) {
				const stopped = this.deps.stop?.(budget) ?? 0;
				this.alert(
					budget,
					"reached",
					`${usd(status.spentUsd)} of ${usd(budget.limitUsd)} spent this ${budget.period}. ${stopped ? `Grid stopped ${stopped} turn${stopped === 1 ? "" : "s"} going on, and` : "Grid"} starts no more work it covers until it resets or is raised.`,
					start,
				);
			} else if (this.firstAlert(budget.id, start, "warning")) {
				this.alert(
					budget,
					"warning",
					`${usd(status.spentUsd)} of ${usd(budget.limitUsd)} spent this ${budget.period}: past 80%.`,
					start,
				);
			}
		}
	}

	/** True once per budget, period and level: the notice has not been given yet. */
	private firstAlert(id: string, start: number, level: "warning" | "reached"): boolean {
		return (
			this.db
				.query(
					"INSERT OR IGNORE INTO budget_alerts (budget_id, period_start, level, at) VALUES (?, ?, ?, ?)",
				)
				.run(id, start, level, new Date().toISOString()).changes > 0
		);
	}

	private alert(budget: Budget, level: "warning" | "reached", body: string, start: number): void {
		const title = `${budgetName(budget, this.deps.names)} ${level === "reached" ? "is used up" : "is nearly used"}`;
		this.deps.inbox?.keep({
			id: `budget:${budget.id}:${start}:${level}`,
			workspaceId: budget.workspaceId,
			kind: "budget",
			project: budget.scope === "project" ? (budget.target ?? "") : "",
			title,
			body,
			url: "/settings/spending",
			createdAt: new Date().toISOString(),
		});
		const people = new Set([budget.createdBy]);
		if (budget.scope === "person" && budget.target) people.add(budget.target);
		for (const person of people) this.deps.notify?.(person, title, body);
		this.deps.audit?.(budget, level === "reached" ? "budget.reached" : "budget.warning", body);
	}

	close(): void {
		this.db.close();
	}
}
