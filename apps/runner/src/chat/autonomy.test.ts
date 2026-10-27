import { afterEach, describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";

import type { ChatEvent } from "../agents/events";
import type { AgentContext, AgentSession, Provider, TurnResult } from "../agents/provider";
import type { Gh, GhResult } from "../github/gh";
import type { Accounts } from "./accounts";
import { AutonomyStore } from "./autonomy-store";
import { limitResetsAt, turnErrorKind, turnRetryable } from "./errors";
import { goalVerdict, Goals } from "./goals";
import { ChatHub } from "./hub";
import { compactDelay, COMPACT_FROM_TOKENS, IdleCompaction } from "./idle-compaction";
import { LIMIT_RESUME_PROMPT, LimitResumes } from "./limit-resume";
import { MAX_COMMENT_WAKES, newsOf, PullWatches, type PullView, snapshotOf } from "./pull-watch";
import { ChatStore } from "./store";

/**
 * An agent whose every turn answers at once with what `reply` says (and, with `fail`, fails the
 * way it says), keeping each prompt it was sent.
 */
function agent(
	id = "claude",
	reply: (text: string, n: number) => { say?: string; fail?: string; hold?: boolean } = () => ({}),
) {
	const prompts: string[] = [];
	let finish: ((result: TurnResult) => void) | null = null;
	const provider: Provider = {
		info: () => ({ id, name: id.toUpperCase(), available: true, models: [], modes: [] }),
		start: async (context: AgentContext) => {
			context.onResumeToken(`${id}-1`);
			const session: AgentSession = {
				prompt: (text) =>
					new Promise<TurnResult>((resolve) => {
						prompts.push(text);
						const answer = reply(text, prompts.length);
						if (answer.say) context.emit({ type: "message", text: answer.say });
						if (answer.hold) {
							finish = resolve;
							return;
						}
						queueMicrotask(() =>
							resolve(answer.fail ? { reason: "error", error: answer.fail } : { reason: "done" }),
						);
					}),
				cancel: () => {
					finish?.({ reason: "cancelled" });
					finish = null;
				},
				approve: () => undefined,
				setModel: async () => undefined,
				setMode: async () => undefined,
				setEffort: async () => undefined,
				close: () => undefined,
			};
			return session;
		},
	};
	return { provider, prompts };
}

const who = { userId: "me", workspace: "me" };
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const step of cleanup.splice(0)) step();
});

function setup(fake: ReturnType<typeof agent>) {
	const store = new ChatStore(":memory:");
	const hub = new ChatHub(store, new Map([[fake.provider.info().id, fake.provider]]), tmpdir());
	const autonomy = new AutonomyStore(":memory:");
	cleanup.push(() => {
		hub.closeAll();
		autonomy.close();
	});
	const thread = hub.create(who, {
		project: "p",
		provider: fake.provider.info().id,
		cwd: tmpdir(),
	});
	return { store, hub, autonomy, thread };
}

async function until(check: () => boolean, ms = 2_000): Promise<void> {
	const end = Date.now() + ms;
	while (!check()) {
		if (Date.now() > end) throw new Error("timed out waiting");
		await Bun.sleep(5);
	}
}

const ofType = <T extends ChatEvent["type"]>(events: ChatEvent[], type: T) =>
	events.filter((event): event is Extract<ChatEvent, { type: T }> => event.type === type);

