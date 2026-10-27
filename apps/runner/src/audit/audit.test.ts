import { describe, expect, it } from "bun:test";

import { Budgets } from "../spend/budgets";
import { SpendLedger } from "../spend/ledger";
import { spendRequest } from "../spend/routes";
import { AuditLog } from "./audit-log";
import { auditRequest } from "./routes";

const admin = { userId: "ana", workspace: "acme", role: "admin" as const };
const member = { userId: "bo", workspace: "acme", role: "member" as const };

function entry(log: AuditLog, at: string, patch: Partial<Parameters<AuditLog["record"]>[0]> = {}) {
	return log.record({
		workspaceId: "acme",
		at,
		actor: { kind: "agent_key", id: "k1", name: "Cursor" },
		action: "thread.start",
		project: "web",
		sessionId: "t1",
		target: "Fix the build",
		detail: null,
		...patch,
	});
}

describe("the audit log", () => {
	it("lists newest first, a page at a time, by kind of actor or one actor, in its workspace only", () => {
		const log = new AuditLog(":memory:");
		entry(log, "2026-10-27T10:00:00.000Z");
		entry(log, "2026-10-27T11:00:00.000Z", {
			actor: { kind: "guest", id: "g1", name: "Dana" },
			action: "guest.ask",
		});
		entry(log, "2026-10-27T12:00:00.000Z", { workspaceId: "other" });
		expect(log.list("acme").map((item) => item.action)).toEqual(["guest.ask", "thread.start"]);
		expect(log.list("acme", { kind: "guest" })).toHaveLength(1);
		expect(log.list("acme", { actorId: "k1" })).toHaveLength(1);
		expect(
			log.list("acme", { before: "2026-10-27T11:00:00.000Z" }).map((item) => item.action),
		).toEqual(["thread.start"]);
	});
	it("cuts long text and lets entries go after 90 days", () => {
		const log = new AuditLog(":memory:");
		const long = entry(log, "2026-01-01T00:00:00.000Z", { detail: "x".repeat(5_000) });
		expect(long.detail?.length).toBeLessThan(1_010);
		entry(log, "2026-10-27T00:00:00.000Z");
		log.prune(Date.parse("2026-10-28T00:00:00.000Z"));
		expect(log.list("acme")).toHaveLength(1);
	});
	it("is for owners and admins, with what each entry's thread cost", () => {
		const log = new AuditLog(":memory:");
		const ledger = new SpendLedger(":memory:");
		ledger.report({ workspaceId: "acme", ownerId: "bo", project: "web", sessionId: "t1" }, 1.25);
		entry(log, "2026-10-27T10:00:00.000Z");
		entry(log, "2026-10-27T11:00:00.000Z", { sessionId: null, action: "key.create" });
		const ask = (who: typeof admin | typeof member, query = "") => {
			const url = new URL(`http://runner/audit${query}`);
			return auditRequest(new Request(url.href), url, who, log, ledger);
		};
		expect(ask(member)?.status).toBe(403);
		expect(ask(admin, "?kind=robot")?.status).toBe(400);
		return ask(admin)
			?.json()
			.then((body) => {
				const rows = (body as { data: { action: string; costUsd: number | null }[] }).data;
				expect(rows.map((row) => [row.action, row.costUsd])).toEqual([
					["key.create", null],
					["thread.start", 1.25],
				]);
			});
	});
});

describe("spending over HTTP", () => {
	it("shows everyone the workspace's spending, and lets only admins set budgets", async () => {
		const ledger = new SpendLedger(":memory:");
		const budgets = new Budgets(":memory:", { ledger });
		const now = Date.UTC(2026, 9, 27, 12);
		ledger.report({ workspaceId: "acme", ownerId: "bo", project: "web", sessionId: "t1" }, 3, now);
		const call = async (
			who: typeof admin | typeof member,
			method: string,
			path: string,
			body?: unknown,
		): Promise<Response> => {
			const url = new URL(`http://runner${path}`);
			const response = await spendRequest(
				new Request(url.href, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
				url,
				who,
				budgets,
				ledger,
				now,
			);
			if (!response) throw new Error("not a spending request");
			return response;
		};
		expect(
			(
				await call(member, "POST", "/spend/budgets", {
					scope: "workspace",
					period: "day",
					limitUsd: 5,
				})
			).status,
		).toBe(403);
		const made = await call(admin, "POST", "/spend/budgets", {
			scope: "workspace",
			period: "day",
			limitUsd: 5,
		});
		expect(made.status).toBe(201);
		const id = ((await made.json()) as { data: { id: string } }).data.id;
		const seen = (await (await call(member, "GET", "/spend")).json()) as {
			data: {
				today: number;
				month: number;
				byProject: unknown[];
				budgets: { spentUsd: number; state: string }[];
				canManage: boolean;
			};
		};
		expect(seen.data).toMatchObject({ today: 3, month: 3, canManage: false });
		expect(seen.data.byProject).toEqual([{ key: "web", usd: 3 }]);
		expect(seen.data.budgets[0]).toMatchObject({ spentUsd: 3, state: "ok" });
		expect(
			(
				await call(admin, "PUT", `/spend/budgets/${id}`, {
					scope: "workspace",
					period: "day",
					limitUsd: 2,
				})
			).status,
		).toBe(200);
		expect((await call(admin, "DELETE", `/spend/budgets/${id}`)).status).toBe(204);
		expect((await call(admin, "DELETE", `/spend/budgets/${id}`)).status).toBe(404);
	});
});
