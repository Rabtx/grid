import { describe, expect, it } from "vitest";

import type { PullDetail } from "../types/github.types";
import { mergeBlocker, reviewLabel, sortChecks, stateLabel } from "./pulls";

const pull = (change: Partial<PullDetail> = {}): PullDetail => ({
	number: 1,
	title: "A change",
	author: "ana",
	branch: "change",
	base: "main",
	draft: false,
	review: null,
	checks: "passing",
	labels: [],
	additions: 1,
	deletions: 0,
	updatedAt: "2026-09-27T10:00:00Z",
	url: "https://github.com/acme/app/pull/1",
	body: "",
	state: "OPEN",
	mergeable: "MERGEABLE",
	checkList: [],
	conversation: [],
	files: [],
	createdAt: "2026-09-27T09:00:00Z",
	...change,
});

describe("pull request wording", () => {
	it("names where it stands", () => {
		expect(stateLabel(pull()).label).toBe("Open");
		expect(stateLabel(pull({ draft: true })).label).toBe("Draft");
		expect(stateLabel(pull({ state: "MERGED" })).label).toBe("Merged");
		expect(reviewLabel("CHANGES_REQUESTED")).toEqual({
			label: "Changes requested",
			tone: "danger",
		});
		expect(reviewLabel(null)).toBeNull();
	});

	it("says what merging waits for", () => {
		expect(mergeBlocker(pull())).toBeNull();
		expect(mergeBlocker(pull({ draft: true }))).toBe("Mark it ready for review first");
		expect(mergeBlocker(pull({ mergeable: "CONFLICTING" }))).toBe(
			"It has conflicts with its base branch",
		);
		expect(mergeBlocker(pull({ state: "CLOSED" }))).toBe("It is not open");
	});

	it("lists failing checks first, then running ones", () => {
		const check = (name: string, state: "success" | "failure" | "pending") => ({
			name,
			workflow: null,
			url: null,
			state,
		});
		expect(
			sortChecks([check("b", "success"), check("a", "pending"), check("c", "failure")]).map(
				(item) => item.name,
			),
		).toEqual(["c", "a", "b"]);
	});
});
