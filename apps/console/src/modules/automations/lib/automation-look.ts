import type { RunMark, StepKind } from "@/kit";
import { now as clockNow } from "@/lib/clock";

import type {
	Automation,
	AutomationRun,
	RecentRun,
	Trigger,
} from "../services/automations.service";
import { DAYS, RUN_STATUS } from "./triggers";

/**
 * How an automation reads in Figma 20: when it runs in a word (Tonight, 12 today), its trigger as
 * the start of a sentence, each run as a mark, a time and what came of it.
 */

/** How many runs the strip under the last run shows. */
export const STRIP_RUNS = 28;

const DAY_MS = 86_400_000;

function startOfDay(at: number): number {
	const day = new Date(at);
	day.setHours(0, 0, 0, 0);
	return day.getTime();
}

function clock(at: Date): string {
	return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** A run's mark: a pull request when it opened one, else how it came out. */
export function runMark(run: Pick<RecentRun, "status" | "pullNumber">): RunMark {
	if (run.status === "succeeded") return run.pullNumber ? "pr" : "passed";
	return run.status;
}

/** The strip of the last runs, oldest first, with room left grey. */
export function stripMarks(recent: readonly RecentRun[] | undefined): RunMark[] {
	const marks = (recent ?? []).slice(-STRIP_RUNS).map(runMark);
	return [...marks, ...Array.from({ length: STRIP_RUNS - marks.length }, () => "empty" as const)];
}

/** "94% passed · 6 PRs" over the strip, or nothing before the first finished run. */
export function stripNote(recent: readonly RecentRun[] | undefined): string | undefined {
	const done = (recent ?? []).filter(
		(run) => run.status === "succeeded" || run.status === "failed",
	);
	if (!done.length) return undefined;
	const passed = done.filter((run) => run.status === "succeeded").length;
	const pulls = done.filter((run) => run.pullNumber).length;
	const percent = `${Math.round((passed / done.length) * 100)}% passed`;
	return pulls ? `${percent} · ${pulls} PR${pulls === 1 ? "" : "s"}` : percent;
}

/** When a run started, as "Today, 02:00", "Yesterday, 02:00" or "Sep 28, 02:00". */
export function runWhen(at: string | null, now: number = clockNow()): string {
	if (!at) return "Not started";
	const date = new Date(at);
	const days = Math.round((startOfDay(now) - startOfDay(date.getTime())) / DAY_MS);
	const day =
		days === 0
			? "Today"
			: days === 1
				? "Yesterday"
				: date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${day}, ${clock(date)}`;
}

/** How long a run took: "3m 12s", "45s", or a dash while it has no end. */
export function runDuration(run: Pick<AutomationRun, "startedAt" | "finishedAt">): string {
	if (!run.startedAt || !run.finishedAt) return "—";
	const seconds = Math.max(
		0,
		Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000),
	);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** What came of a run, in a line: its error, the pull request it opened, or its summary. */
export function runResult(run: AutomationRun): string {
	if (run.status === "running") return "Running…";
	if (run.error) return run.error;
	if (run.pullNumber) return `Opened PR #${run.pullNumber}`;
	return run.summary ?? RUN_STATUS[run.status];
}

/** What kind of step a tool call was, from its title, for the glyph it wears. */
export function stepKind(title: string, detail: string | null): StepKind {
	if (detail === "failed") return "failed";
	const text = title.toLowerCase();
	if (/\bgh pr\b|pull request/.test(text)) return "pull";
	if (/\bgit\b|checkout|branch|pull(ed)?\b|fetch/.test(text)) return "branch";
	if (/\b(grep|rg|find|search|read|glob|ls|cat)\b/.test(text)) return "search";
	if (/\b(edit|write|patch|update|create|fix)/.test(text)) return "code";
	return "terminal";
}

/** The panel's word for when it runs: Paused, Running, 12 today, Tonight, Tomorrow, Mon. */
export function whenWord(item: Automation, now: number = clockNow()): string {
	if (!item.enabled) return "Paused";
	if (item.lastRun?.status === "running") return "Running";
	if (item.nextRunAt) {
		const next = new Date(item.nextRunAt);
		const days = Math.round((startOfDay(next.getTime()) - startOfDay(now)) / DAY_MS);
		const hour = next.getHours();
		if (days === 0) return hour >= 18 ? "Tonight" : clock(next);
		if (days === 1) return hour < 6 ? "Tonight" : "Tomorrow";
		if (days < 7) return DAYS[next.getDay()].slice(0, 3);
		return next.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}
	const today = (item.recent ?? []).filter(
		(run) => run.startedAt && Date.parse(run.startedAt) >= startOfDay(now),
	).length;
	return today ? `${today} today` : "";
}

/** When it runs next, for the heading: "Next run tonight at 02:00", "Waiting for GitHub". */
export function nextLine(item: Automation, now: number = clockNow()): string {
	if (!item.enabled) return "Paused";
	if (!item.nextRunAt) return "Runs when GitHub has something for it";
	const next = new Date(item.nextRunAt);
	const word = whenWord(item, now);
	const day =
		word === "Tonight" || word === "Tomorrow"
			? word.toLowerCase()
			: /^\d/.test(word)
				? "today"
				: word.length === 3
					? `on ${DAYS[next.getDay()]}`
					: `on ${word}`;
	return `Next run ${day} at ${clock(next)}`;
}

const EVENT_LINE: Record<Extract<Trigger, { kind: "event" }>["event"], string> = {
	pull_opened: "a PR is opened",
	review_requested: "your review is asked for",
	checks_failed: "checks fail on your PR",
};

/** A trigger as the panel's line: "Every day at 02:00", "When a PR is opened". */
export function triggerLine(trigger: Trigger | undefined): string {
	if (!trigger) return "By hand";
	if (trigger.kind === "event") return `When ${EVENT_LINE[trigger.event]}`;
	if (trigger.cadence === "hourly")
		return `Every hour at :${String(trigger.minute).padStart(2, "0")}`;
	if (trigger.cadence === "weekly") return `${DAYS[trigger.day ?? 1]}s at ${trigger.time}`;
	if (trigger.cadence === "weekdays") return `Weekdays at ${trigger.time}`;
	return `Every day at ${trigger.time}`;
}

/** A trigger split for the recipe: the word it opens with, and the token after it. */
export function triggerRecipe(trigger: Trigger | undefined): { lead: string; token: string } {
	if (!trigger) return { lead: "By", token: "hand" };
	if (trigger.kind === "event") return { lead: "When", token: EVENT_LINE[trigger.event] };
	if (trigger.cadence === "hourly")
		return { lead: "Every", token: `hour at :${String(trigger.minute).padStart(2, "0")}` };
	if (trigger.cadence === "weekly")
		return { lead: "Every", token: `${DAYS[trigger.day ?? 1]} at ${trigger.time}` };
	if (trigger.cadence === "weekdays") return { lead: "Every", token: `weekday at ${trigger.time}` };
	return { lead: "Every", token: `day at ${trigger.time}` };
}

/** The scheduled ones in the order they run next, for Up next on phones. */
export function upNext(items: readonly Automation[], count = 2): Automation[] {
	return items
		.filter((item) => item.enabled && item.nextRunAt)
		.sort((a, b) => Date.parse(a.nextRunAt ?? "") - Date.parse(b.nextRunAt ?? ""))
		.slice(0, count);
}

/** Up next's time and, when not tonight, its day (a run after midnight is still tonight's). */
export function upNextWhen(at: string, now: number = clockNow()): { day?: string; time: string } {
	const next = new Date(at);
	const days = Math.round((startOfDay(next.getTime()) - startOfDay(now)) / DAY_MS);
	const tonight = days === 0 || (days === 1 && next.getHours() < 6);
	return {
		day: tonight ? undefined : days === 1 ? "Tomorrow" : DAYS[next.getDay()].slice(0, 3),
		time: clock(next),
	};
}
