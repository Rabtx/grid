import { describe, expect, it } from "bun:test";

import type { ChatEvent } from "../agents/events";
import type { InboxDraft } from "../inbox/store";
import { RoleStore } from "../roles/store";
import { teammateBrief } from "./brief";
import { rememberTool } from "./routes";
import { TeammateStore } from "./store";
import { TeammateWork } from "./work";

const who = { userId: "u1", workspace: "w1" };
const card = (number: number) => ({
	number,
	key: `GRID-${number}`,
	title: `Card ${number}`,
	description: "Make it better",
});

/** A chat that answers every turn at once, or as `outcome` says; and remembers what it was told. */
function fakeChat(outcome: () => "done" | "error" = () => "done") {
	let next = 0;
	const prompts: { id: string; text: string }[] = [];
	const ends = new Map<string, Extract<ChatEvent, { type: "turn_end" }>>();
	const gates: (() => void)[] = [];
	let hold = false;
	return {
		prompts,
		hold: (on: boolean) => {
			hold = on;
			if (!on) for (const open of gates.splice(0)) open();
		},
		chat: {
			createAutomation: async (_who: unknown, input: { base?: string }) => {
				next++;
				return {
					id: `s${next}`,
					cwd: "/tmp",
					worktree: { branch: input.base ? `${input.base}-review` : `grid/s${next}` },
				} as never;
			},
			prompt: async (_workspace: string, id: string, text: string) => {
				prompts.push({ id, text });
				if (hold) await new Promise<void>((resolve) => gates.push(resolve));
				const reason = outcome();
				ends.set(id, {
					type: "turn_end",
					reason,
					...(reason === "error" ? { error: "The agent fell over" } : {}),
				} as never);
			},
			turnOutcome: (_workspace: string, id: string) => ends.get(id) ?? null,
			cancel: () => {},
			rename: () => {},
			events: () => [] as ChatEvent[],
		},
	};
}

