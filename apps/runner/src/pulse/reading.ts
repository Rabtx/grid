/**
 * What an agent reads from a workspace's connected services for Pulse: revenue from Stripe, users
 * and activation from PostHog, the error rate from Sentry, and a few things worth knowing. Each
 * service's MCP server says how to ask it; the agent works that out and answers in one JSON shape,
 * which is checked here before anything is shown.
 */

export type Metric = {
	value: number;
	/** Against the period before: a percent for counts and money, points for rates. */
	change: number | null;
	/** Oldest to newest, up to twelve buckets across the period. */
	series: number[];
};

export type Insight = {
	title: string;
	detail: string;
	source: string;
	tone: "good" | "warn" | "info";
};

export type Reading = {
	mrr: (Metric & { currency: string }) | null;
	activeUsers: Metric | null;
	/** Percent of new people who came back on another day in the period. */
	activation: Metric | null;
	/** Percent of sessions with an error. */
	errorRate: Metric | null;
	insights: Insight[];
	/** Why a metric could not be read, by its name. */
	missing: Record<string, string>;
};

export type Sources = { stripe: boolean; posthog: boolean; sentry: boolean };

const SERIES = 12;

/** The message that asks for a reading, naming only the services that are connected. */
export function readingPrompt(sources: Sources, days: number): string {
	const asks = [
		sources.stripe
			? `- "mrr": monthly recurring revenue from Stripe now, in the account's currency (normalise yearly and other intervals to a month; only active subscriptions), with "currency" (ISO code). "change" is the percent change against ${days} days ago.`
			: null,
		sources.posthog
			? `- "activeUsers": distinct people active in PostHog over the last ${days} days. "change": percent against the ${days} days before.`
			: null,
		sources.posthog
			? `- "activation": the percent of people first seen in the last ${days} days who were active again on a later day. "change": percentage points against the period before.`
			: null,
		sources.sentry
			? `- "errorRate": the percent of sessions (or, without sessions, transactions) with an error in Sentry over the last ${days} days. "change": percent against the period before.`
			: null,
	].filter(Boolean);
	return [
		"You are filling in Grid's Pulse: the company's numbers at a glance. Read them with your MCP servers, read-only.",
		"Use only tools that read. Change nothing, create nothing, send nothing.",
		"",
		"Work out each number:",
		...asks,
		"",
		`Every metric has "value" (a number), "change" (a number or null) and "series": ${SERIES} numbers, oldest first, the metric across the last ${days} days in equal buckets.`,
		'Then add up to three "insights": things the founder would want to know that the numbers show (a jump, a drop, failed payments, where users are). Each has "title" (one line), "detail" (which service, and what it is based on), "source" (the service), and "tone": "good", "warn" or "info".',
		'A metric you cannot read is null, with the reason in "missing" under its name. Never guess a number.',
		"",
		"Answer with only this JSON, in one ```json block, nothing after it:",
		"```json",
		JSON.stringify(
			{
				...(sources.stripe ? { mrr: { value: 0, currency: "USD", change: 0, series: [] } } : {}),
				...(sources.posthog
					? {
							activeUsers: { value: 0, change: 0, series: [] },
							activation: { value: 0, change: 0, series: [] },
						}
					: {}),
				...(sources.sentry ? { errorRate: { value: 0, change: 0, series: [] } } : {}),
				insights: [{ title: "", detail: "", source: "", tone: "info" }],
				missing: {},
			},
			null,
			2,
		),
		"```",
	].join("\n");
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function metric(value: unknown): Metric | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	if (!isNumber(raw.value)) return null;
	const series = Array.isArray(raw.series) ? raw.series.filter(isNumber).slice(-SERIES) : [];
	return { value: raw.value, change: isNumber(raw.change) ? raw.change : null, series };
}

function text(value: unknown, most: number): string {
	return typeof value === "string" ? value.trim().slice(0, most) : "";
}

/** The JSON in an agent's answer: the last fenced block, or the last object in the text. */
export function extractJson(answer: string): unknown {
	const fenced = [...answer.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((match) => match[1]);
	const candidates = fenced.length
		? fenced.reverse()
		: [answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1)];
	for (const candidate of candidates) {
		try {
			return JSON.parse(candidate ?? "");
		} catch {
			// The next one.
		}
	}
	return null;
}

/** A reading from an agent's answer, keeping only what is well formed; null when nothing is. */
export function parseReading(answer: string): Reading | null {
	const raw = extractJson(answer);
	if (!raw || typeof raw !== "object") return null;
	const data = raw as Record<string, unknown>;
	const mrr = metric(data.mrr);
	const currency = text((data.mrr as Record<string, unknown> | null)?.currency, 3).toUpperCase();
	const insights = (Array.isArray(data.insights) ? data.insights : [])
		.map((item) => {
			const entry = (item ?? {}) as Record<string, unknown>;
			const tone = entry.tone === "good" || entry.tone === "warn" ? entry.tone : "info";
			return {
				title: text(entry.title, 140),
				detail: text(entry.detail, 240),
				source: text(entry.source, 40),
				tone,
			} satisfies Insight;
		})
		.filter((item) => item.title)
		.slice(0, 3);
	const missing: Record<string, string> = {};
	if (data.missing && typeof data.missing === "object")
		for (const [key, value] of Object.entries(data.missing as Record<string, unknown>))
			if (typeof value === "string") missing[key] = value.slice(0, 200);
	const reading: Reading = {
		mrr: mrr ? { ...mrr, currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD" } : null,
		activeUsers: metric(data.activeUsers),
		activation: metric(data.activation),
		errorRate: metric(data.errorRate),
		insights,
		missing,
	};
	const anything =
		reading.mrr ||
		reading.activeUsers ||
		reading.activation ||
		reading.errorRate ||
		insights.length;
	return anything ? reading : null;
}
