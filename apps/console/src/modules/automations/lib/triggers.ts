import { now as clockNow } from "@/lib/clock";

import type { AutomationRun, Trigger } from "../services/automations.service";

/** The zone this browser is in: new schedules start in it. */
export const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export const DAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

export type TriggerKind =
	| "hourly"
	| "daily"
	| "weekdays"
	| "weekly"
	| "pull_opened"
	| "review_requested"
	| "checks_failed";

/** Every kind of trigger, in the two groups the picker shows them in. */
export const TRIGGER_KINDS: readonly {
	value: TriggerKind;
	label: string;
	group: "schedule" | "github";
	hint: string;
}[] = [
	{ value: "hourly", label: "Every hour", group: "schedule", hint: "At the same minute each hour" },
	{ value: "daily", label: "Every day", group: "schedule", hint: "Once a day at a set time" },
	{
		value: "weekdays",
		label: "Weekdays",
		group: "schedule",
		hint: "Monday to Friday at a set time",
	},
	{ value: "weekly", label: "Every week", group: "schedule", hint: "One day a week at a set time" },
	{
		value: "pull_opened",
		label: "Pull request opened",
		group: "github",
		hint: "Each pull request opened after this is saved",
	},
	{
		value: "review_requested",
		label: "Review requested from me",
		group: "github",
		hint: "Each pull request that asks for your review",
	},
	{
		value: "checks_failed",
		label: "Checks failed on my pull request",
		group: "github",
		hint: "Each time checks fail, again after every new push",
	},
];

export function triggerKind(trigger: Trigger): TriggerKind {
	return trigger.kind === "event" ? trigger.event : trigger.cadence;
}

/** A fresh trigger of a kind, keeping the time and zone of the one it replaces. */
export function newTrigger(kind: TriggerKind, from?: Trigger): Trigger {
	if (kind === "pull_opened" || kind === "review_requested" || kind === "checks_failed")
		return { kind: "event", event: kind };
	const timezone = from?.kind === "schedule" ? from.timezone : LOCAL_ZONE;
	if (kind === "hourly") return { kind: "schedule", cadence: "hourly", minute: 0, timezone };
	const time = from?.kind === "schedule" && "time" in from ? from.time : "09:00";
	return {
		kind: "schedule",
		cadence: kind,
		time,
		...(kind === "weekly" ? { day: 1 } : {}),
		timezone,
	};
}

/** One trigger in words: "Every day at 09:00", "Mondays at 09:00 (UTC)". */
export function describeTrigger(trigger: Trigger): string {
	if (trigger.kind === "event")
		return TRIGGER_KINDS.find((kind) => kind.value === trigger.event)?.label ?? trigger.event;
	const zone = trigger.timezone === LOCAL_ZONE ? "" : ` (${trigger.timezone})`;
	if (trigger.cadence === "hourly")
		return `Every hour at :${String(trigger.minute).padStart(2, "0")}${zone}`;
	const when =
		trigger.cadence === "weekly"
			? `${DAYS[trigger.day ?? 1]}s`
			: trigger.cadence === "weekdays"
				? "Weekdays"
				: "Every day";
	return `${when} at ${trigger.time}${zone}`;
}

export function describeTriggers(triggers: readonly Trigger[]): string {
	return triggers.map(describeTrigger).join(" · ");
}

/** Whether any trigger waits on GitHub rather than the clock. */
export function onGithub(triggers: readonly Trigger[]): boolean {
	return triggers.some((trigger) => trigger.kind === "event");
}

/** How soon a time is, as "in 12 min", "in 3 h", "in 2 d". */
export function untilLabel(at: string, now: number = clockNow()): string {
	const minutes = Math.max(0, Math.ceil((Date.parse(at) - now) / 60_000));
	if (minutes < 60) return `in ${minutes} min`;
	if (minutes < 48 * 60) return `in ${Math.round(minutes / 60)} h`;
	return `in ${Math.round(minutes / 1440)} d`;
}

export const RUN_STATUS: Record<AutomationRun["status"], string> = {
	running: "Running",
	succeeded: "Succeeded",
	failed: "Failed",
	skipped: "Skipped",
};

export const RUN_TRIGGER: Record<AutomationRun["trigger"], string> = {
	schedule: "On schedule",
	event: "From GitHub",
	manual: "Run by hand",
};
