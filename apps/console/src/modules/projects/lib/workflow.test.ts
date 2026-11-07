import { describe, expect, it } from "vitest";

import {
	addState,
	boardStates,
	DEFAULT_WORKFLOW,
	moveState,
	newStateKey,
	removeState,
	renameState,
	setHidden,
	statusName,
	workflowOf,
} from "./workflow";

const flow = [...DEFAULT_WORKFLOW];
const keys = (states: readonly { key: string }[]) => states.map((state) => state.key);

describe("workflow", () => {
	it("is the default until a project sets its own", () => {
		expect(keys(workflowOf({}))).toEqual(keys(DEFAULT_WORKFLOW));
		expect(statusName(flow, "ready")).toBe("Todo");
	});

	it("shows one column per shown status, and a hidden one only while a task is in it", () => {
		expect(keys(boardStates(flow, []))).toEqual([
			"backlog",
			"ready",
			"in_progress",
			"review",
			"done",
		]);
		expect(keys(boardStates(flow, [{ status: "qa" }]))).toContain("qa");
		expect(keys(boardStates(flow, [{ status: "gone_status" }]))).toContain("gone_status");
	});

	it("adds a status after the last of its kind, with a key of its own", () => {
		const next = addState(flow, "Design review", "review");
		expect(keys(next).indexOf("design_review")).toBe(keys(next).indexOf("qa") + 1);
		expect(newStateKey(next, "Design review")).toBe("design_review_2");
		expect(newStateKey(flow, "1st pass")).toBe("s_1st_pass");
	});

	it("renames, hides (never the last shown), reorders past hidden ones, and removes only its own", () => {
		expect(statusName(renameState(flow, "ready", "Up next"), "ready")).toBe("Up next");
		const one = flow.map((state) => (state.key === "done" ? state : { ...state, hidden: true }));
		expect(
			setHidden(one, "done", true).find((state) => state.key === "done")?.hidden,
		).toBeUndefined();
		expect(keys(moveState(flow, "in_progress", 1)).indexOf("in_progress")).toBe(
			keys(flow).indexOf("review"),
		);
		expect(keys(removeState(flow, "review"))).toContain("review");
		expect(keys(removeState(addState(flow, "Triage", "backlog"), "triage"))).not.toContain(
			"triage",
		);
	});
});
