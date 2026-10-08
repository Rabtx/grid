import { describe, expect, it } from "bun:test";

import type { ChatEvent } from "../agents/events";
import type { ChatSessionRow } from "../chat/store";

import { approvalItemId, inboxItem } from "./attention";

const session = {
	id: "s1",
	ownerId: "me",
	workspaceId: "acme",
	project: "grid",
	title: "Fix the login",
} as ChatSessionRow;

const at = "2026-09-28T09:00:00.000Z";

describe("inboxItem", () => {
	it("keeps a row for an approval, a finished turn and a failure, and skips a cancel", () => {
		expect(
			inboxItem(session, { type: "approval", id: "a1", title: "Run tests", options: [] }, at),
		).toEqual({
			id: "approval:s1:a1",
			workspaceId: "acme",
			kind: "approval",
			project: "grid",
			title: "Fix the login",
			body: "Needs your approval: Run tests",
			url: "/chat/grid/s1",
			createdAt: at,
		});
		// An answer settles the row by the same id the request was kept under.
		expect(approvalItemId("s1", "a1")).toBe("approval:s1:a1");
		expect(inboxItem(session, { type: "turn_end", reason: "done", at }, at)?.id).toBe(
			`turn_done:s1:${at}`,
		);
		expect(
			inboxItem(session, { type: "turn_end", reason: "error", error: "Out of credit" }, at),
		).toMatchObject({ kind: "turn_error", body: "Stopped: Out of credit" });
		expect(inboxItem(session, { type: "turn_end", reason: "cancelled" }, at)).toBeNull();
		expect(inboxItem(session, { type: "message", text: "hi" }, at)).toBeNull();
	});

	it("keeps the row the turn says it began at, and falls back to when it was heard", () => {
		const turn: ChatEvent = { type: "turn_end", reason: "done", at: "2026-09-28T08:00:00.000Z" };
		expect(inboxItem(session, turn, at)?.createdAt).toBe("2026-09-28T08:00:00.000Z");
		// An agent that reports no time still leaves a row, and it is the same row every time.
		const untimed: ChatEvent = { type: "turn_end", reason: "done" };
		expect(inboxItem(session, untimed, at)?.id).toBe(inboxItem(session, untimed, at)?.id);
		expect(inboxItem(session, untimed, at)?.createdAt).toBe(at);
	});
});
