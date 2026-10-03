import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitHubError } from "./codespaces";
import type { Gh, GhResult } from "./gh";
import {
	checksState,
	conversation,
	PullRequests,
	pullAgent,
	readCheck,
	readReview,
	repoOf,
	reviewComments,
	splitDiff,
} from "./pulls";

const folders: string[] = [];
afterAll(() => {
	for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

function repoFolder(origin?: string): string {
	const folder = mkdtempSync(join(tmpdir(), "grid-pulls-"));
	folders.push(folder);
	Bun.spawnSync(["git", "init", "-q", folder]);
	if (origin) Bun.spawnSync(["git", "-C", folder, "remote", "add", "origin", origin]);
	return folder;
}

/** A fake `gh` that answers from `reply` and keeps every call. */
function fakeGh(reply: (args: string[]) => Partial<GhResult>) {
	const calls: string[][] = [];
	const gh: Gh = {
		run: async (args) => {
			calls.push(args);
			return { code: 0, stdout: "", stderr: "", ...reply(args) };
		},
		spawn: () => {
			throw new Error("not used");
		},
	};
	return { gh, calls };
}

const owner = (userId: string) => {
	if (userId !== "me")
		throw new GitHubError("Someone else in this Grid has connected GitHub here", 403);
};

describe("reading GitHub's answers", () => {
	it("reads check runs and commit statuses alike", () => {
		expect(
			readCheck({
				__typename: "CheckRun",
				name: "lint",
				workflowName: "CI",
				status: "COMPLETED",
				conclusion: "FAILURE",
				detailsUrl: "https://ci/1",
			}),
		).toEqual({ name: "lint", workflow: "CI", state: "failure", url: "https://ci/1" });
		expect(readCheck({ __typename: "CheckRun", name: "test", status: "IN_PROGRESS" }).state).toBe(
			"pending",
		);
		expect(
			readCheck({ __typename: "CheckRun", name: "e2e", status: "COMPLETED", conclusion: "SKIPPED" })
				.state,
		).toBe("skipped");
		expect(
			readCheck({
				__typename: "StatusContext",
				context: "vercel",
				state: "SUCCESS",
				targetUrl: "u",
			}),
		).toEqual({ name: "vercel", workflow: null, state: "success", url: "u" });
	});

	it("sums checks up: a failure first, then anything still running", () => {
		const check = (state: "success" | "failure" | "pending" | "skipped") => ({
			name: state,
			workflow: null,
			url: null,
			state,
		});
		expect(checksState([])).toBe("none");
		expect(checksState([check("success"), check("skipped")])).toBe("passing");
		expect(checksState([check("success"), check("pending")])).toBe("pending");
		expect(checksState([check("pending"), check("failure")])).toBe("failing");
	});

	it("puts reviews and comments in one conversation, oldest first", () => {
		const talk = conversation({
			comments: [
				{ author: { login: "ana" }, body: "Looks good", createdAt: "2026-09-27T10:05:00Z" },
			],
			reviews: [
				{
					author: { login: "bo" },
					body: "",
					state: "APPROVED",
					submittedAt: "2026-09-27T10:09:00Z",
				},
				// A bare "commented" review is only the wrapper of inline comments: nothing to show.
				{
					author: { login: "bo" },
					body: " ",
					state: "COMMENTED",
					submittedAt: "2026-09-27T10:01:00Z",
				},
				{
					author: null,
					body: "Rename this",
					state: "CHANGES_REQUESTED",
					submittedAt: "2026-09-27T10:00:00Z",
				},
			],
		});
		expect(talk).toEqual([
			{
				author: "ghost",
				body: "Rename this",
				at: "2026-09-27T10:00:00Z",
				review: "CHANGES_REQUESTED",
			},
			{ author: "ana", body: "Looks good", at: "2026-09-27T10:05:00Z" },
			{ author: "bo", body: "", at: "2026-09-27T10:09:00Z", review: "APPROVED" },
		]);
	});

	it("splits a whole pull request's diff into files", () => {
		const files = splitDiff(
			[
				"diff --git a/src/a.ts b/src/a.ts",
				"index 1..2 100644",
				"--- a/src/a.ts",
				"+++ b/src/a.ts",
				"@@ -1,2 +1,2 @@",
				" keep",
				"-old",
				"+new",
				"diff --git a/gone.ts b/gone.ts",
				"deleted file mode 100644",
				"--- a/gone.ts",
				"+++ /dev/null",
				"@@ -1 +0,0 @@",
				"-bye",
				"",
			].join("\n"),
		);
		expect(files.map((file) => [file.path, file.added, file.removed])).toEqual([
			["src/a.ts", 1, 1],
			["gone.ts", 0, 1],
		]);
		expect(files[0].patch).toBe("@@ -1,2 +1,2 @@\n keep\n-old\n+new");
	});

	it("keeps only the unresolved review comments, with where they hang", () => {
		const found = reviewComments({
			data: {
				repository: {
					pullRequest: {
						reviewThreads: {
							nodes: [
								{
									isResolved: false,
									comments: {
										nodes: [
											{
												author: { login: "bo" },
												path: "src/a.ts",
												line: 12,
												originalLine: 9,
												body: "Rename",
											},
											{
												author: null,
												path: "src/a.ts",
												line: null,
												body: "  ",
											},
										],
									},
								},
								{
									isResolved: true,
									comments: {
										nodes: [{ author: { login: "cy" }, path: "src/b.ts", line: 3, body: "Done" }],
									},
								},
								// A thread GitHub did not mark: treated as unresolved, at its original line.
								{
									comments: {
										nodes: [
											{
												author: { login: "di" },
												path: "src/c.ts",
												line: null,
												originalLine: 5,
												body: "File note",
											},
										],
									},
								},
							],
						},
					},
				},
			},
		});
		expect(found).toEqual([
			{ author: "bo", path: "src/a.ts", line: 12, body: "Rename" },
			{ author: "di", path: "src/c.ts", line: 5, body: "File note" },
		]);
	});

	it("knows a GitHub repository from any other remote", () => {
		expect(repoOf("https://github.com/acme/app")).toBe("acme/app");
		expect(repoOf("https://gitlab.com/acme/app")).toBeNull();
		expect(repoOf(null)).toBeNull();
	});
});

describe("pull requests through gh", () => {
	const pull = {
		number: 7,
		title: "Add login",
		author: { login: "ana" },
		headRefName: "login",
		baseRefName: "main",
		isDraft: true,
		reviewDecision: "",
		statusCheckRollup: [
			{ __typename: "CheckRun", name: "ci", status: "COMPLETED", conclusion: "SUCCESS" },
		],
		labels: [{ name: "ui" }],
		additions: 10,
		deletions: 2,
		createdAt: "2026-09-26T10:00:00Z",
		updatedAt: "2026-09-27T10:00:00Z",
		headRefOid: "abc123",
		url: "https://github.com/acme/app/pull/7",
	};

	it("lists the repository of the project's origin, with the filter asked for", async () => {
		const { gh, calls } = fakeGh(() => ({ stdout: JSON.stringify([pull]) }));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("git@github.com:acme/app.git");
		const list = await pulls.list("me", folder, "review");
		expect(list).toEqual([
			{
				agent: null,
				number: 7,
				title: "Add login",
				author: "ana",
				branch: "login",
				base: "main",
				draft: true,
				review: null,
				checks: "passing",
				labels: ["ui"],
				additions: 10,
				deletions: 2,
				createdAt: "2026-09-26T10:00:00Z",
				updatedAt: "2026-09-27T10:00:00Z",
				head: "abc123",
				url: "https://github.com/acme/app/pull/7",
			},
		]);
		expect(calls[0].slice(0, 9)).toEqual([
			"pr",
			"list",
			"--repo",
			"acme/app",
			"--state",
			"open",
			"--limit",
			"100",
			"--search",
		]);
		expect(calls[0]).toContain("review-requested:@me");
	});

	it("asks GitHub for a pull request's review threads", async () => {
		const { gh, calls } = fakeGh(() => ({
			stdout: JSON.stringify({
				data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } },
			}),
		}));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("https://github.com/acme/app.git");
		await expect(pulls.reviewComments("me", folder, 7)).resolves.toEqual([]);
		expect(calls[0].slice(0, 2)).toEqual(["api", "graphql"]);
		expect(calls[0]).toContain("owner=acme");
		expect(calls[0]).toContain("name=app");
		expect(calls[0]).toContain("number=7");
	});

	it("reads a failed run's log through gh, and nothing when there is none", async () => {
		const { gh, calls } = fakeGh(() => ({ stdout: "error: boom\n" }));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("https://github.com/acme/app.git");
		await expect(pulls.failedLog("me", folder, { run: 42, job: null })).resolves.toBe(
			"error: boom\n",
		);
		expect(calls[0]).toEqual(["run", "view", "42", "--repo", "acme/app", "--log-failed"]);
		// One job of a run: that job's log only.
		await pulls.failedLog("me", folder, { run: 42, job: 7 });
		expect(calls[1]).toEqual(["run", "view", "--job", "7", "--repo", "acme/app", "--log-failed"]);

		const none = new PullRequests(fakeGh(() => ({ code: 1, stderr: "no failed jobs" })).gh, owner);
		await expect(none.failedLog("me", folder, { run: 42, job: null })).resolves.toBe("");
	});

	it("acts with gh's own commands", async () => {
		const { gh, calls } = fakeGh(() => ({}));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("https://github.com/acme/app.git");
		await pulls.merge("me", folder, 7, "squash");
		await pulls.ready("me", folder, 7, false);
		await pulls.comment("me", folder, 7, "Thanks!");
		expect(calls).toEqual([
			["pr", "merge", "7", "--repo", "acme/app", "--squash"],
			["pr", "ready", "7", "--repo", "acme/app", "--undo"],
			["pr", "comment", "7", "--repo", "acme/app", "--body", "Thanks!"],
		]);
	});

	it("is only for the person who connected GitHub", async () => {
		const { gh, calls } = fakeGh(() => ({ stdout: "[]" }));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("https://github.com/acme/app.git");
		await expect(pulls.list("someone-else", folder, "open")).rejects.toThrow("Someone else");
		expect(calls).toEqual([]);
	});

	it("says when the folder has no GitHub origin", async () => {
		const { gh } = fakeGh(() => ({ stdout: "[]" }));
		const pulls = new PullRequests(gh, owner);
		await expect(pulls.list("me", repoFolder(), "open")).rejects.toThrow(
			"no GitHub repository as its origin",
		);
	});

	it("passes on what gh said when it fails", async () => {
		const { gh } = fakeGh(() => ({ code: 1, stderr: "Pull request is not mergeable\nmore" }));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("https://github.com/acme/app.git");
		await expect(pulls.merge("me", folder, 7, "merge")).rejects.toThrow(
			"Pull request is not mergeable",
		);
	});
});

