import { describe, expect, it } from "bun:test";

import { withRoleBrief } from "./hub";

describe("a thread started as a role", () => {
	it("gives the agent the role and its brief before the first message", () => {
		const text = withRoleBrief(
			{ id: "r1", name: "Code reviewer", icon: "review", brief: "Reviews against house rules." },
			"Look at PR 12",
		);
		expect(text).toBe(
			"You are working as the team's Code reviewer. What this role does:\nReviews against house rules.\n\n---\n\nLook at PR 12",
		);
	});

	it("still names the role when it has no brief", () => {
		expect(withRoleBrief({ id: "r1", name: "Engineer", icon: "code", brief: " " }, "Hi")).toBe(
			"You are working as the team's Engineer.\n\n---\n\nHi",
		);
	});
});
