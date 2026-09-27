import { describe, expect, it } from "vitest";

import { waitedOn } from "./opened";

describe("waitedOn", () => {
	it("names the thread a chat path is waiting on", () => {
		expect(waitedOn("/chat/grid/s1")).toBe("/chat/grid/s1");
		// A slug with characters a path has to escape comes back escaped, as it was stored.
		expect(waitedOn("/chat/grid%20api/s1")).toBe("/chat/grid%20api/s1");
	});

	it("names the project a pull request path is waiting on, open one or not", () => {
		expect(waitedOn("/pulls/grid")).toBe("/pulls/grid");
	});

	it("has nothing to say about a page that is neither", () => {
		for (const path of [
			"/",
			"/chat",
			"/chat/grid",
			"/board/grid",
			"/inbox",
			"/pulls",
			"/settings/notifications",
		]) {
			expect(waitedOn(path)).toBeNull();
		}
	});
});
