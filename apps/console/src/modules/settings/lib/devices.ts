/**
 * Devices and time zones as Settings words them: "Chrome on Linux", "Asia/Karachi · UTC+5".
 */

/** A browser's name from its user agent, the way the runner names notification devices. */
export function deviceName(userAgent: string | null): string {
	const agent = userAgent ?? "";
	if (!agent) return "Unknown device";
	const browser = /Edg\//.test(agent)
		? "Edge"
		: /Firefox\//.test(agent)
			? "Firefox"
			: /Chrome\//.test(agent)
				? "Chrome"
				: /Safari\//.test(agent)
					? "Safari"
					: /Bun\/|curl\//.test(agent)
						? "Script"
						: "Browser";
	const system = /iPhone/.test(agent)
		? "iPhone"
		: /iPad/.test(agent)
			? "iPad"
			: /Android/.test(agent)
				? "Android"
				: /Mac OS X|Macintosh/.test(agent)
					? "Mac"
					: /Windows/.test(agent)
						? "Windows"
						: /Linux/.test(agent)
							? "Linux"
							: null;
	return system ? `${browser} on ${system}` : browser;
}

/** Whether a user agent is a phone's, for the glyph beside it. */
export function isPhone(userAgent: string | null): boolean {
	return /iPhone|iPod|Android.*Mobile|Mobi/i.test(userAgent ?? "");
}

/** This browser's zone. */
export const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Every zone the browser knows, the local one and UTC included. */
export function timeZones(): string[] {
	const known =
		typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
	return [...new Set([LOCAL_ZONE, "UTC", ...known])].sort();
}

/** "UTC+5", "UTC−3:30", "UTC" for a zone at a moment. */
export function zoneOffset(zone: string, at: Date = new Date()): string {
	try {
		const name =
			new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
				.formatToParts(at)
				.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
		return name.replace("GMT", "UTC").replace("-", "−");
	} catch {
		return "UTC";
	}
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [limit: number, unit: Intl.RelativeTimeFormatUnit, size: number][] = [
	[60, "second", 1],
	[3600, "minute", 60],
	[86_400, "hour", 3600],
	[604_800, "day", 86_400],
	[2_629_800, "week", 604_800],
	[31_557_600, "month", 2_629_800],
	[Number.POSITIVE_INFINITY, "year", 31_557_600],
];

/** How long ago, in words: "just now", "2 hours ago", "yesterday", "3 months ago". */
export function ago(iso: string, now: number = Date.now()): string {
	const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
	if (seconds < 45) return "just now";
	const [, unit, size] = STEPS.find(([limit]) => seconds < limit) ?? STEPS[STEPS.length - 1];
	return RELATIVE.format(-Math.round(seconds / size), unit);
}