describe("pull request history and review", () => {
	const commit = (sha: string, message: string, login: string, date: string) => ({
		sha,
		author: { login },
		commit: { message, author: { name: login, email: `${login}@example.com`, date } },
	});

	it("names the agent behind a pull request from its signature lines only", () => {
		expect(pullAgent("sam", "Fix it.\n\n🤖 Generated with [Claude Code](https://claude.com)")).toBe(
			"claude",
		);
		expect(pullAgent("sam", "Teaches the app to talk to Claude.")).toBeNull();
		expect(pullAgent("codex[bot]", "")).toBe("codex");
	});

	it("reads how the branch sits on its base, newest commit first, with tags and agents", async () => {
		const pullCommit = (oid: string, headline: string, body = "") => ({
			oid,
			messageHeadline: headline,
			messageBody: body,
			authoredDate: "2026-10-02T00:00:00Z",
			authors: [{ login: "sam", name: "Sam", email: "sam@example.com" }],
		});
		let state = "OPEN";
		const { gh, calls } = fakeGh((args) => {
			if (args[0] === "pr")
				return {
					stdout: JSON.stringify({
						baseRefName: "main",
						headRefOid: "c3",
						state,
						commits: [
							pullCommit("c2", "Reproduce the 0 min ETA"),
							pullCommit(
								"c3",
								"Clamp before rounding",
								"Co-Authored-By: Claude <noreply@anthropic.com>",
							),
						],
					}),
				};
			if (args[1]?.includes("/compare/"))
				return {
					stdout: JSON.stringify({
						ahead_by: 2,
						behind_by: 1,
						merge_base_commit: commit("b0", "Release 0.8.2", "sam", "2026-10-01T00:00:00Z"),
						commits: [],
					}),
				};
			if (args[1]?.includes("/tags"))
				return { stdout: JSON.stringify([{ name: "v0.8.2", commit: { sha: "b0" } }]) };
			if (args[1]?.includes("/commits/main"))
				return {
					stdout: JSON.stringify(commit("m1", "Update setup steps", "ana", "2026-10-02T02:00:00Z")),
				};
			return { stdout: "{}" };
		});
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("git@github.com:acme/app.git");
		const history = await pulls.history("me", folder, 7);
		expect(history).toMatchObject({ base: "main", ahead: 2, behind: 1 });
		expect(history.commits.map((item) => [item.subject, item.agent])).toEqual([
			["Clamp before rounding", "claude"],
			["Reproduce the 0 min ETA", null],
		]);
		expect(history.mergeBase).toMatchObject({ subject: "Release 0.8.2", tags: ["v0.8.2"] });
		expect(history.baseTip).toMatchObject({ subject: "Update setup steps", author: "ana" });
		expect(calls.some((args) => args[1] === "repos/acme/app/compare/main...c3")).toBe(true);
		// A merged one shows what it brought, without comparing it to a base that has moved on.
		state = "MERGED";
		const merged = await pulls.history("me", folder, 7);
		expect(merged).toMatchObject({ ahead: 2, behind: 0, baseTip: null, mergeBase: null });
	});

	it("reads review threads, viewed files and verdicts", () => {
		const review = readReview({
			data: {
				viewer: { login: "me" },
				repository: {
					pullRequest: {
						id: "PR_1",
						files: {
							nodes: [
								{ path: "eta.ts", viewerViewedState: "UNVIEWED" },
								{ path: "eta.test.ts", viewerViewedState: "VIEWED" },
							],
						},
						reviewThreads: {
							nodes: [
								{
									id: "T1",
									isResolved: true,
									path: "eta.ts",
									line: 9,
									diffSide: "RIGHT",
									comments: {
										nodes: [{ author: { login: "codex" }, body: "Export it", createdAt: "x" }],
									},
								},
							],
						},
						latestReviews: { nodes: [{ author: { login: "codex" }, state: "APPROVED" }] },
					},
				},
			},
		});
		expect(review.viewed).toEqual(["eta.test.ts"]);
		expect(review.threads[0]).toMatchObject({
			resolved: true,
			path: "eta.ts",
			line: 9,
			side: "RIGHT",
			comments: [{ author: "codex", agent: "codex", body: "Export it" }],
		});
		expect(review.reviews).toEqual([{ author: "codex", agent: "codex", state: "APPROVED" }]);
	});

	it("submits a review with its line comments as JSON", async () => {
		let sent: unknown = null;
		const { gh } = fakeGh((args) => {
			const input = args[args.indexOf("--input") + 1];
			if (args.includes("--input")) sent = JSON.parse(readFileSync(input, "utf8"));
			return { stdout: "{}" };
		});
		const pulls = new PullRequests(gh, owner);
		await pulls.submitReview("me", repoFolder("git@github.com:acme/app.git"), 7, {
			event: "REQUEST_CHANGES",
			body: " Keep 2 minutes ",
			comments: [{ path: "eta.ts", line: 9, side: "RIGHT", body: "Keep 2 minutes" }],
		});
		expect(sent).toEqual({
			event: "REQUEST_CHANGES",
			body: "Keep 2 minutes",
			comments: [{ path: "eta.ts", line: 9, side: "RIGHT", body: "Keep 2 minutes" }],
		});
	});
});
