import type { QuietHours } from "./store";

/** The wall clock in a zone: minutes since midnight and the day of the week (0 is Sunday). */
function wallClock(at: Date, timezone: string): { minutes: number; day: number } {
	let zone = timezone;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
	} catch {
		zone = "UTC";
	}
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		hour: "2-digit",
		minute: "2-digit",
		weekday: "short",
		hourCycle: "h23",
	}).formatToParts(at);
	const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return {
		minutes: Number(part("hour")) * 60 + Number(part("minute")),
		day: Math.max(0, days.indexOf(part("weekday"))),
	};
}

function minutesOf(time: string): number {
	const [hours, minutes] = time.split(":").map(Number);
	return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Whether it is quiet for a person at a moment: within their hours, or a weekend they keep. */
export function isQuiet(quiet: QuietHours, at: Date = new Date()): boolean {
	if (!quiet.on) return false;
	const { minutes, day } = wallClock(at, quiet.timezone);
	if (quiet.weekends && (day === 0 || day === 6)) return true;
	const from = minutesOf(quiet.from);
	const to = minutesOf(quiet.to);
	if (from === to) return false;
	return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
