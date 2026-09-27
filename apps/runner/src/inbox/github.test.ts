import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GitHubError } from "../github/codespaces";
import type { PullFilter, PullSummary } from "../github/pulls";

import { GithubInbox, linkedFolders } from "./github";
import { InboxStore } from "./store";

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A real projects directory: containment is checked by resolving the path, so it has to exist. */
function projectsDir(...projects: string[]): string {
	const root = mkdtempSync(join(tmpdir(), "grid-inbox-"));
	roots.push(root);
	for (const project of projects) mkdirSync(join(root, project));
	return root;
}

const pull = (over: Partial<PullSummary> = {}): PullSummary => ({
	number: 12,
	title: "Add the inbox",
	author: "sam",
	branch: "agent/web/inbox",
	base: "main",
	draft: false,
	review: "REVIEW_REQUIRED",
	checks: "passing",
	labels: [],
	additions: 10,
	deletions: 1,
	updatedAt: "2026-09-28T09:00:00.000Z",
	url: "https://github.com/shabirkhan-dev/grid/pull/12",
	...over,
});

type Pulls = ConstructorParameters<typeof GithubInbox>[1]["pulls"];

/** A stand-in for the pull request service that answers from a script, and fails where told. */
function fakePulls(answers: { review?: PullSummary[] | Error; open?: PullSummary[] | Error }) {
	const asked: { folder: string; filter: PullFilter }[] = [];
	return {
		asked,
		pulls: {
			list: async (_userId: string, folder: string, filter: PullFilter) => {
				asked.push({ folder, filter });
				const given = filter === "review" ? answers.review : answers.open;
				if (given instanceof Error) return Promise.reject(given);
				return Promise.resolve(given ?? []);
			},
		} as unknown as Pulls,
	};
}

function inbox(
	pulls: Pulls,
	over: Partial<ConstructorParameters<typeof GithubInbox>[1]> = {},
	folders: Record<string, string> = {},
) {
	const store = new InboxStore(":memory:");
	const gh = new GithubInbox(store, {
		pulls,
		isOwner: (userId) => userId === "me",
		foldersOf: () => folders,
		now: () => 1_000_000,
		...over,
	});
	return { store, gh };
}

describe("linkedFolders", () => {
	it("keeps only folders inside the projects directory", () => {
		const outside = projectsDir("grid");
		const root = projectsDir("grid");
		expect(linkedFolders({ grid: join(root, "grid"), elsewhere: outside }, root)).toEqual({
			grid: join(root, "grid"),
		});
	});
});

describe("GithubInbox", () => {
	it("keeps the review requests and the failing checks, and leaves the rest of GitHub out", async () => {
		const root = projectsDir("grid");
		const { store, gh } = inbox(
			fakePulls({
				review: [
					pull(),
					pull({
						number: 13,
						author: "ada",
						updatedAt: "2026-09-28T10:00:00.000Z",
					}),
				],
				open: [
					pull({ checks: "failing" }),
					pull({ number: 14, checks: "passing" }),
					pull({ number: 15, checks: "pending" }),
				],
			}).pulls,
			{},
			{ grid: join(root, "grid") },
		);
		expect(await gh.sync("me", "acme", root)).toBe(true);
		expect(store.list("acme").items).toEqual([
			{
				id: "pull_review:grid:13",
				workspaceId: "acme",
				kind: "pull_review",
				project: "grid",
				title: "Add the inbox",
				body: "@ada asked for your review",
				url: "/pulls/grid?pr=13",
				createdAt: "2026-09-28T10:00:00.000Z",
				readAt: null,
			},
			{
				id: "pull_review:grid:12",
				workspaceId: "acme",
				kind: "pull_review",
				project: "grid",
				title: "Add the inbox",
				body: "@sam asked for your review",
				url: "/pulls/grid?pr=12",
				createdAt: "2026-09-28T09:00:00.000Z",
				readAt: null,
			},
			{
				id: "pull_checks:grid:12",
				workspaceId: "acme",
				kind: "pull_checks",
				project: "grid",
				title: "Add the inbox",
				body: "Checks are failing",
				url: "/pulls/grid?pr=12",
				createdAt: "2026-09-28T09:00:00.000Z",
				readAt: null,
			},
		]);
		store.close();
	});

	it("does not ask when it asked a moment ago, and never asks about somebody else's GitHub", async () => {
		const root = projectsDir("grid");
		const fake = fakePulls({ review: [pull()], open: [] });
		let clock = 1_000_000;
		const { gh } = inbox(fake.pulls, { now: () => clock }, { grid: join(root, "grid") });
		expect(gh.available("me")).toBe(true);
		expect(gh.available("someone-else")).toBe(false);
		expect(gh.stale("acme")).toBe(true);
		await gh.sync("me", "acme", root);
		expect(fake.asked).toHaveLength(2);
		// Someone else's sign-in is not asked about, and does not mark the workspace fresh.
		expect(await gh.sync("someone-else", "other", root)).toBe(false);
		expect(fake.asked).toHaveLength(2);
		clock += 59_000;
		expect(gh.stale("acme")).toBe(false);
		clock += 2_000;
		expect(gh.stale("acme")).toBe(true);
	});

	it("keeps a project's items when another project's folder has no repository", async () => {
		const root = projectsDir("good", "broken");
		const store = new InboxStore(":memory:");
		const gh = new GithubInbox(store, {
			pulls: {
				list: async (_userId: string, folder: string, filter: PullFilter) => {
					if (folder.endsWith("broken"))
						throw new GitHubError("This project's folder has no GitHub repository", 409);
					return filter === "review" ? [pull()] : [];
				},
			} as unknown as Pulls,
			isOwner: () => true,
			foldersOf: () => ({ good: join(root, "good"), broken: join(root, "broken") }),
		});
		expect(await gh.sync("me", "acme", root)).toBe(true);
		expect(store.list("acme").items.map((item) => item.id)).toEqual(["pull_review:good:12"]);
		store.close();
	});

	it("forgets a review that was given and a check that started passing", async () => {
		const root = projectsDir("grid");
		const { store, gh } = inbox(
			fakePulls({ review: [pull()], open: [pull({ checks: "failing" })] }).pulls,
			{},
			{ grid: join(root, "grid") },
		);
		await gh.sync("me", "acme", root);
		expect(store.list("acme").unread).toBe(2);

		const settled = fakePulls({ review: [], open: [pull({ checks: "passing" })] });
		const later = new GithubInbox(store, {
			pulls: settled.pulls,
			isOwner: () => true,
			foldersOf: () => ({ grid: join(root, "grid") }),
		});
		await later.sync("me", "acme", root);
		expect(store.list("acme").items).toEqual([]);
		store.close();
	});

	it("asks about nothing when no folder is linked", async () => {
		const root = projectsDir();
		const fake = fakePulls({ review: [pull()], open: [] });
		const { store, gh } = inbox(fake.pulls, {}, { grid: "/etc/grid" });
		await gh.sync("me", "acme", root);
		expect(fake.asked).toEqual([]);
		expect(store.list("acme").items).toEqual([]);
		store.close();
	});
});
