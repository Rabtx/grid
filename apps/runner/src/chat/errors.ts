/**
 * What an agent's own words say about a failed turn: the model it was asked for no longer
 * exists, or the provider is too busy to answer. Both end with something the person can do;
 * everything else is left exactly as the agent said it.
 */
export type TurnErrorKind = "model-gone" | "provider-busy" | "usage-limit";

// opencode retires a free model behind a notice of its own, with no word for the model in it:
// "Thank you for participating in the Stealth … testing period". Only the two together count.
const RETIRED_NOTICE = /\bstealth\b[^\n]{0,80}\btesting period\b/i;

const MODEL_GONE: RegExp[] = [
	// "model not found", "the model is not available", "model no longer offered"
	/\bmodel\b[^.!\n]{0,60}\bnot\s+(?:found|listed|available|offered|recognized)\b/i,
	/\bmodel\b[^.!\n]{0,60}\bno longer\s+(?:available|offered|listed|supported)\b/i,
	/\bmodel\b[^.!\n]{0,60}\b(?:does not exist|doesn't exist|unrecognized|deprecated|retired)\b/i,
	// "unknown model", "no such model"
	/\b(?:unknown|unrecognized|deprecated|retired|non[- ]existent)\s+model\b/i,
	/\bno such model\b/i,
	RETIRED_NOTICE,
];

const PROVIDER_BUSY: RegExp[] = [
	/\bat capacity\b/i,
	/\brate[-\s]?limit(?:ed|ing)?\b/i,
	/\btoo many requests\b/i,
	/\boverload(?:ed)?\b/i,
	/\bhigh demand\b/i,
	/\btemporarily\s+(?:not\s+available|unavailable)\b/i,
	/\b(?:server|provider|model)\s+(?:is\s+)?busy\b/i,
];

/** The person's plan is used up for now (Claude's 5-hour or weekly limit, Codex's usage limit). */
const USAGE_LIMIT: RegExp[] = [
	/\busage limit\b/i,
	/\bhit your (?:usage |weekly |session )?limit\b/i,
	/\b(?:5-hour|five-hour|weekly|session|opus|sonnet) limit\b/i,
	/\blimit reached\b[^\n]{0,40}\bresets?\b/i,
	/\bout of (?:extra )?usage\b/i,
	/\bquota (?:exceeded|reached|exhausted)\b/i,
	/\binsufficient_quota\b/i,
];

/**
 * Which kind of failure this is, or null when the agent's text says nothing we can act on. A
 * used-up plan is asked first ("rate limit" in it is not a busy provider), then busy: "the model
 * is temporarily not available" is a model that is still there.
 */
export function turnErrorKind(error: string): TurnErrorKind | null {
	if (USAGE_LIMIT.some((pattern) => pattern.test(error))) return "usage-limit";
	if (PROVIDER_BUSY.some((pattern) => pattern.test(error))) return "provider-busy";
	if (MODEL_GONE.some((pattern) => pattern.test(error))) return "model-gone";
	return null;
}

/** The agent's notice that it retired a model it may still list (opencode's free models). */
export function isRetiredNotice(error: string): boolean {
	return RETIRED_NOTICE.test(error);
}

/**
 * Whether sending the same message again can work: after a busy provider, or a gone model. Not
 * after a used-up plan: that waits for the limit to reset (see `limit-resume.ts`).
 */
export function turnRetryable(kind: TurnErrorKind | null): boolean {
	return kind !== null && kind !== "usage-limit";
}

/**
 * When a used-up plan's limit resets, as the agent's own words say it, or null when they do not:
 * Claude's `…|1761580800` (unix seconds), "try again at Oct 27th, 2026 4:12 PM", or "resets 3pm
 * (Europe/Berlin)" (the next such time in that zone; the runner's own zone when none is named).
 */
export function limitResetsAt(error: string, now: Date = new Date()): Date | null {
	const epoch = error.match(/\|\s*(\d{10}|\d{13})\b/);
	if (epoch?.[1]) {
		const n = Number(epoch[1]);
		const at = new Date(n < 1e12 ? n * 1000 : n);
		if (at.getTime() > now.getTime()) return at;
	}
	const tryAt = error.match(/\btry again (?:at|after)\s+([^\n]+?)(?:\.\s|\.$|$)/i);
	if (tryAt?.[1]) {
		const parsed = Date.parse(tryAt[1].replace(/(\d)(st|nd|rd|th)\b/g, "$1"));
		if (Number.isFinite(parsed) && parsed > now.getTime()) return new Date(parsed);
	}
	const resets = error.match(
		/\bresets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b(?:\s*\(([^)]+)\))?/i,
	);
	if (resets?.[1]) {
		let hour = Number(resets[1]);
		const minute = Number(resets[2] ?? 0);
		const half = resets[3]?.toLowerCase();
		if (half === "pm" && hour < 12) hour += 12;
		if (half === "am" && hour === 12) hour = 0;
		if (hour > 23 || minute > 59) return null;
		return nextTimeIn(hour, minute, resets[4]?.trim(), now);
	}
	return null;
}

/** The next moment after `now` that reads `hour:minute` in time zone `zone` (or the runner's). */
function nextTimeIn(
	hour: number,
	minute: number,
	zone: string | undefined,
	now: Date,
): Date | null {
	let offsetMs = -now.getTimezoneOffset() * 60_000;
	if (zone) {
		try {
			const parts = new Intl.DateTimeFormat("en-US", {
				timeZone: zone,
				hourCycle: "h23",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			}).formatToParts(now);
			const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
			const asUtc = Date.UTC(
				part("year"),
				part("month") - 1,
				part("day"),
				part("hour"),
				part("minute"),
				part("second"),
			);
			offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
		} catch {
			return null;
		}
	}
	// "Now" as the zone's wall clock, then the next hour:minute on it, back to real time.
	const local = new Date(now.getTime() + offsetMs);
	const candidate = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
		hour,
		minute,
	);
	const next = candidate > local.getTime() ? candidate : candidate + 86_400_000;
	return new Date(next - offsetMs);
}

/**
 * The turn's error as it is shown: one plain line saying whose fault it is and what to do, then
 * the agent's own text under it, untouched — the detail is never hidden.
 */
export function turnErrorMessage(
	kind: TurnErrorKind,
	provider: string,
	model: string | null,
	detail: string,
): string {
	const plain =
		kind === "model-gone"
			? `${model ? `This model (${model})` : "This model"} is no longer offered by ${provider}. Pick another, then send it again.`
			: kind === "usage-limit"
				? `Your ${provider} plan's usage limit is reached for now. The thread can carry on once it resets.`
				: `${provider} is busy: this is on the provider's side, not yours. Try again in a moment, or pick another model.`;
	return `${plain}\n\n${detail}`;
}
