import { describe, expect, it } from "vitest";

import type { DiffLine } from "@/kit";

import type { PullReview, PullSummary } from "../types/github.types";

import {
	checksFact,
	commentParts,
	hideWhitespace,
	madeBy,
	mergeLine,
	pullLine,
	pullTone,
	reviewFact,
	reviewSummary,
	splitRows,
} from "./pull-look";

const pull = (over: Partial<PullSummary> = {}): PullSummary => ({
	number: 142,
	title: "Fix ETA rounding",
	author: "sam",
	branch: "eta-rounding",
	base: "main",
	draft: false,
	review: null,
	checks: "passing",
	labels: [],
	additions: 12,
	deletions: 3,
	updatedAt: "2026-10-03T00:00:00Z",
	url: "https://github.com/acme/app/pull/142",
	...over,
});
const name = (agent: string) => ({ codex: "Codex", claude: "Claude Code" })[agent] ?? agent;

describe("pull look", () => {
	it("says how a pull request stands in the panel and who made it", () => {
		expect(pullLine(pull())).toBe("#142 · eta-rounding");
		expect(pullLine(pull({ checks: "pending" }))).toBe("#142 · checks running");
		expect(pullLine(pull({ draft: true }))).toBe("#142 · draft");
		expect(pullTone(pull(), true)).toBe("review");
		expect(pullTone(pull({ checks: "failing" }), false)).toBe("failing");
		expect(
			madeBy(
				pull({ thread: { id: "t", title: "Nightly test sweep", provider: "claude", role: null } }),
			),
		).toBe("Nightly test sweep");
		expect(
			madeBy(pull({ thread: { id: "t", title: "x", provider: "claude", role: "Docs writer" } })),
		).toBe("Docs writer");
		expect(madeBy(pull({ draft: true }))).toBe("Draft by sam");
	});

	it("counts checks and names who approved", () => {
		const check = (state: "success" | "failure" | "pending" | "skipped") => ({
			name: "ci",
			workflow: null,
			state,
			url: null,
		});
		expect(checksFact([check("success"), check("success"), check("skipped")])).toEqual({
			text: "2 checks passed",
			tone: "success",
		});
		expect(checksFact([check("success"), check("failure")])?.text).toBe("1 of 2 checks failing");
		const review: PullReview = {
			viewer: "me",
			pullId: "P",
			viewed: [],
			threads: [
				{
					id: "T",
					resolved: true,
					outdated: false,
					path: "eta.ts",
					line: 9,
					side: "RIGHT",
					comments: [{ author: "codex", agent: "codex", body: "Export it", at: "" }],
				},
			],
			reviews: [{ author: "codex", agent: "codex", state: "APPROVED" }],
		};
		expect(reviewFact({ review: "APPROVED" }, review, name)?.text).toBe("Approved by Codex");
		expect(reviewSummary(review, "sam", name)).toEqual({
			title: "Codex approved",
			detail: "1 comment, resolved · you haven’t reviewed yet",
			agent: "codex",
		});
		expect(mergeLine({ base: "main", branch: "eta-rounding", fork: false }, 3)).toBe(
			"Squash 3 commits into main, then delete eta-rounding",
		);
	});

	it("reads suggested changes out of a comment", () => {
		expect(
			commentParts("Export it.\n\n```suggestion\nexport const ARRIVING = -1\n```\nThanks"),
		).toEqual([
			{ kind: "text", text: "Export it." },
			{ kind: "suggestion", lines: ["export const ARRIVING = -1"] },
			{ kind: "text", text: "Thanks" },
		]);
	});

	it("hides whitespace-only changes and pairs lines side by side", () => {
		const lines: DiffLine[] = [
			{ kind: "context", old: 1, new: 1, text: "a" },
			{ kind: "del", old: 2, new: null, text: "if (x) {" },
			{ kind: "del", old: 3, new: null, text: "  go()" },
			{ kind: "add", old: null, new: 2, text: "if (x)  {" },
			{ kind: "add", old: null, new: 3, text: "  stop()" },
		];
		const hidden = hideWhitespace(lines);
		expect(hidden.map((line) => line.kind)).toEqual(["context", "del", "add", "context"]);
		expect(splitRows(lines)).toEqual([
			{ kind: "pair", left: lines[0], right: lines[0] },
			{ kind: "pair", left: lines[1], right: lines[3] },
			{ kind: "pair", left: lines[2], right: lines[4] },
		]);
	});
});
