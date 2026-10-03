import type { DiffLine } from "@/kit";

import type {
	Check,
	PullDetail,
	PullHistory,
	PullReview,
	PullSummary,
} from "../types/github.types";

/*
 * Pull requests as Figma 18 shows them: the glyph and the one line under a title, who made one,
 * the facts under its heading, the review's summary, and the changes as a reviewer reads them.
 */

/** A pull request's glyph: waiting on you, open, failing, a draft, merged or closed. */
export type PullTone = "review" | "open" | "failing" | "draft" | "merged" | "closed";

export function pullTone(pull: PullSummary, waitingOnYou: boolean, state?: string): PullTone {
	if (state === "MERGED") return "merged";
	if (state === "CLOSED") return "closed";
	if (pull.draft) return "draft";
	if (waitingOnYou) return "review";
	if (pull.checks === "failing") return "failing";
	return "open";
}

/** Under its title in the panel: "#140 · checks running", "#137 · draft", or its branch. */
export function pullLine(pull: PullSummary): string {
	const what = pull.draft
		? "draft"
		: pull.checks === "failing"
			? "checks failing"
			: pull.checks === "pending"
				? "checks running"
				: pull.branch;
	return `#${pull.number} · ${what}`;
}

/**
 * Who made it, in words: the role or the thread that opened it in Grid ("Nightly test sweep",
 * "Docs writer"), else its author; a draft says so ("Draft by sam").
 */
export function madeBy(pull: PullSummary): string {
	const who = pull.thread ? (pull.thread.role ?? pull.thread.title) : pull.author;
	return pull.draft ? `Draft by ${who}` : who;
}

/** The agent behind it: the thread's, or the one its description names. */
export function agentOf(pull: PullSummary): string | null {
	return pull.thread?.provider ?? pull.agent ?? null;
}

/** One fact under the heading, and whether it is good news. */
export type PullFact = { text: string; tone: "success" | "warning" | "danger" | "neutral" };

/** "4 checks passed", "1 of 4 checks failing", "3 checks running". */
export function checksFact(checks: readonly Check[]): PullFact | null {
	const counted = checks.filter((check) => check.state !== "skipped");
	if (counted.length === 0) return null;
	const failing = counted.filter((check) => check.state === "failure").length;
	const running = counted.filter((check) => check.state === "pending").length;
	const plural = (n: number) => (n === 1 ? "" : "s");
	if (failing)
		return {
			text: `${failing} of ${counted.length} check${plural(counted.length)} failing`,
			tone: "danger",
		};
	if (running) return { text: `${running} check${plural(running)} running`, tone: "warning" };
	return { text: `${counted.length} check${plural(counted.length)} passed`, tone: "success" };
}

/** "Approved by Codex", "Changes requested by sam", or that a review is still needed. */
export function reviewFact(
	pull: Pick<PullDetail, "review">,
	review: PullReview | null,
	nameOf: (agent: string) => string,
): (PullFact & { agent: string | null }) | null {
	const verdicts = review?.reviews ?? [];
	const named = (state: string) => {
		const found = verdicts.filter((item) => item.state === state);
		return found.map((item) => (item.agent ? nameOf(item.agent) : item.author));
	};
	const changes = named("CHANGES_REQUESTED");
	if (changes.length) {
		const agent = verdicts.find((item) => item.state === "CHANGES_REQUESTED")?.agent ?? null;
		return { text: `Changes requested by ${changes.join(", ")}`, tone: "danger", agent };
	}
	const approved = named("APPROVED");
	if (approved.length) {
		const agent = verdicts.find((item) => item.state === "APPROVED")?.agent ?? null;
		return { text: `Approved by ${approved.join(", ")}`, tone: "success", agent };
	}
	if (pull.review === "REVIEW_REQUIRED")
		return { text: "Review required", tone: "neutral", agent: null };
	return null;
}

/** Whether it merges cleanly into its base. */
export function conflictsFact(
	pull: Pick<PullDetail, "mergeable" | "base" | "state">,
): PullFact | null {
	if (pull.state !== "OPEN") return null;
	if (pull.mergeable === "MERGEABLE") return { text: "No conflicts", tone: "success" };
	if (pull.mergeable === "CONFLICTING")
		return { text: `Conflicts with ${pull.base}`, tone: "danger" };
	return { text: "Checking for conflicts", tone: "neutral" };
}

/** "3 ahead of main · 1 behind". */
export function aheadBehind(history: PullHistory, short = false): string {
	const ahead = `${history.ahead} ahead${short ? "" : ` of ${history.base}`}`;
	return history.behind ? `${ahead} · ${history.behind} behind` : ahead;
}

/**
 * The review row: who decided ("Codex approved"), and what is left ("1 comment, resolved · you
 * haven't reviewed yet").
 */
