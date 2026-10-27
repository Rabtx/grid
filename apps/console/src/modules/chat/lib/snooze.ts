/** When a snooze ends, from the choices the thread menu offers. */
export type SnoozeChoice = "hour" | "tomorrow" | "week";

export const SNOOZE_CHOICES: readonly { id: SnoozeChoice; label: string }[] = [
	{ id: "hour", label: "Snooze for an hour" },
	{ id: "tomorrow", label: "Snooze until tomorrow, 9:00" },
	{ id: "week", label: "Snooze until Monday, 9:00" },
];

/** The time a choice snoozes until, in this device's time zone. */
export function snoozeUntil(choice: SnoozeChoice, from: Date = new Date()): Date {
	if (choice === "hour") return new Date(from.getTime() + 3_600_000);
	const at = new Date(from);
	at.setHours(9, 0, 0, 0);
	if (choice === "tomorrow") at.setDate(at.getDate() + 1);
	else at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
	return at;
}

/** Whether a thread is snoozed now. */
export function snoozed(
	session: { snoozedUntil?: string | null },
	now: number = Date.now(),
): boolean {
	return Boolean(session.snoozedUntil && Date.parse(session.snoozedUntil) > now);
}

/** "until 9:00 tomorrow" for a snoozed thread's hint. */
export function snoozeLabel(until: string, now: Date = new Date()): string {
	const at = new Date(until);
	const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	const days = Math.round(
		(new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000,
	);
	if (days <= 0) return `Snoozed until ${time}`;
	if (days === 1) return `Snoozed until ${time} tomorrow`;
	return `Snoozed until ${at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
