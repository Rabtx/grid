import { describe, expect, it } from "bun:test";

import { InboxStore } from "../inbox/store";
import { type Budget, budgetName, Budgets, covers, periodStart } from "./budgets";
import { SpendLedger, type SpendTags } from "./ledger";

const admin = { userId: "ana", workspace: "acme", role: "admin" as const };
const member = { userId: "bo", workspace: "acme", role: "member" as const };
const tags = (patch: Partial<SpendTags> = {}): SpendTags => ({
	workspaceId: "acme",
	ownerId: "bo",
	project: "web",
	sessionId: "t1",
	...patch,
});
const NOON = Date.UTC(2026, 9, 27, 12);

describe("the spend ledger", () => {
	it("keeps each rise in a thread's running total, and a new process's total whole", () => {
		const ledger = new SpendLedger(":memory:");
		expect(ledger.report(tags(), 0.5, NOON)).toBe(0.5);
		expect(ledger.report(tags(), 0.8, NOON)).toBeCloseTo(0.3);
		expect(ledger.report(tags(), 0.8, NOON)).toBe(0);
		// The agent's process started again: its total counts from nothing.
		expect(ledger.report(tags(), 0.2, NOON)).toBe(0.2);
		expect(ledger.report(tags(), Number.NaN, NOON)).toBe(0);
		expect(ledger.total("acme", {}, 0)).toBeCloseTo(1);
	});
	it("adds up by person, project, automation, key and thread, since a time", () => {
		const ledger = new SpendLedger(":memory:");
		ledger.report(tags({ sessionId: "a", automationId: "nightly" }), 1, NOON - 86_400_000);
		ledger.report(tags({ sessionId: "b", keyId: "k1" }), 2, NOON);
		ledger.report(tags({ sessionId: "c", ownerId: "ana", project: "api" }), 4, NOON);
		ledger.report(tags({ sessionId: "d", workspaceId: "other" }), 8, NOON);
		expect(ledger.total("acme", {}, 0)).toBe(7);
		expect(ledger.total("acme", {}, NOON - 1000)).toBe(6);
		expect(ledger.total("acme", { ownerId: "bo" }, 0)).toBe(3);
		expect(ledger.total("acme", { project: "api" }, 0)).toBe(4);
		expect(ledger.total("acme", { automationId: "nightly" }, 0)).toBe(1);
		expect(ledger.total("acme", { keyId: "k1" }, 0)).toBe(2);
		expect([...ledger.byThread(["a", "c", "zz"])]).toEqual([
			["a", 1],
			["c", 4],
		]);
		expect(ledger.breakdown("acme", "project", 0)).toEqual([
			{ key: "api", usd: 4 },
			{ key: "web", usd: 3 },
		]);
	});
});

