import type { ChangeTone } from "@/kit";
import type { Finance } from "@/modules/workspaces/types/workspace.types";

import type { Metric, PulseView } from "../services/pulse.service";

export const PERIODS = [
	{ value: "7", label: "7 days" },
	{ value: "30", label: "30 days" },
	{ value: "90", label: "90 days" },
] as const;

export function money(value: number, currency = "USD"): string {
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			maximumFractionDigits: value >= 100 ? 0 : 2,
		}).format(value);
	} catch {
		return `${currency} ${Math.round(value).toLocaleString()}`;
	}
}

export function count(value: number): string {
	return Math.round(value).toLocaleString();
}

export function percent(value: number): string {
	return `${value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

/**
 * How a number moved, in its colour: "+12%", "+3 pts", "−40%". For an error rate, down is good.
 */
export function change(
	metric: Metric,
	kind: "percent" | "points",
	lowerIsBetter = false,
): { text: string; tone: ChangeTone } | undefined {
	if (metric.change === null) return undefined;
	const value = metric.change;
	const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
	const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
	const text = `${sign}${Math.abs(rounded)}${kind === "points" ? " pts" : "%"}`;
	const better = lowerIsBetter ? rounded < 0 : rounded > 0;
	return { text, tone: rounded === 0 ? "flat" : better ? "up" : "down" };
}

/** "6h", "2d", "45m": how long a pull request took to merge. */
export function duration(hours: number | null): string {
	if (hours === null) return "—";
	if (hours < 1) return `${Math.round(hours * 60)}m`;
	if (hours < 48) return `${Math.round(hours)}h`;
	return `${Math.round(hours / 24)}d`;
}

export type Runway = {
	/** Months the cash lasts at the net burn, or null when revenue covers the costs. */
	months: number | null;
	burn: number;
	costs: number;
	currency: string;
};

/** How long the money lasts: cash over what is spent each month beyond what comes in. */
export function runway(finance: Finance | undefined, mrr: number | null): Runway | null {
	if (!finance || finance.cash === undefined || finance.cash === null) return null;
	const costs = (finance.costs ?? []).reduce((sum, item) => sum + item.monthly, 0);
	const burn = costs - (mrr ?? 0);
	return {
		months: burn > 0 ? finance.cash / burn : null,
		burn,
		costs,
		currency: finance.currency ?? "USD",
	};
}

/** What the investor update starts from: the period's numbers, for an agent to write up. */
export function investorDraft(view: PulseView, workspace: string): string {
	const reading = view.snapshot?.reading;
	const lines = [
		`Draft our ${view.days}-day investor update for ${workspace}. Keep it short and plain: what moved, what shipped, what is next. Ask me for anything you need.`,
		"",
		"The numbers from Grid's Pulse:",
		reading?.mrr
			? `- MRR ${money(reading.mrr.value, reading.mrr.currency)} (${reading.mrr.change ?? 0}% vs the period before)`
			: null,
		reading?.activeUsers
			? `- Active users ${count(reading.activeUsers.value)} (${reading.activeUsers.change ?? 0}%)`
			: null,
		reading?.activation
			? `- Activation ${percent(reading.activation.value)} (${reading.activation.change ?? 0} pts)`
			: null,
		reading?.errorRate ? `- Error rate ${percent(reading.errorRate.value)}` : null,
		`- Shipped: ${view.shipping.deploys} deploys, ${view.shipping.merged} pull requests merged (${view.shipping.byAgents} by agents), lead time ${duration(view.shipping.leadTimeHours)}`,
		...(reading?.insights ?? []).map((item) => `- ${item.title} (${item.source})`),
	];
	return lines.filter((line) => line !== null).join("\n");
}
