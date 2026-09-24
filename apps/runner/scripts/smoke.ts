/**
 * Real-agent smoke check: for each installed agent, start a thread in a fresh project folder and
 * ask it to create a file; then drop the hub (as a runner restart would), resume the thread, and
 * ask it to change the same file. Both must land in the project folder.
 *
 *   bun --cwd=apps/runner run smoke            # every installed agent
 *   bun --cwd=apps/runner run smoke codex agy  # just these
 *
 * It uses the agents' real accounts and runs them with full access inside a temporary folder.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ChatEvent } from "../src/agents/events";
import { providerRegistry } from "../src/agents/registry";
import { ChatHub } from "../src/chat/hub";
import { ChatStore } from "../src/chat/store";

// The mode each agent calls "don't ask": the check runs unattended in a throwaway folder.
const FULL_ACCESS: Record<string, string> = {
	claude: "bypassPermissions",
	codex: "full-access",
	antigravity: "full-access",
};

const OWNER = "smoke";
const TURN_TIMEOUT_MS = 4 * 60 * 1000;

type Outcome = { agent: string; created: string; resumed: string; notes: string[] };

function watch(hub: ChatHub, id: string, notes: string[]): () => void {
	const { detach } = hub.attach(OWNER, id, {
		event: (event: ChatEvent) => {
			// Anything that still asks is answered with its first "allow" option.
			if (event.type === "approval") {
				const allow = event.options.find((option) => option.kind !== "deny");
				hub.approve(OWNER, id, event.id, allow?.id ?? null);
			}
			if (event.type === "error") notes.push(`error: ${event.message}`);
			if (event.type === "turn_end" && event.reason !== "done")
				notes.push(`turn ${event.reason}${event.error ? `: ${event.error}` : ""}`);
		},
		state: () => undefined,
	});
	return detach;
}

async function withTimeout(work: Promise<void>, label: string): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		work,
		new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`${label} took over ${TURN_TIMEOUT_MS / 1000}s`)),
				TURN_TIMEOUT_MS,
			);
		}),
	]).finally(() => clearTimeout(timer));
}

async function smoke(agent: string): Promise<Outcome> {
	const folder = mkdtempSync(join(tmpdir(), `grid-smoke-${agent}-`));
	const database = join(folder, ".grid-smoke.db");
	const file = join(folder, "grid-smoke.txt");
	const notes: string[] = [];
	const outcome: Outcome = { agent, created: "✗", resumed: "✗", notes };
	try {
		let store = new ChatStore(database);
		let hub = new ChatHub(store, providerRegistry());
		store.setProjectFolder(OWNER, "smoke", folder);
		const session = hub.create(OWNER, {
			project: "smoke",
			provider: agent,
			mode: FULL_ACCESS[agent],
		});
		if (session.cwd !== folder) notes.push(`thread cwd was ${session.cwd}`);

		let detach = watch(hub, session.id, notes);
		await withTimeout(
			hub.prompt(
				OWNER,
				session.id,
				"Create a file named grid-smoke.txt in the current project folder containing exactly one line: created. Do nothing else.",
			),
			"first turn",
		);
		detach();
		outcome.created =
			existsSync(file) && readFileSync(file, "utf8").includes("created") ? "✓" : "✗";

		// A runner restart: the hub and its live agents go away; only the store remains.
		hub.closeAll();
		store.close();
		store = new ChatStore(database);
		hub = new ChatHub(store, providerRegistry());
		detach = watch(hub, session.id, notes);
		await withTimeout(
			hub.prompt(
				OWNER,
				session.id,
				"Add a second line to grid-smoke.txt that says: resumed. Keep the first line. Do nothing else.",
			),
			"resumed turn",
		);
		detach();
		const text = existsSync(file) ? readFileSync(file, "utf8") : "";
		outcome.resumed = text.includes("created") && text.includes("resumed") ? "✓" : "✗";
		hub.closeAll();
		store.close();
	} catch (cause) {
		notes.push(cause instanceof Error ? cause.message : String(cause));
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
	return outcome;
}

const wanted = process.argv.slice(2);
const agents = [...providerRegistry()]
	.filter(([id, provider]) => provider.info().available && (!wanted.length || wanted.includes(id)))
	.map(([id]) => id);
if (!agents.length) {
	console.log("No installed agents to check.");
	process.exit(1);
}

const outcomes: Outcome[] = [];
for (const agent of agents) {
	console.log(`… ${agent}`);
	outcomes.push(await smoke(agent));
}
console.log("\nagent        created  resumed  notes");
for (const outcome of outcomes) {
	console.log(
		`${outcome.agent.padEnd(12)} ${outcome.created.padEnd(8)} ${outcome.resumed.padEnd(8)} ${[...new Set(outcome.notes)].join("; ")}`,
	);
}
process.exit(
	outcomes.every((outcome) => outcome.created === "✓" && outcome.resumed === "✓") ? 0 : 1,
);