describe("usage limits (I)", () => {
	it("tell a used-up plan apart, and read when it resets", () => {
		const now = new Date("2026-10-27T10:00:00Z");
		expect(turnErrorKind("Claude AI usage limit reached|1761580800")).toBe("usage-limit");
		expect(turnErrorKind("You've hit your usage limit. Try again later.")).toBe("usage-limit");
		expect(turnErrorKind("5-hour limit reached ∙ resets 3pm")).toBe("usage-limit");
		expect(turnErrorKind("rate limited, please retry")).toBe("provider-busy");
		expect(turnRetryable("usage-limit")).toBe(false);
		expect(limitResetsAt("Claude AI usage limit reached|1793100000", now)?.toISOString()).toBe(
			"2026-10-27T11:20:00.000Z",
		);
		expect(
			limitResetsAt(
				"You've hit your usage limit. Try again at Oct 27th, 2026 4:12 PM UTC.",
				now,
			)?.toISOString(),
		).toBe("2026-10-27T16:12:00.000Z");
		expect(limitResetsAt("5-hour limit reached ∙ resets 3pm (UTC)", now)?.toISOString()).toBe(
			"2026-10-27T15:00:00.000Z",
		);
		// Already past today in that zone: tomorrow.
		expect(
			limitResetsAt("weekly limit reached ∙ resets 9am (Europe/Berlin)", now)?.toISOString(),
		).toBe("2026-10-28T08:00:00.000Z");
		expect(limitResetsAt("usage limit reached|1000000000", now)).toBeNull();
		expect(limitResetsAt("You've hit your usage limit.", now)).toBeNull();
	});

	it("carry a thread on once its limit resets, and only once for the same reset", async () => {
		let now = new Date("2026-10-27T10:00:00Z");
		const reset = Math.floor(Date.parse("2026-10-27T11:00:00Z") / 1000);
		const fake = agent("claude", (text) =>
			text.startsWith("Build") || text === LIMIT_RESUME_PROMPT
				? { fail: `Claude AI usage limit reached|${reset}` }
				: {},
		);
		const { store, hub, autonomy, thread } = setup(fake);
		const limits = new LimitResumes(hub, autonomy, { now: () => now });
		await hub.prompt("me", thread.id, "Build the page");
		const waits = () => ofType(store.events(thread.id), "limit_wait");
		expect(waits()[0]?.resetsAt).toBe("2026-10-27T11:01:00.000Z");
		expect(ofType(store.events(thread.id), "turn_end")[0]?.retryable).toBe(false);
		limits.tick();
		expect(fake.prompts).toHaveLength(1);
		now = new Date("2026-10-27T11:02:00Z");
		limits.tick();
		await until(() => fake.prompts.length === 2);
		expect(fake.prompts[1]).toBe(LIMIT_RESUME_PROMPT);
		expect(ofType(store.events(thread.id), "user")[1]?.origin).toEqual({
			kind: "grid",
			reason: "limit",
		});
		expect(waits()[1]).toMatchObject({ ended: "resumed" });
		// It failed again on the same reset: that is left for the person, not waited for again.
		await until(() => !hub.isRunning(thread.id));
		expect(autonomy.limitResume(thread.id)).toBeNull();
		expect(waits()).toHaveLength(2);
	});

	it("drop the wait when the person carries on themselves, and use the account's reset", async () => {
		const now = new Date();
		const fake = agent("claude", (text) =>
			text.startsWith("Build") ? { fail: "You've hit your usage limit." } : {},
		);
		const { store, hub, autonomy, thread } = setup(fake);
		const resetsAt = new Date(now.getTime() + 3_600_000).toISOString();
		const accounts = {
			usage: () => [
				{
					provider: "claude",
					account: null,
					updatedAt: now.toISOString(),
					limits: [{ window: "5h", usedPercent: 100, resetsAt, limited: true }],
				},
			],
		} as unknown as Accounts;
		new LimitResumes(hub, autonomy, { accounts });
		await hub.prompt("me", thread.id, "Build the page");
		expect(autonomy.limitResume(thread.id)?.resumeAt).toBe(
			new Date(Date.parse(resetsAt) + 60_000).toISOString(),
		);
		await hub.prompt("me", thread.id, "Never mind, do this instead");
		expect(autonomy.limitResume(thread.id)).toBeNull();
		expect(ofType(store.events(thread.id), "limit_wait").at(-1)).toMatchObject({
			ended: "cancelled",
		});
	});
});

