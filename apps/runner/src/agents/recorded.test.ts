import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	driftOf,
	expectationOf,
	RECORDED_AGENTS,
	type RecordedScenario,
	runScenario,
	SCENARIOS,
	SIDE_PROCESSES,
} from "./recording";
import { readRecording, replaySpawn } from "./replay";

/**
 * Every recorded scenario (`bun run record:agents <agent>`, in `replay-fixtures/<agent>/`) played
 * back to that agent's provider: Grid must send what it sent when recorded, and make of the
 * agent's output what it made of it then. A change to how Grid drives an agent, or reads it,
 * shows here; recording again shows what a new CLI version changed.
 */

const FIXTURES = join(import.meta.dir, "replay-fixtures");
const agents = existsSync(FIXTURES)
	? readdirSync(FIXTURES, { withFileTypes: true }).filter((entry) => entry.isDirectory())
	: [];

for (const agent of agents) {
	describe(`recorded ${agent.name} sessions`, () => {
		const folder = join(FIXTURES, agent.name);
		for (const name of readdirSync(folder).sort()) {
			const expectFile = join(folder, name, "expect.json");
			if (!existsSync(expectFile)) continue;
			const recorded = JSON.parse(readFileSync(expectFile, "utf8")) as RecordedScenario;
			const scenario = SCENARIOS.find((item) => item.name === recorded.scenario);
			it(`replays ${name}`, async () => {
				const make = RECORDED_AGENTS[agent.name];
				expect(make).toBeDefined();
				expect(scenario).toBeDefined();
				if (!make || !scenario) return;
				const processes = readdirSync(join(folder, name))
					.filter((file) => file.endsWith(".ndjson"))
					.sort()
					.map((file) => readRecording(join(folder, name, file)));
				const side = SIDE_PROCESSES[agent.name];
				const replay = replaySpawn(side ? [...processes, side.standIn] : processes);
				const { events, result } = await runScenario(make(replay.spawn), scenario, {
					cwd: "/work",
					...(recorded.model ? { model: recorded.model } : {}),
					...(recorded.resume ? { resume: recorded.resume } : {}),
				});
				expect(replay.mismatches).toEqual([]);
				expect(expectationOf(events, result)).toEqual(recorded.expect);
			});
		}
	});
}

describe("drift between recordings", () => {
	const base = {
		result: { reason: "done" as const },
		kinds: ["message"],
		text: "hi",
		tools: [],
		approvals: 0,
		questions: 0,
	};
	it("ignores wording and names what changed", () => {
		expect(driftOf(base, { ...base, text: "hello there" })).toEqual([]);
		expect(
			driftOf(base, {
				...base,
				result: { reason: "error", error: "x" },
				kinds: ["tool", "message"],
				approvals: 1,
			}),
		).toEqual([
			"ended error, was done",
			"events tool → message, were message",
			"1 approval(s), were 0",
		]);
	});
});
