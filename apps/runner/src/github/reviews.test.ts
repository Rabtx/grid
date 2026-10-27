import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentSession, Provider } from "../agents/provider";
import type { Who } from "../auth";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { until } from "../chat/test-agents";
import type { Gh, GhResult } from "./gh";
import { reviewRequest } from "./review-routes";
import { MAX_DIFF, PullReviews, replyOf, reviewPrompt } from "./reviews";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
});

const admin: Who = { userId: "ana", workspace: "acme", role: "admin" };
const member: Who = { userId: "bo", workspace: "acme", role: "member" };

type Pull = {
	number: number;
	title: string;
	draft?: boolean;
	updated_at: string;
	head: { sha: string };
};

/** A GitHub with some open pull requests, keeping the comments posted on them. */
function fakeGitHub(pulls: Pull[]) {
	const posted: { path: string; body: string }[] = [];
	const ok = (stdout: string): GhResult => ({ code: 0, stdout, stderr: "" });
	const gh: Gh = {
		run: async (args: string[]) => {
			const path = args[1] ?? "";
			if (path.startsWith("repos/acme/web/pulls?")) return ok(JSON.stringify(pulls));
			const one = path.match(/^repos\/acme\/web\/pulls\/(\d+)$/);
			if (one && args.includes("Accept: application/vnd.github.diff"))
				return ok(`diff --git a/src/pay.ts b/src/pay.ts\n+  charge(amount)\n`);
			if (one) {
				const pull = pulls.find((item) => item.number === Number(one[1]));
				return pull ? ok(JSON.stringify(pull)) : { code: 1, stdout: "", stderr: "Not Found" };
			}
			const comment = path.match(/^repos\/acme\/web\/issues\/(\d+)\/comments$/);
			if (comment) {
				const body = args[args.indexOf("-f") + 1]?.replace(/^body=/, "") ?? "";
				posted.push({ path, body });
				return ok(
					JSON.stringify({ html_url: `https://github.com/acme/web/pull/${comment[1]}#c1` }),
				);
			}
			return { code: 1, stdout: "", stderr: `unexpected ${args.join(" ")}` };
		},
		start: () => {
			throw new Error("not used");
		},
	} as unknown as Gh;
	return { gh, posted };
}

function setup(pulls: Pull[], reply = "Looks risky: `charge` is called without a retry guard.") {
	const root = mkdtempSync(join(tmpdir(), "grid-reviews-test-"));
	cleanup.push(() => rmSync(root, { recursive: true, force: true }));
	const folder = join(root, "web");
	mkdirSync(folder);
	const store = new ChatStore(join(root, "chat.db"));
	const prompts: { text: string; mode?: string }[] = [];
	const provider: Provider = {
		info: () => ({
			id: "fake",
			name: "Fake Agent",
			available: true,
			models: [],
			modes: [
				{ id: "default", name: "Ask" },
				{ id: "plan", name: "Plan" },
			],
			defaultMode: "default",
		}),
		start: async (context): Promise<AgentSession> => ({
			prompt: async (text) => {
				prompts.push({ text, mode: context.mode });
				context.emit({ type: "message", text: reply });
				return { reason: "done" };
			},
			cancel() {},
			approve() {},
			close() {},
			setModel: async () => {},
			setMode: async () => {},
			setEffort: async () => {},
		}),
	};
	const hub = new ChatHub(store, new Map([["fake", provider]]), root);
	hub.linkProjectFolder("acme", "web", folder);
	const github = fakeGitHub(pulls);
	const audited: string[] = [];
	const reviews = new PullReviews(hub, github.gh, join(root, "chat.db"), {
		remoteOf: () => "https://github.com/acme/web.git",
		audit: (draft) => audited.push(draft.action),
	});
	cleanup.push(() => {
		reviews.close();
		store.close();
	});
	return { hub, reviews, prompts, posted: github.posted, audited };
}

describe("the review agent's message", () => {
	it("carries the pull request, its diff (cut when long) and the project's own asks", () => {
		const prompt = reviewPrompt({
			repo: "acme/web",
			pull: {
				number: 7,
				title: "Charge cards",
				body: "Adds charging.",
				user: { login: "dana" },
				head: { ref: "charge" },
				base: { ref: "main" },
			},
			diff: "x".repeat(MAX_DIFF + 10),
			instructions: "Check money is never a float.",
		});
		expect(prompt).toContain('acme/web#7, "Charge cards" by @dana: charge into main');
		expect(prompt).toContain("it was cut at");
		expect(prompt).toContain("Check money is never a float.");
		expect(prompt).toContain("change nothing");
	});

	it("takes what the agent said in its last turn", () => {
		expect(
			replyOf([
				{ type: "message", text: "old" },
				{ type: "turn_start" },
				{ type: "message", text: "Fine " },
				{ type: "tool" },
				{ type: "message", text: "to merge." },
			]),
		).toBe("Fine to merge.");
	});
});

