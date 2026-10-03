import { describe, expect, test } from "bun:test";

import type { ChatEvent } from "../agents/events";
import type { ChatHub } from "../chat/hub";
import { InboxStore } from "../inbox/store";
import { Automations } from "./service";
import {
	AutomationStore,
	DEFAULT_OPTIONS,
	type AutomationInput,
	type AutomationOptions,
} from "./store";

const input = (
	triggers: AutomationInput["triggers"] = [{ kind: "event", event: "pull_opened" }],
): AutomationInput => ({
	name: "Review",
	prompt: "Review this change",
	provider: "test",
	model: null,
	effort: null,
	mode: null,
	project: "grid",
	workspaceMode: "folder",
	enabled: true,
	triggers,
});
const who = { userId: "alice", workspace: "alpha" };
function setup(pending = false) {
	const store = new AutomationStore(":memory:");
	const inbox = new InboxStore(":memory:");
	let created = 0;
	let finish: (() => void) | undefined;
	const chat = {
		createAutomation: async () => ({ id: `thread-${++created}` }),
		rename: () => {},
		prompt: () =>
			pending
				? new Promise<void>((resolve) => {
						finish = resolve;
					})
				: Promise.resolve(),
		turnOutcome: () => ({ type: "turn_end", reason: "done" }),
		events: () => [],
		cancel: () => {},
	} as unknown as ChatHub;
	const service = new Automations(store, chat, inbox);
	return { store, inbox, service, created: () => created, finish: () => finish?.() };
}

describe("automation runs", () => {
	test("run now creates an ordinary thread and stores the result", async () => {
		const { store, service, created } = setup();
		const item = store.create("alpha", "alice", input());
		const run = service.runNow(who, item.id);
		await Bun.sleep(1);
		expect(created()).toBe(1);
		expect(store.runs("alpha", item.id)[0]).toMatchObject({
			id: run.id,
			status: "succeeded",
			sessionId: "thread-1",
		});
		service.stop();
	});
	test("workspace and owner cannot run another person's job", () => {
		const { store, service } = setup();
		const item = store.create("alpha", "alice", input());
		expect(store.get("beta", item.id)).toBeNull();
		expect(() => service.runNow({ userId: "alice", workspace: "beta" }, item.id)).toThrow();
		expect(() => service.runNow({ userId: "bob", workspace: "alpha" }, item.id)).toThrow();
		service.stop();
	});
	test("GitHub refresh failures reach only affected event job owners", () => {
		const { store, inbox, service } = setup();
		store.create("alpha", "alice", input());
		store.create("alpha", "bob", input());
		store.create("alpha", "alice", {
			...input([{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "UTC" }]),
			project: "other",
		});
		service.eventError("alpha", "alice", "grid", "Repository is unavailable");
		expect(inbox.list("alpha", "alice").items).toMatchObject([
			{ kind: "turn_error", body: "GitHub refresh failed: Repository is unavailable" },
		]);
		expect(inbox.list("alpha", "bob").items).toHaveLength(0);
		service.stop();
	});
	test("deduplicates GitHub items and caps concurrent runs without losing the item", async () => {
		const { store, service, created, finish } = setup(true);
		const items = ["one", "two", "three"].map((name) =>
			store.create("alpha", "alice", { ...input(), name }),
		);
		service.event("alpha", "alice", "grid", "pull_opened", "42");
		service.event("alpha", "alice", "grid", "pull_opened", "42");
		// Two run; the third job waits for a free slot instead of burning the item on a skip.
		expect(items.map((item) => store.runs("alpha", item.id).length)).toEqual([1, 1, 0]);
		service.runNow(who, items[0].id);
		expect(
			store
				.runs("alpha", items[0].id)
				.some((run) => run.trigger === "manual" && run.status === "skipped"),
		).toBe(true);
		expect(created()).toBe(2);
		finish();
		await Bun.sleep(5);
		finish();
		await Bun.sleep(5);
		// The next refresh offers the same item again: the waiting job takes it, the others do not.
		service.event("alpha", "alice", "grid", "pull_opened", "42");
		expect(
			items.map((item) => store.runs("alpha", item.id).filter((run) => run.eventKey).length),
		).toEqual([1, 1, 1]);
		service.stop();
	});
	test("a pull request opened before the job was saved does not run it", () => {
		const { store, service } = setup();
		const item = store.create("alpha", "alice", input());
		const before = new Date(Date.parse(item.updatedAt) - 60_000).toISOString();
		const after = new Date(Date.parse(item.updatedAt) + 60_000).toISOString();
		service.event("alpha", "alice", "grid", "pull_opened", "7", before);
		expect(store.runs("alpha", item.id)).toHaveLength(0);
		service.event("alpha", "alice", "grid", "pull_opened", "8", after);
		expect(store.runs("alpha", item.id)).toHaveLength(1);
		service.stop();
	});
	test("failing checks on a new head run the job again", async () => {
		const { store, service } = setup();
		const item = store.create("alpha", "alice", input([{ kind: "event", event: "checks_failed" }]));
		service.event("alpha", "alice", "grid", "checks_failed", "12@aaa");
		await Bun.sleep(1);
		service.event("alpha", "alice", "grid", "checks_failed", "12@aaa");
		service.event("alpha", "alice", "grid", "checks_failed", "12@bbb");
		expect(store.runs("alpha", item.id)).toHaveLength(2);
		service.stop();
	});
	test("restart marks interrupted runs failed and puts them in the Inbox", () => {
		const { store, inbox, service } = setup(true);
		const item = store.create("alpha", "alice", input());
		service.runNow(who, item.id);
		service.stop();
		const restarted = new Automations(store, {} as ChatHub, inbox);
		expect(store.runs("alpha", item.id)[0].status).toBe("failed");
		expect(inbox.list("alpha", "alice").items[0].kind).toBe("turn_error");
		restarted.stop();
	});
	test("missed schedules beyond grace are recorded once and moved forward", () => {
		const { store, inbox, service } = setup();
		const item = store.create(
			"alpha",
			"alice",
			input([{ kind: "schedule", cadence: "hourly", minute: 0, timezone: "UTC" }]),
		);
		store.setNext(item.id, new Date(Date.now() - 3_600_000).toISOString());
		service.stop();
		const restarted = new Automations(store, {} as ChatHub, inbox);
		expect(store.runs("alpha", item.id)).toHaveLength(1);
		expect(store.runs("alpha", item.id)[0].status).toBe("skipped");
		expect(Date.parse(store.get("alpha", item.id)?.nextRunAt ?? "")).toBeGreaterThan(Date.now());
		restarted.stop();
	});
	test("recent missed schedule runs once after restart", async () => {
		const { store, inbox, service, created } = setup();
		const item = store.create(
			"alpha",
			"alice",
			input([{ kind: "schedule", cadence: "daily", time: "09:00", timezone: "UTC" }]),
		);
		store.setNext(item.id, new Date(Date.now() - 5 * 60_000).toISOString());
		service.stop();
		const restarted = new Automations(
			store,
			{
				createAutomation: async () => ({ id: "recovered-thread" }),
				rename: () => {},
				prompt: async () => {},
				turnOutcome: () => ({ type: "turn_end", reason: "done" }),
				events: () => [],
			} as unknown as ChatHub,
			inbox,
		);
		await Bun.sleep(1);
		expect(store.runs("alpha", item.id)).toHaveLength(1);
		expect(store.runs("alpha", item.id)[0].status).toBe("succeeded");
		expect(created()).toBe(0);
		restarted.stop();
	});
});

