import type { FeedTone } from "@/kit";
import { now as clockNow } from "@/lib/clock";

import type {
	EnvironmentSummary,
	EnvState,
	HistoryEntry,
	PipelineSummary,
	Preview,
	ShipCheck,
	ShipOverview,
} from "../types/ship.types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How long ago, in words: "4 min ago", "2 days ago", "1 week ago", then the date. */
export function ago(iso: string | null, now: number = clockNow()): string {
	if (!iso) return "";
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "";
	const elapsed = now - then;
	if (elapsed < MINUTE) return "just now";
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
	if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), "hour")} ago`;
	if (elapsed < 7 * DAY) return `${plural(Math.floor(elapsed / DAY), "day")} ago`;
	if (elapsed < 28 * DAY) return `${plural(Math.floor(elapsed / (7 * DAY)), "week")} ago`;
	return SHORT_DATE.format(then);
}

/** Seconds as a deploy or a check reads them: "18s", "1m 52s". */
export function seconds(value: number | null): string {
	if (value === null) return "—";
	if (value < 60) return `${value}s`;
	const minutes = Math.floor(value / 60);
	const rest = value % 60;
	if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** An environment's name as a title: "production" → "Production". */
export function envTitle(name: string): string {
	return name ? name[0].toUpperCase() + name.slice(1) : name;
}

export const STATE_WORD: Record<EnvState, string> = {
	healthy: "Healthy",
	failing: "Last deploy failed",
	deploying: "Deploying",
	down: "Not answering",
	idle: "No deploys yet",
};

export function stateTone(state: EnvState): FeedTone {
	switch (state) {
		case "healthy":
			return "success";
		case "deploying":
			return "accent";
		case "failing":
		case "down":
			return "danger";
		default:
			return "neutral";
	}
}

/** An environment's dot: staging with commits waiting is blue, otherwise its health. */
export function envTone(env: EnvironmentSummary): FeedTone {
	if (env.kind === "staging" && env.state === "healthy" && env.ahead) return "accent";
	return stateTone(env.state);
}

/** The line under an environment: what is live, and how it is. */
export function envLine(env: EnvironmentSummary): string {
	if (env.state === "idle") return "No deploys yet";
	const version = env.version ?? "";
	if (env.state === "deploying") return `${version} · deploying`;
	if (env.state === "failing") return `${version} · last deploy failed`;
	if (env.state === "down") return `${version} · not answering`;
	if (env.kind === "staging" && env.ahead)
		return `${version} · ${plural(env.ahead, "commit")} ahead`;
	return `${version} · healthy`;
}

export function pipelineTone(pipeline: PipelineSummary): FeedTone {
	return { failing: "danger", running: "accent", passing: "success", none: "neutral" }[
		pipeline.state
	] as FeedTone;
}

export function pipelineLine(pipeline: PipelineSummary, now?: number): string {
	switch (pipeline.state) {
		case "failing":
			return `${plural(pipeline.failing, "check")} failing${pipeline.fix ? " · fix in a thread" : ""}`;
		case "running":
			return "Running";
		case "passing":
			return pipeline.id === "main" && pipeline.at
				? `Passing · ${ago(pipeline.at, now)}`
				: "Passing";
		default:
			return "No checks";
	}
}

/** The previews row: how many are up, one per open pull request. */
export function previewsLine(previews: { live: number; open: number }): string {
	if (!previews.open) return "No open pull requests";
	return `${previews.live} live · one per open PR`;
}

/** A check's right-hand note: how long it took, or why it has not. */
export function checkNote(check: ShipCheck): string {
	if (check.state === "pending") return "Running";
	if (check.state === "skipped") return "Skipped";
	return seconds(check.seconds);
}

/** A deploy's meta line after who made it: how long it took and when. */
export function deployMeta(entry: HistoryEntry, now?: number): string {
	return [
		entry.author,
		entry.state === "running" ? "deploying" : seconds(entry.seconds),
		ago(entry.at, now),
	]
		.filter(Boolean)
		.join(" · ");
}

export function previewTone(preview: Preview): "accent" | "warning" | "danger" | "neutral" {
	return { ready: "accent", building: "accent", failed: "danger", none: "neutral" }[
		preview.state
	] as "accent" | "danger" | "neutral";
}

function productionWord(env: EnvironmentSummary): string {
	const name = envTitle(env.name);
	switch (env.state) {
		case "healthy":
			return `${name} healthy`;
		case "deploying":
			return `${name} deploying`;
		case "failing":
			return `${name}'s last deploy failed`;
		case "down":
			return `${name} not answering`;
		default:
			return `Nothing in ${env.name} yet`;
	}
}

/** The phone heading's line: production's health and how many checks fail. */
export function shipLine(overview: ShipOverview): string {
	const production = overview.environments.find((env) => env.kind === "production");
	const failing = overview.pipelines.reduce((sum, pipeline) => sum + pipeline.failing, 0);
	return (
		[
			production ? productionWord(production) : null,
			failing ? `${plural(failing, "failing check")}` : null,
		]
			.filter(Boolean)
			.join(" · ") || overview.repository
	);
}

/** The address a preview is at, without its scheme. */
export function bareUrl(url: string | null): string | undefined {
	return url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : undefined;
}

/** A rate as Ship shows it: "0.08%". */
export function rate(value: number): string {
	return `${value < 1 ? value.toFixed(2) : value.toFixed(1)}%`;
}

/** "4 commits · goes live on app.acme.dev" for a promotion. */
export function promotionLine(ahead: number | null, url: string | null): string {
	const commits = ahead === null ? "First deploy" : plural(ahead, "commit");
	const where = bareUrl(url);
	return where ? `${commits} · goes live on ${where}` : commits;
}

export { plural };