describe("budgets", () => {
	function setup() {
		const ledger = new SpendLedger(":memory:");
		const inbox = new InboxStore(":memory:");
		const told: string[] = [];
		const stopped: string[] = [];
		const audited: string[] = [];
		const budgets = new Budgets(":memory:", {
			ledger,
			inbox,
			notify: (userId, title) => told.push(`${userId}: ${title}`),
			stop: (budget) => {
				stopped.push(budget.id);
				return 2;
			},
			audit: (_budget, action) => audited.push(action),
		});
		const spend = (usd: number, patch: Partial<SpendTags> = {}, now = NOON) => {
			const at = tags(patch);
			budgets.spent(at, ledger.report(at, usd, now), now);
		};
		return { ledger, inbox, budgets, told, stopped, audited, spend };
	}

	it("start each day and month at midnight UTC", () => {
		expect(new Date(periodStart("day", NOON)).toISOString()).toBe("2026-10-27T00:00:00.000Z");
		expect(new Date(periodStart("month", NOON)).toISOString()).toBe("2026-10-01T00:00:00.000Z");
	});

	it("are set by owners and admins only, with a scope, a period and a limit", () => {
		const { budgets } = setup();
		expect(() =>
			budgets.save(member, { scope: "workspace", period: "month", limitUsd: 10 }),
		).toThrow("Only owners and admins");
		expect(() => budgets.save(admin, { scope: "team", period: "month", limitUsd: 10 })).toThrow();
		expect(() =>
			budgets.save(admin, { scope: "workspace", period: "week", limitUsd: 10 }),
		).toThrow();
		expect(() =>
			budgets.save(admin, { scope: "workspace", period: "month", limitUsd: 0 }),
		).toThrow();
		expect(() => budgets.save(admin, { scope: "person", period: "day", limitUsd: 5 })).toThrow(
			"Say which person",
		);
		const made = budgets.save(admin, {
			scope: "project",
			target: "web",
			period: "day",
			limitUsd: 5.555,
		});
		expect(made).toMatchObject({
			scope: "project",
			target: "web",
			limitUsd: 5.56,
			createdBy: "ana",
		});
		expect(
			budgets.save(admin, { scope: "project", target: "web", period: "day", limitUsd: 6 }, made.id)
				.limitUsd,
		).toBe(6);
		budgets.remove(admin, made.id);
		expect(budgets.list("acme")).toEqual([]);
	});

	it("cover only what their scope names", () => {
		const budget = (scope: Budget["scope"], target: string | null): Budget => ({
			id: "b",
			workspaceId: "acme",
			scope,
			target,
			period: "day",
			limitUsd: 1,
			createdBy: "ana",
			createdAt: "",
		});
		expect(covers(budget("workspace", null), tags())).toBe(true);
		expect(covers(budget("workspace", null), tags({ workspaceId: "x" }))).toBe(false);
		expect(covers(budget("person", "bo"), tags())).toBe(true);
		expect(covers(budget("person", "ana"), tags())).toBe(false);
		expect(covers(budget("project", "web"), tags())).toBe(true);
		expect(covers(budget("automation", "nightly"), tags())).toBe(false);
		expect(covers(budget("automation", "nightly"), tags({ automationId: "nightly" }))).toBe(true);
		expect(budgetName(budget("person", "bo"), () => "Bo")).toBe("Bo's daily budget");
	});

	it("warn once past 80%, stop and refuse at 100%, and start again next period", () => {
		const { budgets, inbox, told, stopped, audited, spend } = setup();
		const budget = budgets.save(admin, {
			scope: "person",
			target: "bo",
			period: "day",
			limitUsd: 10,
		});
		spend(5);
		expect(budgets.status("acme", NOON)[0]).toMatchObject({ spentUsd: 5, state: "ok" });
		spend(8.5);
		spend(8.6);
		expect(budgets.status("acme", NOON)[0]?.state).toBe("warning");
		expect(budgets.refusal(tags(), NOON)).toBeNull();
		spend(10.2);
		expect(budgets.status("acme", NOON)[0]?.state).toBe("reached");
		spend(10.5);
		expect(stopped).toEqual([budget.id]);
		expect(audited).toEqual(["budget.warning", "budget.reached"]);
		expect(told).toEqual([
			"ana: bo's daily budget is nearly used",
			"bo: bo's daily budget is nearly used",
			"ana: bo's daily budget is used up",
			"bo: bo's daily budget is used up",
		]);
		expect(inbox.list("acme", "bo").items.map((item) => item.kind)).toEqual(["budget", "budget"]);
		expect(budgets.refusal(tags(), NOON)).toContain("used up");
		// Someone else's work is not counted against Bo's budget, nor stopped by it.
		expect(budgets.refusal(tags({ ownerId: "ana" }), NOON)).toBeNull();
		// The next day starts again.
		expect(budgets.refusal(tags(), NOON + 86_400_000)).toBeNull();
	});

	it("say again when a budget is changed", () => {
		const { budgets, told, spend } = setup();
		const budget = budgets.save(admin, { scope: "workspace", period: "month", limitUsd: 1 });
		spend(2);
		expect(told).toHaveLength(1);
		budgets.save(admin, { scope: "workspace", period: "month", limitUsd: 1.5 }, budget.id);
		spend(2.1);
		expect(told).toHaveLength(2);
	});
});