describe("goals (K)", () => {
	it("keep the agent working until it says the goal is met", async () => {
		const fake = agent("claude", (_text, n) =>
			n === 3 ? { say: "GOAL MET\nAll 12 tests pass (bun test)." } : { say: `step ${n}` },
		);
		const { store, hub, autonomy, thread } = setup(fake);
		const goals = new Goals(hub, autonomy);
		goals.set("me", thread.id, "all tests pass");
		await until(() => autonomy.goal(thread.id)?.status === "met");
		expect(fake.prompts).toHaveLength(3);
		expect(fake.prompts[0]).toContain("The person set a goal for this thread: all tests pass");
		expect(fake.prompts[1]).toContain("This is turn 2 of at most 20");
		const events = ofType(store.events(thread.id), "goal");
		expect(events.at(-1)).toMatchObject({
			status: "met",
			turns: 3,
			note: "All 12 tests pass (bun test).",
		});
		expect(ofType(store.events(thread.id), "user")[0]?.origin).toEqual({
			kind: "grid",
			reason: "goal",
		});
		expect(goalVerdict("Not yet. GOAL MET later")).toBeNull();
		expect(goalVerdict("**GOAL BLOCKED** need a key")).toBe("blocked");
	});

	it("stop at the turn limit, when blocked, and when the person stops it", async () => {
		const fake = agent("claude", () => ({ say: "still going" }));
		const { hub, autonomy, thread } = setup(fake);
		const goals = new Goals(hub, autonomy);
		goals.set("me", thread.id, "ship it", 2);
		await until(() => autonomy.goal(thread.id)?.status === "paused");
		expect(fake.prompts).toHaveLength(2);
		goals.act("me", thread.id, "resume");
		await until(() => fake.prompts.length === 4 && !hub.isRunning(thread.id));
		expect(autonomy.goal(thread.id)).toMatchObject({ status: "paused", maxTurns: 4 });
		goals.act("me", thread.id, "clear");
		expect(goals.get("me", thread.id)).toBeNull();

		const slow = agent("claude", () => ({ hold: true }));
		const other = setup(slow);
		const otherGoals = new Goals(other.hub, other.autonomy);
		otherGoals.set("me", other.thread.id, "refactor");
		await until(() => slow.prompts.length === 1);
		other.hub.cancel("me", other.thread.id, true);
		await until(() => !other.hub.isRunning(other.thread.id));
		expect(other.autonomy.goal(other.thread.id)?.status).toBe("paused");
		expect(slow.prompts).toHaveLength(1);
	});

	it("start with the goal's first message when it was set during a turn", async () => {
		let release: () => void = () => undefined;
		const fake = agent("claude", (text) => {
			if (text === "Explore") {
				return { hold: true };
			}
			return text.startsWith("[Goal]")
				? { say: "GOAL BLOCKED I need the API key" }
				: { say: "on it" };
		});
		const { hub, autonomy, thread } = setup(fake);
		const goals = new Goals(hub, autonomy);
		void hub.prompt("me", thread.id, "Explore");
		await until(() => fake.prompts.length === 1);
		goals.set("me", thread.id, "deploy");
		expect(fake.prompts).toHaveLength(1);
		release = () => hub.cancel("me", thread.id);
		release();
		// A stop by Grid (not the person) leaves the goal; the person's next turn ends and it starts.
		await until(() => !hub.isRunning(thread.id));
		await hub.prompt("me", thread.id, "ok go");
		await until(() => autonomy.goal(thread.id)?.status === "blocked");
		expect(
			fake.prompts.some((text) => text.includes("The person set a goal for this thread: deploy")),
		).toBe(true);
		expect(autonomy.goal(thread.id)?.turns).toBe(1);
	});
});

/**
 * `gh api` answering GitHub's REST routes for one pull request, from a `PullView` the test sets
 * (or failing with what it says), and `api user` with "me".
 */
function fakeGh() {
	let view: PullView | { fail: string } = {
		number: 7,
		title: "Add login",
		url: "https://github.com/o/r/pull/7",
		state: "OPEN",
		mergeable: "MERGEABLE",
		headRefOid: "a1",
		statusCheckRollup: [{ name: "test", status: "IN_PROGRESS", conclusion: null }],
		reviews: [],
		comments: [],
	};
	let calls = 0;
	const ndjson = (items: unknown[]) => items.map((item) => JSON.stringify(item)).join("\n");
	const gh: Gh = {
		run: async (args): Promise<GhResult> => {
			if (args[1] === "user") return { code: 0, stdout: "me\n", stderr: "" };
			calls++;
			if ("fail" in view) return { code: 1, stdout: "", stderr: view.fail };
			const path = args.find((arg) => arg.startsWith("repos/")) ?? "";
			const pull = view;
			const checks = pull.statusCheckRollup ?? [];
			let out: string;
			if (/\/pulls\/\d+$/.test(path))
				out = JSON.stringify({
					number: pull.number,
					title: pull.title,
					html_url: pull.url,
					state: pull.state === "OPEN" ? "open" : "closed",
					merged: pull.state === "MERGED",
					mergeable_state: pull.mergeable === "CONFLICTING" ? "dirty" : "clean",
					head: { sha: pull.headRefOid },
				});
			else if (path.includes("/check-runs"))
				out = ndjson(
					checks
						.filter((check) => check.name)
						.map((check) => ({
							name: check.name,
							status: check.status?.toLowerCase(),
							conclusion: check.conclusion?.toLowerCase() ?? null,
						})),
				);
			else if (path.endsWith("/status?per_page=100"))
				out = ndjson(
					checks
						.filter((check) => check.context)
						.map((check) => ({ context: check.context, state: check.state?.toLowerCase() })),
				);
			else if (path.includes("/reviews"))
				out = ndjson(
					(pull.reviews ?? []).map((review) => ({
						id: review.id,
						user: { login: review.author?.login },
						state: review.state,
						body: review.body,
					})),
				);
			else
				out = ndjson(
					(pull.comments ?? []).map((comment) => ({
						id: comment.id,
						user: { login: comment.author?.login },
						body: comment.body,
					})),
				);
			return { code: 0, stdout: out, stderr: "" };
		},
		spawn: () => {
			throw new Error("not used");
		},
	};
	return {
		gh,
		calls: () => calls,
		set: (next: Partial<PullView> | { fail: string }) => {
			view = "fail" in next ? next : ({ ...("fail" in view ? {} : view), ...next } as PullView);
		},
	};
}

