import { runnerCall } from "@/lib/runner-client";

import type { InboxView } from "../types/inbox.types";

/**
 * What is waiting on the people in a workspace. `scope` is empty for this machine and
 * `/env/<id>` for an environment, so a project on a Codespace answers from there like every other
 * per-project call does.
 */
function base(scope: string): string {
	return `${scope}/inbox`;
}

export const inboxService = {
	list: (token: string, scope = "", refresh = false) =>
		runnerCall<InboxView>(`${base(scope)}${refresh ? "?refresh=1" : ""}`, token),
	unread: (token: string, scope = "") =>
		runnerCall<{ unread: number }>(`${base(scope)}/unread`, token),
	/**
	 * Marks an item read, everything pointing at one page read, or (with neither) all of it. The
	 * page is asked to open a thread; whatever was waiting about that thread is dealt with.
	 */
	read: (token: string, what: { id?: string; path?: string }, scope = "") =>
		runnerCall<{ changed: number; unread: number }>(`${base(scope)}/read`, token, {
			method: "POST",
			body: JSON.stringify(what),
		}),
};
