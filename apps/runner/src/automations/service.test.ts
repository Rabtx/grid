import { describe, expect, test } from "bun:test";

import type { ChatHub } from "../chat/hub";
import { InboxStore } from "../inbox/store";
import { Automations } from "./service";
import { AutomationStore, type AutomationInput } from "./store";

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
	test("deduplicates GitHub items, skips overlap and caps concurrent runs", () => {
		const { store, service, created } = setup(true);
		const items = ["one", "two", "three"].map((name) =>
			store.create("alpha", "alice", { ...input(), name }),
		);
		service.event("alpha", "alice", "grid", "pull_opened", "42");
		service.event("alpha", "alice", "grid", "pull_opened", "42");
		expect(items.map((item) => store.runs("alpha", item.id).length)).toEqual([1, 1, 1]);
		expect(items.map((item) => store.runs("alpha", item.id)[0].status).sort()).toEqual([
			"running",
			"running",
			"skipped",
		]);
		service.runNow(who, items[0].id);
		expect(
			store
				.runs("alpha", items[0].id)
				.some((run) => run.trigger === "manual" && run.status === "skipped"),
		).toBe(true);
		expect(created()).toBe(2);
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