describe("pull request watches (J)", () => {
	it("say what changed: failed checks, all passed, a conflict, others' remarks", () => {
		const base: PullView = {
			number: 1,
			title: "t",
			url: "u",
			state: "OPEN",
			mergeable: "MERGEABLE",
			headRefOid: "a",
			statusCheckRollup: [{ name: "test", status: "IN_PROGRESS" }],
		};
		const before = snapshotOf(base, "me");
		const failed: PullView = {
			...base,
			statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "FAILURE" }],
		};
		expect(newsOf(failed, before, snapshotOf(failed, "me"), "me").lines).toEqual([
			"Checks failed: test.",
		]);
		const green: PullView = {
			...base,
			headRefOid: "b",
			mergeable: "CONFLICTING",
			statusCheckRollup: [
				{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" },
				{ context: "ci/x", state: "SUCCESS" },
			],
			comments: [
				{ id: "c1", author: { login: "ana" }, body: "Please rename this" },
				{ id: "c2", author: { login: "me" }, body: "done" },
			],
			reviews: [{ id: "r1", author: { login: "bo" }, state: "CHANGES_REQUESTED", body: "" }],
		};
		const news = newsOf(green, snapshotOf(failed, "me"), snapshotOf(green, "me"), "me");
		expect(news.lines).toEqual([
			"Every check has passed.",
			"The branch now conflicts with its base.",
			"bo reviewed (changes requested).",
			"ana commented: Please rename this",
		]);
		expect(news.commentsOnly).toBe(false);
		const merged = { ...green, state: "MERGED" };
		expect(newsOf(merged, before, snapshotOf(merged, "me"), "me")).toMatchObject({ ended: true });
	});

	it("wake the agent with news, end on merge, and keep quiet otherwise", async () => {
		const fake = agent();
		const { store, hub, autonomy, thread } = setup(fake);
		const github = fakeGh();
		hub.setGridTools(() => "http://runner");
		const key = (hub as unknown as { tools: { key: string } }).tools.key;
		const pulls = new PullWatches(hub, autonomy, github.gh, {
			remoteOf: () => "git@github.com:o/r.git",
		});
		void hub.prompt("me", thread.id, "Open the pull request");
		expect(await hub.callTool(key, thread.id, "watch_pull_request", { number: 7 })).toContain(
			"Watching o/r#7",
		);
		await until(() => !hub.isRunning(thread.id));
		await pulls.tick();
		expect(fake.prompts).toHaveLength(1);
		github.set({
			statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "FAILURE" }],
		});
		await pulls.tick();
		await until(() => fake.prompts.length === 2);
		expect(fake.prompts[1]).toContain(
			"[Pull request #7 in o/r: Add login]\n- Checks failed: test.",
		);
		expect(ofType(store.events(thread.id), "user")[1]?.origin).toEqual({
			kind: "grid",
			reason: "pull",
		});
		await until(() => !hub.isRunning(thread.id));
		await pulls.tick();
		expect(fake.prompts).toHaveLength(2);
		github.set({ state: "MERGED" });
		await pulls.tick();
		await until(() => fake.prompts.length === 3);
		expect(fake.prompts[2]).toContain("It was merged.");
		expect(autonomy.pullWatches(thread.id)).toEqual([]);
	});

	it("give up after comments alone wake it too often, or reads keep failing; stop with the person", async () => {
		const fake = agent();
		const { hub, autonomy, thread } = setup(fake);
		const github = fakeGh();
		hub.setGridTools(() => "http://runner");
		const key = (hub as unknown as { tools: { key: string } }).tools.key;
		const pulls = new PullWatches(hub, autonomy, github.gh, {
			remoteOf: () => "https://github.com/o/r",
		});
		void hub.prompt("me", thread.id, "Watch it");
		await hub.callTool(key, thread.id, "watch_pull_request", { number: 7 });
		await until(() => !hub.isRunning(thread.id));
		for (let n = 1; n <= MAX_COMMENT_WAKES; n++) {
			github.set({
				comments: Array.from({ length: n }, (_, i) => ({
					id: `c${i}`,
					author: { login: "ana" },
					body: `nit ${i}`,
				})),
			});
			await pulls.tick();
			await until(() => !hub.isRunning(thread.id));
		}
		expect(autonomy.pullWatches(thread.id)).toEqual([]);
		expect(fake.prompts.at(-1)).toContain(
			`after ${MAX_COMMENT_WAKES} wakes in a row with only comments`,
		);

		await hub.callTool(key, thread.id, "watch_pull_request", { number: 7 });
		github.set({ fail: "HTTP 502" });
		for (let n = 0; n < 8; n++) await pulls.tick();
		await until(() => fake.prompts.at(-1)?.includes("8 reads in a row failed") === true);
		expect(autonomy.pullWatches(thread.id)).toEqual([]);

		github.set({
			number: 7,
			title: "Add login",
			url: "u",
			state: "OPEN",
			headRefOid: "a1",
			statusCheckRollup: [],
		} as PullView);
		await hub.callTool(key, thread.id, "watch_pull_request", { number: 7 });
		hub.cancel("me", thread.id, true);
		expect(autonomy.pullWatches(thread.id)).toEqual([]);
	});
});

