import type { Who } from "../auth";
import { isAdmin } from "../permissions";
import type { SpendLedger } from "../spend/ledger";
import type { AuditActorKind, AuditLog } from "./audit-log";

const KINDS: readonly AuditActorKind[] = [
	"person",
	"agent",
	"agent_key",
	"guest",
	"webhook",
	"automation",
	"grid",
];

/**
 * The audit log over HTTP (Settings → Audit log), for owners and admins: a page of entries,
 * newest first, each with what its thread has cost so far.
 *
 *   GET /audit?before=<time>&kind=<actor kind>&actor=<actor id>
 */
export function auditRequest(
	request: Request,
	url: URL,
	who: Who,
	audit: AuditLog,
	ledger: SpendLedger,
): Response | null {
	if (url.pathname !== "/audit") return null;
	if (request.method !== "GET") return Response.json({ message: "Use GET" }, { status: 405 });
	if (!isAdmin(who))
		return Response.json({ message: "Only owners and admins see the audit log" }, { status: 403 });
	const kind = url.searchParams.get("kind");
	if (kind && !(KINDS as readonly string[]).includes(kind))
		return Response.json({ message: `kind is one of ${KINDS.join(", ")}` }, { status: 400 });
	const entries = audit.list(who.workspace, {
		before: url.searchParams.get("before") ?? undefined,
		kind: (kind as AuditActorKind | null) ?? undefined,
		actorId: url.searchParams.get("actor") ?? undefined,
	});
	const costs = ledger.byThread([
		...new Set(entries.flatMap((entry) => (entry.sessionId ? [entry.sessionId] : []))),
	]);
	return Response.json({
		data: entries.map((entry) => ({
			...entry,
			costUsd: entry.sessionId ? (costs.get(entry.sessionId) ?? 0) : null,
		})),
	});
}
