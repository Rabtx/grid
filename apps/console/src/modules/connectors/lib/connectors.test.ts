import { describe, expect, it } from "vitest";

import type { Connection } from "../types/connector.types";
import { healthOf, rulesSummary } from "./connectors";

const capabilities = [
	{ id: "read", label: "Read code", hint: null, short: null, initial: "allow" as const },
	{
		id: "open",
		label: "Open branches and pull requests",
		hint: null,
		short: "Open PRs",
		initial: "allow" as const,
	},
	{
		id: "merge",
		label: "Merge pull requests",
		hint: null,
		short: "merging",
		initial: "ask" as const,
	},
];

const connection = (over: Partial<Connection> = {}): Connection => ({
	id: "c1",
	kind: "github",
	name: "GitHub",
	transport: "http",
	url: null,
	command: null,
	env: {},
	auth: "gh",
	powers: [],
	enabled: true,
	rules: {},
	capabilities,
	agents: {},
	hiddenRepositories: [],
	tools: [],
	status: "healthy",
	statusDetail: null,
	checkedAt: null,
	expiresAt: null,
	...over,
});

describe("connectors", () => {
	it("says what agents may do in a line, as the Figma cards do", () => {
		expect(rulesSummary(connection())).toBe("Open PRs · merging asks you");
		expect(rulesSummary(connection({ rules: { open: "never", merge: "never" } }))).toBe(
			"Read only",
		);
		expect(
			rulesSummary(connection({ rules: { read: "never", open: "never", merge: "never" } })),
		).toBe("No access");
	});

	it("tells healthy from needing a sign-in and a token running out", () => {
		expect(healthOf(connection()).label).toBe("Healthy");
		expect(healthOf(connection({ status: "signin" })).label).toBe("Sign in again");
		expect(healthOf(connection({ enabled: false })).label).toBe("Off");
		const soon = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
		expect(healthOf(connection({ expiresAt: soon }))).toEqual({
			tone: "warning",
			label: "Token expires in 3 days",
		});
	});
});
