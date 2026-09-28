import { describe, expect, it } from "bun:test";

import { type FixInclude, fixPlan, fixPrompt, logTail, runOf } from "./fix";
import type { PullDetail, PullRequests, PullReviewComment } from "./pulls";

const all: FixInclude = { checks: true, comments: true, description: true };

const detail: PullDetail = {
	number: 7,
	title: "Add login",
	author: "ana",
	branch: "login",
	base: "main",
	draft: false,
	review: null,
	checks: "failing",
	labels: [],
	additions: 10,
	deletions: 2,
	updatedAt: "2026-09-27T10:00:00Z",
	head: "abc123",
	url: "https://github.com/acme/app/pull/7",
	body: "Adds **login**.",
	state: "OPEN",
	mergeable: "MERGEABLE",
	checkList: [
		{
			name: "lint",
			workflow: "CI",
			state: "failure",
			url: "https://github.com/acme/app/actions/runs/42/job/1",
		},
		{ name: "test", workflow: "CI", state: "failure", url: null },
		{
			name: "build",
			workflow: "CI",
			state: "success",
			url: "https://github.com/acme/app/actions/runs/43",
		},
	],
	conversation: [],
	files: [],
	createdAt: "2026-09-27T09:00:00Z",
	fork: false,
};

/** A `PullRequests` that answers from fixtures; only what `fixPlan` reads is used. */
function service(parts: {
	view?: () => Promise<PullDetail>;
	log?: (target: { run: number; job: number | null }) => Promise<string>;
	comments?: () => Promise<PullReviewComment[]>;
}): PullRequests {
	return {
		view: parts.view ?? (async () => detail),
		failedLog: async (
			_userId: string,
			_folder: string,
			target: { run: number; job: number | null },
		) => (parts.log ? parts.log(target) : ""),
		reviewComments: parts.comments ?? (async () => []),
	} as unknown as PullRequests;
}

describe("fixing a pull request", () => {
	it("finds the Actions run and job in a check's URL", () => {
		expect(runOf("https://github.com/acme/app/actions/runs/42/job/1")).toEqual({ run: 42, job: 1 });
		expect(runOf("https://github.com/acme/app/actions/runs/42")).toEqual({ run: 42, job: null });
		expect(runOf("https://vercel.com/acme/app")).toBeNull();
		expect(runOf(null)).toBeNull();
	});

	it("caps each line and the whole tail, so one huge line cannot drown the message", () => {
		const tail = logTail(
			["x".repeat(50_000), ...Array.from({ length: 40 }, () => "y".repeat(299))].join("\n"),
		);
		expect(tail.length).toBeLessThanOrEqual(4_010);
		expect(tail.split("\n").every((line) => line.length <= 302)).toBe(true);
	});

	it("keeps the last lines of a log, without colour codes", () => {
		const lines = Array.from({ length: 60 }, (_, index) => `\u001b[31mline ${index}\u001b[0m`);
		const tail = logTail(lines.join("\n"));
		expect(tail.split("\n")).toHaveLength(40);
		expect(tail.startsWith("line 20")).toBe(true);
		expect(tail.endsWith("line 59")).toBe(true);
		expect(tail).not.toContain("\u001b");
	});

	it("lists the failing checks with their logs, the comments and the description", () => {
		const message = fixPrompt({
			pull: detail,
			checks: [detail.checkList[0]],
			logs: new Map([["lint", "ESLint found 2 errors"]]),
			comments: [
				{ author: "bo", path: "src/login.ts", line: 42, body: "Rename this\nAnd this" },
				{ author: "cy", path: "", line: null, body: "Needs a test" },
			],
			include: all,
		});
		expect(message).toContain('Fix pull request #7 "Add login"');
		expect(message).toContain("`login` (into `main`)");
		expect(message).toContain("- lint — CI — https://github.com/acme/app/actions/runs/42/job/1");
		expect(message).toContain("ESLint found 2 errors");
		expect(message).toContain("- @bo — src/login.ts:42");
		expect(message).toContain("  Rename this");
		expect(message).toContain("  And this");
		expect(message).toContain("- @cy");
		expect(message).toContain("Adds **login**.");
		expect(message).toContain("Push to this branch when asked.");
	});

	it("leaves out what was not asked for", () => {
		const message = fixPrompt({
			pull: { ...detail, body: "" },
			checks: [],
			logs: new Map(),
			comments: [],
			include: { checks: false, comments: false, description: true },
		});
		expect(message).not.toContain("Failing checks");
		expect(message).not.toContain("review comments");
		expect(message).not.toContain("description");
	});

	it("assembles the plan from the pull request, its failing checks and its comments", async () => {
		const asked: number[] = [];
		const plan = await fixPlan(
			service({
				log: async ({ run }) => {
					asked.push(run);
					return run === 42 ? "first\nerror: boom" : "";
				},
				comments: async () => [
					{ author: "bo", path: "src/login.ts", line: 42, body: "Rename this" },
				],
			}),
			"me",
			"/tmp/app",
			7,
			all,
		);
		expect(plan.branch).toBe("login");
		expect(plan.fork).toBe(false);
		// The check without a URL was not asked about; the successful one was not either.
		expect(asked).toEqual([42]);
		expect(plan.message).toContain("error: boom");
		expect(plan.message).toContain("- @bo — src/login.ts:42");
	});

	it("gives a fork's pull request a branch of its own, never the fork's branch name", async () => {
		const plan = await fixPlan(
			service({ view: async () => ({ ...detail, branch: "main", fork: true }) }),
			"me",
			"/tmp/app",
			7,
			all,
		);
		expect(plan).toMatchObject({ branch: "grid/pr-7", fork: true });
		expect(plan.message).toContain("`grid/pr-7`");
	});

	it("reads each failing job's log once, not the run's once per check", async () => {
		const asked: string[] = [];
		await fixPlan(
			service({
				view: async () => ({
					...detail,
					checkList: [
						{
							name: "a",
							workflow: "CI",
							state: "failure",
							url: "https://github.com/acme/app/actions/runs/9/job/1",
						},
						{
							name: "b",
							workflow: "CI",
							state: "failure",
							url: "https://github.com/acme/app/actions/runs/9/job/2",
						},
						{
							name: "c",
							workflow: "CI",
							state: "failure",
							url: "https://github.com/acme/app/actions/runs/9/job/2",
						},
					],
				}),
				log: async ({ run, job }) => {
					asked.push(`${run}/${job}`);
					return "boom";
				},
			}),
			"me",
			"/tmp/app",
			7,
			all,
		);
		expect(asked.sort()).toEqual(["9/1", "9/2"]);
	});
});