describe("idle compaction (L)", () => {
	it("waits until just before the cache expires, and only for large conversations", () => {
		expect(compactDelay(null, false)).toBeNull();
		expect(compactDelay({ type: "usage", contextUsed: COMPACT_FROM_TOKENS - 1 }, false)).toBeNull();
		expect(compactDelay({ type: "usage", contextUsed: 120_000 }, false)).toBe(60 * 60_000 - 90_000);
		expect(compactDelay({ type: "usage", contextUsed: 120_000 }, true)).toBe(5 * 60_000 - 90_000);
	});

	it("schedules a compaction for an idle Claude Code thread in a project that asks for it", async () => {
		let big = true;
		const fake = agent("claude");
		const { hub, thread, store } = setup(fake);
		let enabled = true;
		const idle = new IdleCompaction(hub, { enabled: () => enabled, apiKey: () => false });
		cleanup.push(() => idle.stop());
		const turn = async (text: string) => {
			void hub.prompt("me", thread.id, text);
			await until(() => hub.isRunning(thread.id));
			store.append(thread.id, [{ type: "usage", contextUsed: big ? 150_000 : 2_000 }]);
			await until(() => !hub.isRunning(thread.id));
		};
		await turn("Read the codebase");
		expect(idle.waiting(thread.id)).toBe(true);
		big = false;
		await turn("Small follow-up");
		expect(idle.waiting(thread.id)).toBe(false);
		big = true;
		enabled = false;
		await turn("Another");
		expect(idle.waiting(thread.id)).toBe(false);
	});

	it("sets waiting compactions again after a restart, from when each thread's turn ended", async () => {
		const fake = agent("claude");
		const { hub, thread, store } = setup(fake);
		void hub.prompt("me", thread.id, "Read the codebase");
		await until(() => hub.isRunning(thread.id));
		store.append(thread.id, [{ type: "usage", contextUsed: 150_000 }]);
		await until(() => !hub.isRunning(thread.id));
		// As after a restart: a compaction that knows nothing yet.
		const idle = new IdleCompaction(hub, { enabled: () => true, apiKey: () => false });
		cleanup.push(() => idle.stop());
		expect(idle.waiting(thread.id)).toBe(false);
		expect(idle.resume()).toBe(1);
		expect(idle.waiting(thread.id)).toBe(true);
		idle.stop();
		// Long after the turn ended, the cache has expired: nothing to gain.
		expect(idle.resume(Date.now() + 59 * 60_000)).toBe(0);
	});
});
