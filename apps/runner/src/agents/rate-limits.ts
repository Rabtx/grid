/**
 * How much of a provider plan's limits an account has used, as the agents report it while they
 * work: Claude Code's `rate_limit_event` and Codex's `account/rateLimits/updated`. Each window
 * ("5h", "Weekly") is a share used and when it resets; Grid draws them as rings in the sidebar.
 */
export type UsageLimit = {
	window: string;
	/** 0–100, or null when the agent only said whether it is allowed. */
	usedPercent: number | null;
	/** ISO time the window resets, when said. */
	resetsAt: string | null;
	/** The agent says this window is used up for now. */
	limited: boolean;
};

const CLAUDE_WINDOWS: Record<string, string> = {
	five_hour: "5h",
	seven_day: "Weekly",
	seven_day_opus: "Weekly · Opus",
	seven_day_sonnet: "Weekly · Sonnet",
	seven_day_fable: "Weekly · Fable",
	overage: "Extra usage",
};

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function number(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Unix seconds (or milliseconds) or an ISO string, as an ISO string. */
function when(value: unknown): string | null {
	const n = number(value);
	if (n !== null && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
	if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
		return new Date(value).toISOString();
	return null;
}

function percent(value: number | null, fraction: boolean): number | null {
	if (value === null) return null;
	const scaled = fraction && value <= 1 ? value * 100 : value;
	return Math.min(100, Math.max(0, Math.round(scaled * 10) / 10));
}

/** Claude Code's `rate_limit_event`: one window per event, its utilisation as a fraction. */
export function claudeRateLimits(message: Record<string, unknown>): UsageLimit[] {
	const info = record(message.rate_limit_info) ?? message;
	const windows = Array.isArray(info.limits) ? info.limits.map(record) : [info];
	return windows.flatMap((entry) => {
		if (!entry) return [];
		const type = typeof entry.rateLimitType === "string" ? entry.rateLimitType : null;
		const label =
			typeof entry.window === "string"
				? entry.window
				: type
					? (CLAUDE_WINDOWS[type] ?? type.replace(/_/g, " "))
					: "Usage";
		const status = typeof entry.status === "string" ? entry.status : null;
		const used = percent(number(entry.utilization), true);
		if (used === null && !status) return [];
		return [
			{
				window: label,
				usedPercent: used ?? (status === "rejected" ? 100 : null),
				resetsAt: when(entry.resetsAt),
				limited: status === "rejected",
			},
		];
	});
}

function codexWindowName(minutes: number | null, fallback: string): string {
	if (minutes === null) return fallback;
	if (minutes === 10_080) return "Weekly";
	if (minutes % 1_440 === 0) return `${minutes / 1_440}d`;
	if (minutes % 60 === 0) return `${minutes / 60}h`;
	return `${minutes}m`;
}

/** Codex's `account/rateLimits/updated` (and `account/rateLimits/read`): primary and secondary windows. */
export function codexRateLimits(params: Record<string, unknown>): UsageLimit[] {
	const snapshot = record(params.rateLimits) ?? params;
	return (
		[
			["primary", "5h"],
			["secondary", "Weekly"],
		] as const
	).flatMap(([key, fallback]) => {
		const window = record(snapshot[key]);
		if (!window) return [];
		const used = percent(number(window.usedPercent ?? window.used_percent), false);
		if (used === null) return [];
		return [
			{
				window: codexWindowName(
					number(window.windowDurationMins ?? window.window_minutes),
					fallback,
				),
				usedPercent: used,
				resetsAt: when(window.resetsAt ?? window.resets_at),
				limited: used >= 100,
			},
		];
	});
}

/** Fold newly reported windows into what was known: each window replaced by its newest report. */
export function mergeLimits(
	known: readonly UsageLimit[],
	fresh: readonly UsageLimit[],
): UsageLimit[] {
	const byWindow = new Map(known.map((limit) => [limit.window, limit]));
	for (const limit of fresh) byWindow.set(limit.window, limit);
	return [...byWindow.values()];
}