export function reviewSummary(
	review: PullReview,
	author: string,
	nameOf: (agent: string) => string,
): { title: string; detail: string; agent: string | null } {
	const latest =
		review.reviews.find((item) => item.state === "CHANGES_REQUESTED") ??
		review.reviews.find((item) => item.state === "APPROVED") ??
		review.reviews[0];
	const who = latest ? (latest.agent ? nameOf(latest.agent) : latest.author) : null;
	const title = !latest
		? "No reviews yet"
		: latest.state === "APPROVED"
			? `${who} approved`
			: latest.state === "CHANGES_REQUESTED"
				? `${who} requested changes`
				: `${who} commented`;
	const comments = review.threads.reduce((sum, thread) => sum + thread.comments.length, 0);
	const open = review.threads.filter((thread) => !thread.resolved).length;
	const parts: string[] = [];
	if (comments) {
		const said = `${comments} comment${comments === 1 ? "" : "s"}`;
		parts.push(open === 0 ? `${said}, resolved` : `${said}, ${open} open`);
	}
	const mine = review.viewer && review.reviews.some((item) => item.author === review.viewer);
	if (review.viewer && review.viewer !== author && !mine) parts.push("you haven’t reviewed yet");
	return { title, detail: parts.join(" · "), agent: latest?.agent ?? null };
}

/** "Squash 3 commits into main, then delete eta-rounding". */
export function mergeLine(
	pull: Pick<PullDetail, "base" | "branch"> & { fork?: boolean },
	commits: number | null,
): string {
	const what =
		commits === null ? "Squash its commits" : `Squash ${commits} commit${commits === 1 ? "" : "s"}`;
	return pull.fork
		? `${what} into ${pull.base}`
		: `${what} into ${pull.base}, then delete ${pull.branch}`;
}

/** A comment's body as words and suggested changes (GitHub's ```suggestion blocks). */
export type CommentPart = { kind: "text"; text: string } | { kind: "suggestion"; lines: string[] };

export function commentParts(body: string): CommentPart[] {
	const parts: CommentPart[] = [];
	const pattern = /```suggestion[^\n]*\n([\s\S]*?)```/g;
	let last = 0;
	for (const match of body.matchAll(pattern)) {
		const before = body.slice(last, match.index).trim();
		if (before) parts.push({ kind: "text", text: before });
		parts.push({ kind: "suggestion", lines: match[1].replace(/\n$/, "").split("\n") });
		last = (match.index ?? 0) + match[0].length;
	}
	const rest = body.slice(last).trim();
	if (rest) parts.push({ kind: "text", text: rest });
	return parts;
}

type CodeLine = Exclude<DiffLine, { kind: "hunk" }>;

/**
 * The changes with lines that only moved whitespace shown as unchanged, as "Hide whitespace"
 * does: within a run of removals then additions, each pair whose words match becomes context.
 */
export function hideWhitespace(lines: readonly DiffLine[]): DiffLine[] {
	const squash = (text: string | undefined) => (text ?? "").replace(/\s+/g, "");
	const out: DiffLine[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (line.kind !== "del") {
			out.push(line);
			index++;
			continue;
		}
		const dels: CodeLine[] = [];
		while (index < lines.length && lines[index].kind === "del")
			dels.push(lines[index++] as CodeLine);
		const adds: CodeLine[] = [];
		while (index < lines.length && lines[index].kind === "add")
			adds.push(lines[index++] as CodeLine);
		const keptDels: CodeLine[] = [];
		const keptAdds: CodeLine[] = [];
		const same: CodeLine[] = [];
		for (let at = 0; at < Math.max(dels.length, adds.length); at++) {
			const del = dels[at];
			const add = adds[at];
			if (del && add && squash(del.text) === squash(add.text)) {
				same.push({ kind: "context", old: del.old, new: add.new, text: add.text, html: add.html });
			} else {
				if (del) keptDels.push(del);
				if (add) keptAdds.push(add);
			}
		}
		out.push(...keptDels, ...keptAdds, ...same);
	}
	return out;
}

/** A row of the side-by-side view: the old line on the left, the new on the right. */
export type SplitRow =
	| { kind: "hunk"; text: string }
	| { kind: "pair"; left: CodeLine | null; right: CodeLine | null };

/** The changes side by side: unchanged lines on both sides, a run's removals beside its additions. */
export function splitRows(lines: readonly DiffLine[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (line.kind === "hunk") {
			rows.push({ kind: "hunk", text: line.text });
			index++;
		} else if (line.kind === "context") {
			rows.push({ kind: "pair", left: line, right: line });
			index++;
		} else {
			const dels: CodeLine[] = [];
			while (index < lines.length && lines[index].kind === "del")
				dels.push(lines[index++] as CodeLine);
			const adds: CodeLine[] = [];
			while (index < lines.length && lines[index].kind === "add")
				adds.push(lines[index++] as CodeLine);
			for (let at = 0; at < Math.max(dels.length, adds.length); at++)
				rows.push({ kind: "pair", left: dels[at] ?? null, right: adds[at] ?? null });
		}
	}
	return rows;
}
