/**
 * Record real agent sessions for the replay tests: each standard scenario (`recording.ts`) is run
 * through the agent's real CLI, every process it starts is recorded, and what Grid made of it is
 * kept as the expectation. Fixtures are scrubbed (this machine's paths, emails, credentials, and
 * Claude Code's list of tools and plugins) and written to `src/agents/replay-fixtures/<agent>/`.
 *
 *   bun --cwd=apps/runner run record:agents claude            # one agent
 *   bun --cwd=apps/runner run record:agents codex opencode    # several
 *   bun --cwd=apps/runner run record:agents claude --model haiku
 *
 * It uses the agents' real accounts; read the fixtures before committing them.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
	expectationOf,
	RECORDED_AGENTS,
	type RecordedScenario,
	runScenario,
	SCENARIOS,
	SIDE_PROCESSES,
} from "../src/agents/recording";
import { scrubRecording } from "../src/agents/replay";
import { recordedSpawn, spawnJsonProcess } from "../src/agents/stdio";

const FIXTURES = join(import.meta.dir, "..", "src", "agents", "replay-fixtures");

const args = process.argv.slice(2);
const modelAt = args.indexOf("--model");
const model = modelAt >= 0 ? args[modelAt + 1] : undefined;
const agents = args.filter((arg, index) => !arg.startsWith("--") && index !== modelAt + 1);
if (!agents.length) {
	console.error(`Name the agents to record: ${Object.keys(RECORDED_AGENTS).join(", ")}`);
	process.exit(1);
}

const leftovers: string[] = [];
for (const agent of agents) {
	const make = RECORDED_AGENTS[agent];
	if (!make) {
		console.error(`No agent called ${agent}`);
		process.exit(1);
	}
	const work = mkdtempSync(join(tmpdir(), `grid-record-${agent}-`));
	const tokens = new Map<string, string>();
	for (const scenario of SCENARIOS) {
		if (scenario.agents && !scenario.agents.includes(agent)) continue;
		const resume = scenario.resumes ? tokens.get(scenario.resumes) : undefined;
		if (scenario.resumes && !resume) {
			console.warn(`[record] ${agent} ${scenario.name}: nothing to resume, skipped`);
			continue;
		}
		const raw = mkdtempSync(join(tmpdir(), "grid-recording-"));
		console.log(`[record] ${agent} ${scenario.name}…`);
		const { events, result, token } = await runScenario(
			make(recordedSpawn(raw, spawnJsonProcess)),
			scenario,
			{
				cwd: work,
				...(model ? { model } : {}),
				...(resume ? { resume } : {}),
			},
		);
		if (token) tokens.set(scenario.name, token);
		const out = join(FIXTURES, agent, scenario.name);
		rmSync(out, { recursive: true, force: true });
		mkdirSync(out, { recursive: true });
		const swaps = { [work]: "/work", [tmpdir()]: "/tmp", [homedir()]: "/home/person" };
		let kept = 0;
		for (const file of readdirSync(raw).sort()) {
			const text = readFileSync(join(raw, file), "utf8");
			if (SIDE_PROCESSES[agent] && text.includes(SIDE_PROCESSES[agent].marker)) continue;
			writeFileSync(join(out, `process-${++kept}.ndjson`), scrubRecording(text, swaps));
		}
		const recorded: RecordedScenario = {
			agent,
			scenario: scenario.name,
			model: model ?? null,
			resume: resume ?? null,
			expect: expectationOf(events, result),
		};
		writeFileSync(join(out, "expect.json"), `${JSON.stringify(recorded, null, "\t")}\n`);
		leftovers.push(raw);
		console.log(`[record] ${agent} ${scenario.name}: ${result.reason}, ${kept} process(es)`);
	}
	leftovers.push(work);
}
// Processes started beside a session may still be ending; their folders go once they have.
await Bun.sleep(2000);
for (const folder of leftovers) rmSync(folder, { recursive: true, force: true });
