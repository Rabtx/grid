import { describe, expect, it } from "vitest";

import type { PullDetail } from "../types/github.types";
import { mergeBlocker } from "./pulls";

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
	it("says what merging waits for", () => {
		expect(mergeBlocker(pull())).toBeNull();
		expect(mergeBlocker(pull({ draft: true }))).toBe("Mark it ready for review first");
		expect(mergeBlocker(pull({ mergeable: "CONFLICTING" }))).toBe(
			"It has conflicts with its base branch",
		);
		expect(mergeBlocker(pull({ state: "CLOSED" }))).toBe("It is not open");
	});
});
