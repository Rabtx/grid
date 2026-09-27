import type { Who } from "../auth";

import type { GithubInbox } from "./github";
import type { InboxStore } from "./store";

export type InboxDeps = {
	store: InboxStore;
	/** Null when this runner has no GitHub at all; the page then says so instead of failing. */
	github: GithubInbox | null;
	/** The projects directory, so a refresh only looks at folders inside it. */
	projectsDir: string;
};

/**
 * A page of the console, as an item's url begins: slugs, paths and no query, so a call cannot
 * dress itself up as a page and clear items that point somewhere else. No `%` or `_` reach SQL
 * either, which are the characters a `LIKE` would read as a wildcard.
 */
const PAGE = /^\/[a-z0-9][a-z0-9/-]*$/;

/**
 * The Inbox over HTTP: `GET /inbox` lists it (asking GitHub first when that is worth doing),
 * `GET /inbox/unread` is the count on its own for the sidebar, and `POST /inbox/read` marks one
 * item or all of them read. Returns null for paths it does not own.
 */
export async function inboxRequest(
	request: Request,
	url: URL,
	who: Who,
	deps: InboxDeps,
): Promise<Response | null> {
	const { store, github, projectsDir } = deps;
	const { userId, workspace } = who;

	if (url.pathname === "/inbox" && request.method === "GET") {
		// `?refresh=1` is the page's own Refresh: it asks GitHub however recently it last did.
		const refresh = url.searchParams.get("refresh") === "1";
		let connected = false;
		if (github) {
			connected = github.available(userId);
			if (connected && (refresh || github.stale(workspace))) {
				await github.sync(userId, workspace, projectsDir);
			}
		}
		const { items, unread } = store.list(workspace);
		return Response.json({ data: { items, unread, github: connected } });
	}

	if (url.pathname === "/inbox/unread" && request.method === "GET") {
		return Response.json({ data: { unread: store.unread(workspace) } });
	}

	if (url.pathname === "/inbox/read" && request.method === "POST") {
		const body = (await request.json().catch(() => ({}))) as { id?: unknown; path?: unknown };
		const id = typeof body.id === "string" ? body.id : undefined;
		const path = typeof body.path === "string" ? body.path : undefined;
		if (body.id !== undefined && id === undefined) return failure(400, "Say which item");
		if (body.path !== undefined && path === undefined) return failure(400, "Say which page");
		if (id !== undefined && path !== undefined) return failure(400, "One item or one page");
		if (path !== undefined && !PAGE.test(path)) return failure(400, "That is not a page");
		// An id that is not here, or was already read, is not an error: the page is asking twice.
		const changed = id !== undefined ? store.read(workspace, id) : store.readAt(workspace, path);
		return Response.json({ data: { changed, unread: store.unread(workspace) } });
	}

	return url.pathname.startsWith("/inbox") ? failure(404, "Not found") : null;
}

function failure(status: number, message: string): Response {
	return Response.json({ message }, { status });
}
