import type { Who } from "../auth";
import { type Search, SearchError } from "./service";

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}

/**
 * Search and Ask Grid over HTTP: `GET /search?q=&project=` (threads and files on this machine) and
 * `POST /ask` (`{ question, project?, history? }`: an answer with the sources it cites). Both see
 * only what the person can: their workspace, asked of the API as them.
 */
export async function searchRequest(
	request: Request,
	url: URL,
	who: Who,
	search: Search,
): Promise<Response | null> {
	if (url.pathname !== "/search" && url.pathname !== "/ask") return null;
	try {
		if (url.pathname === "/search" && request.method === "GET")
			return Response.json({
				data: await search.search(who, {
					query: (url.searchParams.get("q") ?? "").slice(0, 200),
					project: url.searchParams.get("project") || null,
				}),
			});
		if (url.pathname === "/ask" && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as {
				question?: unknown;
				project?: unknown;
				history?: unknown;
			};
			const header = request.headers.get("authorization") ?? "";
			const auth = {
				token: header.startsWith("Bearer ") ? header.slice(7) : "",
				workspace: request.headers.get("x-grid-workspace") ?? "",
			};
			const history = (Array.isArray(body.history) ? body.history : [])
				.filter(
					(turn): turn is { question: string; answer: string } =>
						typeof turn?.question === "string" && typeof turn?.answer === "string",
				)
				.map((turn) => ({
					question: turn.question.slice(0, 500),
					answer: turn.answer.slice(0, 2000),
				}));
			return Response.json({
				data: await search.ask(who, auth, {
					question: typeof body.question === "string" ? body.question : "",
					project: typeof body.project === "string" && body.project ? body.project : null,
					history,
				}),
			});
		}
		return failure(405, "Not allowed");
	} catch (cause) {
		if (cause instanceof SearchError) return failure(cause.status, cause.message);
		if (cause instanceof Error && "status" in cause && typeof cause.status === "number")
			return failure(cause.status, cause.message);
		throw cause;
	}
}