describe("pull request reviews", () => {
	it("reviews each pull request pushed to since it was turned on, once a commit, and posts it", async () => {
		const later = new Date(Date.now() + 60_000).toISOString();
		const { reviews, prompts, posted, audited } = setup([
			{ number: 7, title: "Charge cards", updated_at: later, head: { sha: "abc1234def" } },
			{ number: 8, title: "Draft thing", draft: true, updated_at: later, head: { sha: "f00" } },
			{ number: 9, title: "Old one", updated_at: "2020-01-01T00:00:00Z", head: { sha: "b33" } },
		]);
		reviews.save(admin, "web", {
			enabled: true,
			provider: "fake",
			instructions: "Money is cents.",
		});
		await reviews.tick();
		await until(() => reviews.list("acme", "web")[0]?.status === "posted");
		expect(prompts).toHaveLength(1);
		expect(prompts[0]?.mode).toBe("plan");
		expect(prompts[0]?.text).toContain("Money is cents.");
		expect(posted).toHaveLength(1);
		expect(posted[0]?.path).toBe("repos/acme/web/issues/7/comments");
		expect(posted[0]?.body).toContain("retry guard");
		expect(posted[0]?.body).toContain("Reviewed by Fake Agent through Grid, at abc1234");
		const [done] = reviews.list("acme", "web");
		expect(done).toMatchObject({
			number: 7,
			status: "posted",
			commentUrl: "https://github.com/acme/web/pull/7#c1",
		});
		expect(audited).toEqual(["review.posted"]);
		// The same commit is not reviewed again.
		await reviews.tick();
		await Bun.sleep(30);
		expect(prompts).toHaveLength(1);
	});

	it("is reviewed again by hand, and says why when there is no review to post", async () => {
		const { reviews, posted } = setup(
			[{ number: 3, title: "Tidy", updated_at: "2020-01-01T00:00:00Z", head: { sha: "c0ffee" } }],
			"",
		);
		await expect(reviews.reviewNow(admin, "web", 3)).rejects.toThrow("Set up reviews");
		reviews.save(admin, "web", { enabled: false, provider: "fake" });
		const review = await reviews.reviewNow(member, "web", 3);
		expect(review).toMatchObject({
			status: "failed",
			error: "The agent wrote no review",
			manual: true,
		});
		expect(posted).toHaveLength(0);
	});

	it("is set up by owners and admins, and asked for by people who may start agents", async () => {
		const { reviews } = setup([
			{ number: 4, title: "Docs", updated_at: "2020-01-01T00:00:00Z", head: { sha: "d0c5" } },
		]);
		const call = async (who: Who, method: string, path: string, body?: unknown) => {
			const url = new URL(`http://runner${path}`);
			const response = await reviewRequest(
				new Request(url.href, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
				url,
				who,
				reviews,
			);
			if (!response) throw new Error("not a reviews request");
			return response;
		};
		expect(
			(
				await call(member, "PUT", "/reviews/settings", {
					project: "web",
					enabled: true,
					provider: "fake",
				})
			).status,
		).toBe(403);
		expect(
			(
				await call(admin, "PUT", "/reviews/settings", {
					project: "web",
					enabled: true,
					provider: "nope",
				})
			).status,
		).toBe(400);
		expect(
			(
				await call(admin, "PUT", "/reviews/settings", {
					project: "web",
					enabled: true,
					provider: "fake",
				})
			).status,
		).toBe(200);
		const viewer: Who = { userId: "vi", workspace: "acme", role: "viewer" };
		expect((await call(viewer, "POST", "/reviews/run", { project: "web", number: 4 })).status).toBe(
			403,
		);
		expect((await call(member, "POST", "/reviews/run", { project: "web", number: 4 })).status).toBe(
			202,
		);
		await until(() => reviews.list("acme", "web")[0]?.status === "posted");
		const seen = (await (await call(member, "GET", "/reviews?project=web")).json()) as {
			data: { settings: { enabled: boolean }; reviews: unknown[]; canManage: boolean };
		};
		expect(seen.data).toMatchObject({ settings: { enabled: true }, canManage: false });
		expect(seen.data.reviews).toHaveLength(1);
	});
});
