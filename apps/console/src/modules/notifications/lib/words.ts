import type { InboxKind } from "@/modules/inbox";

const VERB = /^(run|edit|write|create|delete|remove|read|fetch|open|move|rename|install|push)\b/i;

/** What an approval asks, as a person would say it: "Wants to run bun add zod". */
export function approvalLine(title: string): string {
	const asked = title.trim();
	return VERB.test(asked)
		? `Wants to ${asked[0]?.toLowerCase() ?? ""}${asked.slice(1)}`
		: `Wants to run ${asked}`;
}

/** A notification's title for something that arrived in the Inbox. */
export const ARRIVAL_TITLE: Record<Exclude<InboxKind, "approval">, string> = {
	incident_open: "Service outage",
	incident_resolved: "Service recovered",
	turn_done: "Run finished",
	turn_error: "Run failed",
	pull_review: "Pull request ready",
	pull_checks: "Checks are failing",
};

/** "now" for the first minute, then minutes, then hours. */
export function since(at: number, now = Date.now()): string {
	const minutes = Math.floor((now - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h`;
}
