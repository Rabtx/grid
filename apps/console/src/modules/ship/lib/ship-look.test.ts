import { describe, expect, it } from "vitest";

import type { EnvironmentSummary, PipelineSummary } from "../types/ship.types";
import { ago, envLine, envTone, pipelineLine, seconds, shipLine } from "./ship-look";

const env = (over: Partial<EnvironmentSummary>): EnvironmentSummary => ({
	name: "production",
	kind: "production",
	version: "v0.8.3",
	sha: "abc",
	state: "healthy",
	url: null,
	deployedAt: null,
	ahead: null,
	...over,
});

const pipeline = (over: Partial<PipelineSummary>): PipelineSummary => ({
	id: "142",
	label: "PR #142",
	title: "Fix ETA",
	state: "passing",
	failing: 0,
	at: null,
	fix: false,
	...over,
});

describe("ship look", () => {
	it("words an environment by what is live and how it is", () => {
		expect(envLine(env({}))).toBe("v0.8.3 · healthy");
		expect(envLine(env({ kind: "staging", version: "v0.8.4", ahead: 3 }))).toBe(
			"v0.8.4 · 3 commits ahead",
		);
		expect(envTone(env({ kind: "staging", ahead: 3 }))).toBe("accent");
		expect(envLine(env({ state: "idle" }))).toBe("No deploys yet");
		expect(envTone(env({ state: "failing" }))).toBe("danger");
	});

	it("words a pipeline, and the phone's line across them", () => {
		expect(pipelineLine(pipeline({ state: "failing", failing: 1, fix: true }))).toBe(
			"1 check failing · fix in a thread",
		);
		const now = Date.parse("2026-10-05T12:00:00Z");
		expect(pipelineLine(pipeline({ id: "main", at: "2026-10-05T11:56:00Z" }), now)).toBe(
			"Passing · 4 min ago",
		);
		expect(
			shipLine({
				repository: "rabtx/app",
				defaultBranch: "main",
				environments: [env({})],
				previews: { live: 0, open: 0 },
				pipelines: [pipeline({ state: "failing", failing: 1 })],
			}),
		).toBe("Production healthy · 1 failing check");
	});

	it("reads times and durations the way the screens say them", () => {
		const now = Date.parse("2026-10-05T12:00:00Z");
		expect(ago("2026-10-03T12:00:00Z", now)).toBe("2 days ago");
		expect(ago("2026-09-27T12:00:00Z", now)).toBe("1 week ago");
		expect(seconds(18)).toBe("18s");
		expect(seconds(112)).toBe("1m 52s");
	});
});
