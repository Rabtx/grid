import type { ChatStore } from "../chat/store";
import { isEnvironmentToken, type PairingStore } from "./pairing";

/** At most this many events in one page. */
export const EXPORT_PAGE = 1500;

/**
 * The environment side of keeping its threads in Grid's database: the paired home Grid reads them
 * here, and sends them on through its own API (an environment holds no key to Grid's API, so it
 * cannot send them itself). Answers only a pairing token, and only for the workspace it paired with.
 * Read-only: `GET /sync/threads` and `GET /sync/threads/<id>/events?after=<seq>`.
 */
export function syncExportRequest(
	request: Request,
	url: URL,
	pairing: PairingStore,
	store: ChatStore,
): Response | null {
	if (!url.pathname.startsWith("/sync/")) return null;
	const header = request.headers.get("authorization") ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : "";
	const workspace = isEnvironmentToken(token) ? pairing.verify(token) : null;
	if (!workspace) return Response.json({ message: "Not paired" }, { status: 401 });
	if (request.method !== "GET") return Response.json({ message: "Use GET" }, { status: 405 });

	if (url.pathname === "/sync/threads") {
		return Response.json({ data: store.syncList(workspace) });
	}
	const events = url.pathname.match(/^\/sync\/threads\/([\w-]+)\/events$/);
	if (events?.[1]) {
		const id = events[1];
		const thread = store.get(id);
		if (!thread || thread.workspaceId !== workspace)
			return Response.json({ message: "No such thread" }, { status: 404 });
		const after = Number(url.searchParams.get("after") ?? 0);
		if (!Number.isInteger(after) || after < 0)
			return Response.json({ message: "after must be a whole number" }, { status: 400 });
		return Response.json({ data: store.eventsAfter(id, after, EXPORT_PAGE) });
	}
	return Response.json({ message: "Not found" }, { status: 404 });
}
