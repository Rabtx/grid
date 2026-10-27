import type { Who } from "../auth";
import { isAdmin } from "../permissions";
import { BudgetError, type Budgets, periodStart } from "./budgets";
import type { SpendLedger } from "./ledger";

/**
 * Spending over HTTP (Settings → Spending): what the workspace spent today and this month, by
 * project and by person, and its budgets with what each has used; owners and admins set them.
 *
 *   GET    /spend
 *   POST   /spend/budgets            { scope, target?, period, limitUsd }
 *   PUT    /spend/budgets/:id
 *   DELETE /spend/budgets/:id
 */
export async function spendRequest(
	request: Request,
	url: URL,
	who: Who,
	budgets: Budgets,
	ledger: SpendLedger,
	now = Date.now(),
): Promise<Response | null> {
	if (url.pathname !== "/spend" && !url.pathname.startsWith("/spend/")) return null;
	const failure = (status: number, message: string) => Response.json({ message }, { status });
	try {
		if (url.pathname === "/spend" && request.method === "GET") {
			const month = periodStart("month", now);
			return Response.json({
				data: {
					today: ledger.total(who.workspace, {}, periodStart("day", now)),
					month: ledger.total(who.workspace, {}, month),
					byProject: ledger.breakdown(who.workspace, "project", month),
					byPerson: ledger.breakdown(who.workspace, "owner", month),
					budgets: budgets.status(who.workspace, now),
					canManage: isAdmin(who),
				},
			});
		}
		if (url.pathname === "/spend/budgets" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			return Response.json({ data: budgets.save(who, body) }, { status: 201 });
		}
		const one = url.pathname.match(/^\/spend\/budgets\/([\w-]{1,80})$/);
		if (one && request.method === "PUT") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			return Response.json({ data: budgets.save(who, body, one[1]) });
		}
		if (one && request.method === "DELETE") {
			budgets.remove(who, one[1] ?? "");
			return new Response(null, { status: 204 });
		}
		return failure(405, "Method not allowed");
	} catch (cause) {
		if (cause instanceof BudgetError) return failure(cause.status, cause.message);
		throw cause;
	}
}
