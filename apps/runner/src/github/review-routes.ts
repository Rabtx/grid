import type { Who } from "../auth";
import { isAdmin, may, NOT_ALLOWED } from "../permissions";
import { ReviewError, type PullReviews } from "./reviews";

/**
 * Pull request reviews over HTTP (a project's Pull requests page). Everyone in the workspace sees
 * how a project's reviews are set and the latest ones; owners and admins turn them on and change
 * them; anyone who may start agents asks for one by hand.
 *
 *   GET  /reviews?project=web
 *   PUT  /reviews/settings      { project, enabled?, provider?, model?, instructions? }
 *   POST /reviews/run           { project, number }
 */
export async function reviewRequest(
	request: Request,
	url: URL,
	who: Who,
	reviews: PullReviews,
): Promise<Response | null> {
	if (url.pathname !== "/reviews" && !url.pathname.startsWith("/reviews/")) return null;
	const failure = (status: number, message: string) => Response.json({ message }, { status });
	try {
		if (url.pathname === "/reviews" && request.method === "GET") {
			const project = url.searchParams.get("project") ?? "";
			if (!project) return failure(400, "Say which project");
			return Response.json({
				data: {
					settings: reviews.settings(who.workspace, project),
					reviews: reviews.list(who.workspace, project),
					canManage: isAdmin(who),
				},
			});
		}
		const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
		const project = typeof body.project === "string" ? body.project : "";
		if (url.pathname === "/reviews/settings" && request.method === "PUT")
			return Response.json({ data: reviews.save(who, project, body) });
		if (url.pathname === "/reviews/run" && request.method === "POST") {
			if (!may(who, "startAgents")) return failure(403, NOT_ALLOWED);
			return Response.json(
				{ data: await reviews.reviewNow(who, project, Number(body.number), false) },
				{ status: 202 },
			);
		}
		return failure(405, "Method not allowed");
	} catch (cause) {
		if (cause instanceof ReviewError) return failure(cause.status, cause.message);
		throw cause;
	}
}
