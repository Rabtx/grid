const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * How long ago an ISO timestamp was, in one short label: "just now", "4m", "3h", "yesterday",
 * "5d", then the date itself ("Sep 3"). `now` is injectable so callers and tests do not depend
 * on the clock.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "";

	const elapsed = now - then;
	if (elapsed < MINUTE) return "just now";
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
	if (elapsed < 2 * DAY) return "yesterday";
	if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;
	return SHORT_DATE.format(then);
}
