import { describe, expect, it } from "vitest";

import { workspaceHistory } from "./workspace-history";

describe("workspaceHistory", () => {
	it("writes the workspace once, whether a path already names it or not", () => {
		const history = workspaceHistory("/acme");
		history.set({ value: "/pulls/web" });
		expect(window.location.pathname).toBe("/acme/pulls/web");
		// Built with workspaceHref: not /acme/acme/team.
		history.set({ value: "/acme/team" });
		expect(window.location.pathname).toBe("/acme/team");
	});
});
