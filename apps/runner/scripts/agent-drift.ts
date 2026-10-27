/**
 * After `record:agents` in a checkout: what each freshly recorded scenario changed from the
 * committed one (`driftOf`). Prints a Markdown report and exits 1 when anything drifted, for the
 * nightly agent check (`.github/workflows/agents-nightly.yml`).
 *
 *   bun --cwd=apps/runner run scripts/agent-drift.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { driftOf, type RecordedScenario } from "../src/agents/recording";

const FIXTURES = join(import.meta.dir, "..", "src", "agents", "replay-fixtures");
const root = (await Bun.$`git rev-parse --show-toplevel`.text()).trim();

const lines: string[] = [];
for (const agent of existsSync(FIXTURES) ? readdirSync(FIXTURES) : []) {
	const folder = join(FIXTURES, agent);
	for (const scenario of readdirSync(folder)) {
		const file = join(folder, scenario, "expect.json");
		if (!existsSync(file)) continue;
		const fresh = JSON.parse(readFileSync(file, "utf8")) as RecordedScenario;
		const committed = await Bun.$`git show HEAD:${relative(root, file)}`.quiet().nothrow();
		if (committed.exitCode !== 0) {
			lines.push(`- **${agent} ${scenario}**: new, nothing committed to compare with`);
			continue;
		}
		const kept = JSON.parse(committed.text()) as RecordedScenario;
		for (const change of driftOf(kept.expect, fresh.expect))
			lines.push(`- **${agent} ${scenario}**: ${change}`);
	}
}
console.log(lines.length ? `## Agent drift\n\n${lines.join("\n")}` : "No agent drift.");
process.exit(lines.some((line) => !line.includes("new, nothing")) ? 1 : 0);
