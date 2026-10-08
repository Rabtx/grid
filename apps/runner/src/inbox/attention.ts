import type { ChatEvent } from "../agents/events";
import type { ChatSessionRow } from "../chat/store";
import { attention, chatUrl } from "../push/notifier";

import type { InboxDraft } from "./store";

/**
 * The inbox row a moment in a thread deserves, or null when it deserves none. The same answer that
 * decides whether a push notification is sent decides this, so a thread that pushes also appears on
 * the page for someone who has notifications off.
 */
export function inboxItem(
	session: ChatSessionRow,
	event: ChatEvent,
	now: string = new Date().toISOString(),
): InboxDraft | null {
	const what = attention(event);
	if (!what) return null;
	// A turn says when it ended and an approval has an id of its own, so the same event asked about
	// twice is the same row. An agent whose turn carried no time falls back to when we heard it.
	const at = event.type === "turn_end" ? (event.at ?? now) : now;
	return {
		id:
			event.type === "approval"
				? approvalItemId(session.id, event.id)
				: `${what.kind}:${session.id}:${at}`,
		workspaceId: session.workspaceId,
		kind: what.kind,
		project: session.project,
		title: session.title,
		body: what.body,
		url: chatUrl(session),
		createdAt: at,
	};
}

/** The inbox row an approval keeps, so its answer can settle the same row. */
export function approvalItemId(sessionId: string, approvalId: string): string {
	return `approval:${sessionId}:${approvalId}`;
}
