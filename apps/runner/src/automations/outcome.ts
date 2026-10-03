import { isAbsolute, relative } from "node:path";

import type { ChatEvent } from "../agents/events";
import type { AutomationOptions, RunOutcome, RunStep } from "./store";

/**
 * What an automation run left behind, read from its thread's events: the steps its tools took
 * (Figma "Last run"), what it came to in the agent's words, what it cost, and whether it changed a
 * path it was told to leave alone.
 */

const MAX_STEPS = 8;
const MAX_LINE = 120;

/** The prompt a run is given: its own words, then its limits and what to do when done. */
export function automationPrompt(prompt: string, options: AutomationOptions): string {
	const parts = [prompt.trim()];
	if (options.offLimits.length)
		parts.push(`Do not change these paths: ${options.offLimits.join(", ")}.`);
	if (options.pullRequest)
		parts.push(
			`When the change is ready, commit it on this branch, push it and open a pull request with \`gh pr create\`.${
				options.waitForReview ? " Then stop there: it is reviewed before anything is merged." : ""
			}`,
		);
	return parts.join("\n\n");
}

/** A line of output as a person would read it, or null when there is none. */
function lastLine(text: string | undefined): string | null {
	const line = (text ?? "")
		.split("\n")
		.map((item) => item.trim())
		.filter(Boolean)
		.pop();
	return line ? line.slice(0, MAX_LINE) : null;
}

/** The first line worth reading of a reply, without its Markdown marks. */
function headline(text: string): string | null {
	const line = text
		.split("\n")
		.map((item) =>
			item
				.replace(/^[#>*\-\s]+/, "")
				.replace(/[*_`]/g, "")
				.trim(),
		)
		.find(Boolean);
	return line ? line.slice(0, MAX_LINE * 2) : null;
}

/** The steps, summary and cost of the run whose thread logged `events`. */
export function runOutcome(events: readonly ChatEvent[]): Omit<RunOutcome, "pullNumber"> {
	const tools = new Map<
		string,
		{ title?: string; input?: string; output?: string; failed?: boolean }
	>();
	let reply = "";
	let cost: number | null = null;
	for (const event of events) {
		if (event.type === "tool") {
			const was = tools.get(event.id) ?? {};
			tools.set(event.id, {
				title: event.title ?? was.title,
				input: event.input ?? was.input,
				output: event.output ?? was.output,
				failed: event.status === "failed" || was.failed,
			});
		} else if (event.type === "turn_start") reply = "";
		else if (event.type === "message") reply += event.text;
		else if (event.type === "usage" && typeof event.costUsd === "number")
			cost = Math.max(cost ?? 0, event.costUsd);
	}
	const steps: RunStep[] = [...tools.values()]
		.map((tool) => ({
			title: (tool.title || tool.input || "Used a tool").split("\n")[0].slice(0, MAX_LINE),
			detail: tool.failed ? "failed" : lastLine(tool.output),
		}))
		.slice(-MAX_STEPS);
	return { steps, summary: headline(reply), costUsd: cost };
}

/** What a run has cost so far, as the agent reported it. */
export function costSoFar(events: readonly ChatEvent[]): number {
	return events.reduce(
		(most, event) =>
			event.type === "usage" && typeof event.costUsd === "number"
				? Math.max(most, event.costUsd)
				: most,
		0,
	);
}

/** Whether a path (relative to the run's folder) is one it was told to leave alone. */
export function offLimits(path: string, rules: readonly string[]): boolean {
	const name = path.split("/").pop() ?? path;
	return rules.some((rule) => {
		const clean = rule.trim().replace(/^\.\//, "").replace(/\/$/, "");
		if (!clean) return false;
		return (
			path === clean ||
			path.startsWith(`${clean}/`) ||
			name === clean ||
			path.split("/").includes(clean)
		);
	});
}

/** The off-limits paths the run's edits touched, relative to its folder. */
export function touchedOffLimits(
	events: readonly ChatEvent[],
	rules: readonly string[],
	cwd: string,
): string[] {
	if (!rules.length) return [];
	const touched = new Set<string>();
	for (const event of events) {
		if (event.type !== "tool" || event.status === "failed") continue;
		for (const diff of event.diffs ?? []) {
			const path = isAbsolute(diff.path) ? relative(cwd, diff.path) : diff.path;
			if (offLimits(path, rules)) touched.add(path);
		}
	}
	return [...touched];
}