function setup(outcome?: () => "done" | "error") {
	const roles = new RoleStore(":memory:");
	const store = new TeammateStore(":memory:");
	const inbox: InboxDraft[] = [];
	const moves: string[] = [];
	const fake = fakeChat(outcome);
	const work = new TeammateWork({
		chat: fake.chat,
		roles,
		store,
		inbox: { keep: (item) => inbox.push(item) },
		board: async (_owner, _workspace, _project, number, status) => {
			moves.push(`${number}:${status}`);
		},
	});
	const mate = (name: string, extra: Record<string, unknown> = {}) =>
		roles.create("w1", { name, icon: "code", brief: "", provider: "claude", ...extra });
	return { roles, store, inbox, moves, fake, work, mate };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("a teammate on a card", () => {
	it("writes a plan, waits for approval, then does the card and sends it to review", async () => {
		const { work, mate, store, inbox, moves, fake } = setup();
		const riley = mate("Riley");
		const run = work.start(who, riley?.id ?? "", "grid", card(12));
		await settle();
		expect(store.run(run.id)?.state).toBe("plan_ready");
		expect(fake.prompts[0]?.text).toContain("First write your plan");
		expect(fake.prompts[0]?.text).toContain("GRID-12: Card 12");
		expect(inbox.at(-1)?.body).toBe("Its plan is ready for you to approve");
		expect(moves).toEqual(["12:in_progress"]);

		work.approve("w1", run.id, "Keep it small");
		await settle();
		expect(fake.prompts[1]?.text).toContain("A note from the team: Keep it small");
		expect(store.run(run.id)?.state).toBe("review");
		expect(moves).toEqual(["12:in_progress", "12:review"]);
		// Given again once it is done, the card starts a new run.
		expect(work.start(who, riley?.id ?? "", "grid", card(12)).id).not.toBe(run.id);
	});

	it("goes straight to work without a plan, and hands a finished card to the next teammate", async () => {
		const { work, mate, store, moves } = setup();
		const sam = mate("Sam", { planFirst: false });
		const riley = mate("Riley", { planFirst: false, handoffTo: sam?.id });
		const run = work.start(who, riley?.id ?? "", "grid", card(3));
		await settle();
		expect(store.run(run.id)?.state).toBe("review");
		const relay = store.runs("w1", { teammateId: sam?.id });
		expect(relay).toHaveLength(1);
		expect(relay[0]?.fromRun).toBe(run.id);
		expect(relay[0]?.taskBody).toContain(
			`Riley finished this card on branch ${store.run(run.id)?.branch}`,
		);
		expect(relay[0]?.state).toBe("review");
		// Reviewed on top of the builder's branch; only the last one moves the card to review.
		expect(relay[0]?.branch).toBe(`${store.run(run.id)?.branch}-review`);
		expect(moves.filter((move) => move.endsWith("review"))).toEqual(["3:review"]);
	});

	it("works on as many cards as it may at once, and starts the next when one ends", async () => {
		const { work, mate, store, fake } = setup();
		const riley = mate("Riley", { planFirst: false, parallel: 1 });
		fake.hold(true);
		const first = work.start(who, riley?.id ?? "", "grid", card(1));
		const second = work.start(who, riley?.id ?? "", "grid", card(2));
		await settle();
		expect(store.run(first.id)?.state).toBe("working");
		expect(store.run(second.id)?.state).toBe("queued");
		fake.hold(false);
		await settle();
		await settle();
		expect(store.run(first.id)?.state).toBe("review");
		expect(store.run(second.id)?.state).toBe("review");
	});

	it("waits for a person when a turn fails, and carries on in its thread on retry", async () => {
		let fail = true;
		const { work, mate, store, inbox, fake } = setup(() => (fail ? "error" : "done"));
		const riley = mate("Riley", { planFirst: false });
		const run = work.start(who, riley?.id ?? "", "grid", card(5));
		await settle();
		expect(store.run(run.id)).toMatchObject({ state: "needs_you", error: "The agent fell over" });
		expect(inbox.at(-1)?.kind).toBe("turn_error");
		fail = false;
		work.retry("w1", run.id);
		await settle();
		expect(fake.prompts.at(-1)?.text).toContain("Carry on with GRID-5");
		expect(store.run(run.id)?.state).toBe("review");
	});

	it("stops where it is, and keeps a stopped card stopped when its turn ends", async () => {
		const { work, mate, store, fake } = setup();
		const riley = mate("Riley", { planFirst: false });
		fake.hold(true);
		const run = work.start(who, riley?.id ?? "", "grid", card(7));
		await settle();
		work.stop("w1", run.id);
		fake.hold(false);
		await settle();
		expect(store.run(run.id)?.state).toBe("stopped");
		expect(() => work.approve("w1", run.id)).toThrow("no plan waiting");
	});

	it("keeps a scorecard of what it finished and what it got stuck on", async () => {
		let fail = false;
		const { work, mate } = setup(() => (fail ? "error" : "done"));
		const riley = mate("Riley", { planFirst: false, parallel: 2 });
		work.start(who, riley?.id ?? "", "grid", card(1));
		await settle();
		fail = true;
		work.start(who, riley?.id ?? "", "grid", card(2));
		await settle();
		const [stats] = work.stats("w1");
		expect(stats).toMatchObject({ finished: 1, stuck: 1, successRate: 0.5, active: 0 });
	});
});

describe("what a teammate learns", () => {
	it("proposes a lesson from its thread, kept once a person approves it, then in its brief", () => {
		const { store, roles, inbox, mate } = setup();
		const riley = mate("Riley", { specialty: "Frontend engineer" });
		const tool = rememberTool({ store, roles, inbox: { keep: (item) => inbox.push(item) } });
		const session = {
			id: "s1",
			workspaceId: "w1",
			ownerId: "u1",
			project: "grid",
			role: { id: riley?.id ?? "", name: "Riley", icon: "code", brief: "" },
		} as never;
		expect(tool.offered?.(session)).toBe(true);
		expect(tool.run(session, { lesson: "Use Badge, not rounded-pill" })).toContain("Proposed");
		expect(inbox.at(-1)).toMatchObject({ kind: "teammate", title: "Riley wants to remember" });
		const [lesson] = store.proposed("w1");
		expect(
			teammateBrief(riley as never, { skills: "", lessons: store.lessons("w1", riley?.id ?? "") }),
		).not.toContain("Use Badge");
		store.updateLesson("w1", lesson?.id ?? "", { state: "kept" });
		const brief = teammateBrief(riley as never, {
			skills: "- Design system: tokens",
			lessons: store.lessons("w1", riley?.id ?? ""),
		});
		expect(brief).toContain("Your specialty: Frontend engineer.");
		expect(brief).toContain("- Use Badge, not rounded-pill");
		expect(brief).toContain("- Design system: tokens");
		// The same lesson twice is one lesson.
		expect(tool.run(session, { lesson: "use badge, not rounded-pill" })).toContain("already known");
	});
});
