import { describe, expect, it } from "bun:test";

import { withRoleBrief } from "./hub";

describe("a thread started as a teammate", () => {
	it("gives the agent the teammate and its brief before the first message", () => {
		const text = withRoleBrief(
			{ id: "r1", name: "Code reviewer", icon: "review", brief: "Reviews against house rules." },
			"Look at PR 12",
		);
		expect(text).toBe(
			"You are Code reviewer, a teammate on this team.\nReviews against house rules.\n\n---\n\nLook at PR 12",
		);
	});

	it("still names the teammate when it has no brief", () => {
		expect(withRoleBrief({ id: "r1", name: "Engineer", icon: "code", brief: " " }, "Hi")).toBe(
			"You are Engineer, a teammate on this team.\n\n---\n\nHi",
		);
	});
});
