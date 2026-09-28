export type ScheduleTrigger =
	| { kind: "schedule"; cadence: "hourly"; minute: number; timezone: string }
	| {
			kind: "schedule";
			cadence: "daily" | "weekdays" | "weekly";
			time: string;
			day?: number;
			timezone: string;
	  };

export type EventTrigger = {
	kind: "event";
	event: "pull_opened" | "review_requested" | "checks_failed";
};

export type Trigger = ScheduleTrigger | EventTrigger;

const formatter = new Map<string, Intl.DateTimeFormat>();

function parts(date: Date, timezone: string): Record<string, number> {
	let format = formatter.get(timezone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formatter.set(timezone, format);
	}
	const result: Record<string, number> = {};
	for (const part of format.formatToParts(date)) {
		if (part.type === "weekday") {
			result.weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part.value);
		} else if (["year", "month", "day", "hour", "minute"].includes(part.type)) {
			result[part.type] = Number(part.value);
		}
	}
	return result;
}

/** The next wall-clock occurrence strictly after `after`, including DST gaps and repeats. */
export function nextRun(trigger: ScheduleTrigger, after: Date): string {
	const from = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
	const previous = parts(after, trigger.timezone);
	const [hour, minute] =
		trigger.cadence === "hourly" ? [0, trigger.minute] : trigger.time.split(":").map(Number);
	// Inspect one or two candidate minutes per UTC hour. Offsets may be :30 or :45,
	// and a clock change may happen inside an hour.
	for (
		let start = Math.floor(from / 3_600_000) * 3_600_000;
		start <= from + 8 * 24 * 3_600_000;
		start += 3_600_000
	) {
		const offsets = new Set([
			parts(new Date(start), trigger.timezone).minute,
			(parts(new Date(start + 59 * 60_000), trigger.timezone).minute - 59 + 60) % 60,
		]);
		for (const offset of offsets) {
			const at = start + ((minute - offset + 60) % 60) * 60_000;
			if (at < from) continue;
			const local = parts(new Date(at), trigger.timezone);
			if (local.minute !== minute || (trigger.cadence !== "hourly" && local.hour !== hour))
				continue;
			if (trigger.cadence === "weekdays" && (local.weekday === 0 || local.weekday === 6)) continue;
			if (trigger.cadence === "weekly" && local.weekday !== trigger.day) continue;
			// A repeated local hour during autumn is one daily/weekly occurrence, not two.
			if (
				trigger.cadence !== "hourly" &&
				local.year === previous.year &&
				local.month === previous.month &&
				local.day === previous.day &&
				(previous.hour > hour || (previous.hour === hour && previous.minute >= minute))
			)
				continue;
			return new Date(at).toISOString();
		}
	}
	throw new Error("Could not find the next scheduled time");
}

export function nextScheduled(triggers: Trigger[], after: Date): string | null {
	const times = triggers
		.filter((value): value is ScheduleTrigger => value.kind === "schedule")
		.map((value) => nextRun(value, after));
	return times.sort()[0] ?? null;
}

export function validTriggers(input: unknown): input is Trigger[] {
	if (!Array.isArray(input) || input.length < 1 || input.length > 5) return false;
	return input.every((value) => {
		if (!value || typeof value !== "object") return false;
		const trigger = value as Record<string, unknown>;
		if (trigger.kind === "event")
			return ["pull_opened", "review_requested", "checks_failed"].includes(String(trigger.event));
		if (trigger.kind !== "schedule" || typeof trigger.timezone !== "string") return false;
		try {
			new Intl.DateTimeFormat("en", { timeZone: trigger.timezone });
		} catch {
			return false;
		}
		if (trigger.cadence === "hourly")
			return (
				Number.isInteger(trigger.minute) &&
				Number(trigger.minute) >= 0 &&
				Number(trigger.minute) < 60
			);
		if (
			!["daily", "weekdays", "weekly"].includes(String(trigger.cadence)) ||
			typeof trigger.time !== "string" ||
			!/^([01]\d|2[0-3]):[0-5]\d$/.test(trigger.time)
		)
			return false;
		return (
			trigger.cadence !== "weekly" ||
			(Number.isInteger(trigger.day) && Number(trigger.day) >= 0 && Number(trigger.day) < 7)
		);
	});
}
