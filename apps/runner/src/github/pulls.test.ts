import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitHubError } from "./codespaces";
import type { Gh, GhResult } from "./gh";
import { checksState, conversation, PullRequests, readCheck, repoOf, splitDiff } from "./pulls";

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
		updatedAt: "2026-09-27T10:00:00Z",
		url: "https://github.com/acme/app/pull/7",
	};

	it("lists the repository of the project's origin, with the filter asked for", async () => {
		const { gh, calls } = fakeGh(() => ({ stdout: JSON.stringify([pull]) }));
		const pulls = new PullRequests(gh, owner);
		const folder = repoFolder("git@github.com:acme/app.git");
		const list = await pulls.list("me", folder, "review");
		expect(list).toEqual([
			{
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
				updatedAt: "2026-09-27T10:00:00Z",
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
