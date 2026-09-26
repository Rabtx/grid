import { describe, expect, it } from "vitest";

import { withoutBase } from "./workspace-history";

describe("withoutBase", () => {
	it("strips the workspace from paths under it", () => {
		expect(withoutBase("/acme/chat/web", "/acme")).toBe("/chat/web");
		expect(withoutBase("/acme", "/acme")).toBe("/");
		expect(withoutBase("/acme/", "/acme")).toBe("/");
		expect(withoutBase("/acme?x=1", "/acme")).toBe("/?x=1");
	});

	it("leaves paths outside the workspace, and everything without one, alone", () => {
		expect(withoutBase("/chat/web", "/acme")).toBe("/chat/web");
		expect(withoutBase("/acmeish/chat", "/acme")).toBe("/acmeish/chat");
		expect(withoutBase("/acme/chat", "")).toBe("/acme/chat");
	});
});
