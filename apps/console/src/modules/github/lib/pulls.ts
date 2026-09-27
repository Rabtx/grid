import type { Check, CheckState, PullDetail, PullSummary } from "../types/github.types";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** How a pull request's checks read in a list: a word and a tone. */
export const CHECKS: Record<CheckState, { label: string; tone: Tone } | null> = {
	passing: { label: "Checks pass", tone: "success" },
	failing: { label: "Checks fail", tone: "danger" },
	pending: { label: "Checks running", tone: "warning" },
	none: null,
};

/** Where a pull request stands with its reviewers. */
export function reviewLabel(review: string | null): { label: string; tone: Tone } | null {
	switch (review) {
		case "APPROVED":
			return { label: "Approved", tone: "success" };
		case "CHANGES_REQUESTED":
			return { label: "Changes requested", tone: "danger" };
		case "REVIEW_REQUIRED":
			return { label: "Review required", tone: "neutral" };
		default:
			return null;
	}
}

/** "Merged", "Closed", "Draft" or "Open". */
export function stateLabel(pull: Pick<PullDetail, "state" | "draft">): {
	label: string;
	tone: Tone;
} {
	if (pull.state === "MERGED") return { label: "Merged", tone: "accent" };
	if (pull.state === "CLOSED") return { label: "Closed", tone: "danger" };
	if (pull.draft) return { label: "Draft", tone: "neutral" };
	return { label: "Open", tone: "success" };
}

/** Checks in the order worth reading: failing, then running, then the rest. */
export function sortChecks(checks: readonly Check[]): Check[] {
	const rank = { failure: 0, pending: 1, success: 2, neutral: 3, skipped: 4 };
	return [...checks].sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name));
}

/** What merging needs first, or null when it can merge now. */
export function mergeBlocker(pull: PullDetail): string | null {
	if (pull.state !== "OPEN") return "It is not open";
	if (pull.draft) return "Mark it ready for review first";
	if (pull.mergeable === "CONFLICTING") return "It has conflicts with its base branch";
	return null;
}

/** A pull request's one-line subtitle in a list: its number, branch and author. */
export function pullSubtitle(pull: PullSummary): string {
	return `#${pull.number} · ${pull.branch} · @${pull.author}`;
}