describe("automation recipes", () => {
	const recipe = (options: Partial<AutomationOptions>, events: ChatEvent[] = []) => {
		const store = new AutomationStore(":memory:");
		const inbox = new InboxStore(":memory:");
		const calls: { create?: unknown; prompt?: string } = {};
		const chat = {
			createAutomation: async (_who: unknown, input: unknown) => {
				calls.create = input;
				return { id: "thread", cwd: "/work/grid", worktree: { branch: "grid/chat-thread" } };
			},
			rename: () => {},
			prompt: async (_workspace: string, _id: string, text: string) => {
				calls.prompt = text;
			},
			turnOutcome: () => ({ type: "turn_end", reason: "done" }),
			events: () => events,
			cancel: () => {},
		} as unknown as ChatHub;
		const service = new Automations(store, chat, inbox, {
			roleOf: (_workspace, id) =>
				id === "reviewer" ? { id, name: "Reviewer", icon: "eye", brief: "Review" } : null,
			pullOf: async (_owner, _project, _workspace, branch) =>
				branch === "grid/chat-thread" ? 31 : null,
		});
		const item = store.create("alpha", "alice", {
			...input(),
			workspaceMode: "worktree",
			options: { ...DEFAULT_OPTIONS, ...options },
		});
		return { store, service, item, calls };
	};
	test("runs as its role from its branch and records the pull request it opened", async () => {
		const { store, service, item, calls } = recipe(
			{ role: "reviewer", branch: "main", pullRequest: true, waitForReview: true },
			[{ type: "message", text: "Opened a fix" }],
		);
		service.runNow(who, item.id);
		await Bun.sleep(5);
		expect(calls.create).toMatchObject({ worktree: true, base: "main", role: { id: "reviewer" } });
		expect(calls.prompt).toContain("gh pr create");
		expect(store.runs("alpha", item.id)[0]).toMatchObject({
			status: "succeeded",
			pullNumber: 31,
			summary: "Opened a fix",
		});
		service.stop();
	});
	test("a role that is gone fails the run before it starts", async () => {
		const { store, service, item, calls } = recipe({ role: "nobody" });
		service.runNow(who, item.id);
		await Bun.sleep(5);
		expect(calls.create).toBeUndefined();
		expect(store.runs("alpha", item.id)[0]).toMatchObject({
			status: "failed",
			error: "Its role is gone: choose another",
		});
		service.stop();
	});
	test("changing an off-limits path fails the run", async () => {
		const { store, service, item } = recipe({ offLimits: ["migrations/"] }, [
			{
				type: "tool",
				id: "edit",
				title: "Edit",
				status: "completed",
				diffs: [{ path: "/work/grid/migrations/1.sql", patch: "", added: 1, removed: 0 }],
			},
		]);
		service.runNow(who, item.id);
		await Bun.sleep(5);
		expect(store.runs("alpha", item.id)[0]).toMatchObject({
			status: "failed",
			error: "Changed migrations/1.sql, which is off-limits",
			steps: [{ title: "Edit", detail: null }],
		});
		service.stop();
	});
});
