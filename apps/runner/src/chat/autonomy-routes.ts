import type { Who } from "../auth";
import { may, NOT_ALLOWED } from "../permissions";
import type { Goals } from "./goals";
import { ChatError } from "./hub";
import type { LimitResumes } from "./limit-resume";

/** What keeps a thread going on its own, as the console reaches it. */
export type AutonomyDeps = { goals: Goals; limits: LimitResumes };

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/**
 * A thread's goal (`GET`, and `POST { objective, maxTurns? }` or `{ action: "pause" | "resume" |
 * "clear" }`), and cancelling its wait for a usage limit to reset (`DELETE …/limit-wait`). Null for
 * paths it does not own.
 */
export async function autonomyRequest(
	request: Request,
	url: URL,
	who: Who,
	deps: AutonomyDeps,
): Promise<Response | null> {
	const goal = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/goal$/);
	const wait = url.pathname.match(/^\/chat\/sessions\/([\w-]+)\/limit-wait$/);
	if (!goal && !wait) return null;
	try {
		if (goal && request.method === "GET")
			return Response.json({ data: deps.goals.get(who.workspace, goal[1] ?? "") });
		if (goal && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const id = goal[1] ?? "";
			if (body.action === "pause" || body.action === "resume" || body.action === "clear")
				return Response.json({ data: deps.goals.act(who.workspace, id, body.action) });
			if (typeof body.objective !== "string") return failure(400, "Say what done means");
			const turns = typeof body.maxTurns === "number" ? body.maxTurns : undefined;
			return Response.json(
				{ data: deps.goals.set(who.workspace, id, body.objective, turns) },
				{ status: 201 },
			);
		}
		if (wait && request.method === "DELETE") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			deps.goals.get(who.workspace, wait[1] ?? "");
			if (!deps.limits.cancel(wait[1] ?? ""))
				return failure(404, "This thread is not waiting for a usage limit");
			return new Response(null, { status: 204 });
		}
		return failure(405, "Method not allowed");
	} catch (cause) {
		if (cause instanceof ChatError) return failure(cause.status, cause.message);
		throw cause;
	}
}
