import type { Tone } from "@/kit";

import type { RunState, TeammateRun } from "../types/team.types";

/** How a card's run reads, and its colour: what the teammate is doing, or what it waits for. */
export const RUN_STATE: Record<
	RunState,
	{ label: string; tone: Tone; dot: "running" | "waiting" | "online" | "error" | "offline" }
> = {
	queued: { label: "Up next", tone: "neutral", dot: "offline" },
	planning: { label: "Planning", tone: "accent", dot: "running" },
	plan_ready: { label: "Plan ready", tone: "warning", dot: "waiting" },
	working: { label: "Working", tone: "accent", dot: "running" },
	review: { label: "In review", tone: "success", dot: "online" },
	needs_you: { label: "Needs you", tone: "danger", dot: "error" },
	stopped: { label: "Stopped", tone: "neutral", dot: "offline" },
};

/** Runs that are still the teammate's to finish. */
export const isOpen = (run: Pick<TeammateRun, "state">): boolean =>
	run.state === "queued" ||
	run.state === "planning" ||
	run.state === "plan_ready" ||
	run.state === "working";

/** Runs that wait on a person: a plan to approve, or a card it got stuck on. */
export const waitsOnYou = (run: Pick<TeammateRun, "state">): boolean =>
	run.state === "plan_ready" || run.state === "needs_you";

/** "12 min", "3 h", "2 d": how long, roughly. */
export function duration(minutes: number): string {
	if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
	return `${Math.round(minutes / 60 / 24)} d`;
}
