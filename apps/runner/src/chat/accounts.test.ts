import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Accounts } from "./accounts";

const roots: string[] = [];
const opened: Accounts[] = [];
afterEach(() => {
	for (const accounts of opened.splice(0)) accounts.close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(now = () => new Date("2026-10-24T10:00:00.000Z")) {
	const root = mkdtempSync(join(tmpdir(), "grid-accounts-"));
	roots.push(root);
	const accounts = new Accounts(":memory:", root, now);
	opened.push(accounts);
	return { accounts, root };
}

describe("provider accounts", () => {
	it("give each account its own folder, and point the agent at it", () => {
		const { accounts, root } = setup();
		const work = accounts.create("me", "claude", "Work plan");
		const dir = join(root, "claude", work.id);
		expect(existsSync(dir)).toBe(true);
		expect(accounts.env("me", "claude", work.id)).toEqual({ CLAUDE_CONFIG_DIR: dir });
		// Someone else's account, another agent's, or none: the machine's own sign-in.
		expect(accounts.env("you", "claude", work.id)).toEqual({});
		expect(accounts.env("me", "codex", work.id)).toEqual({});
		expect(accounts.env("me", "claude", null)).toEqual({});
		expect(accounts.signInCommand("me", work.id)).toBe(
			`CLAUDE_CONFIG_DIR='${dir}' claude auth login`,
		);
		expect(() => accounts.create("me", "opencode", "x")).toThrow("cannot run as another account");

		accounts.remove("me", work.id);
		expect(existsSync(dir)).toBe(false);
		expect(accounts.list("me")).toEqual([]);
	});

	it("keep what each account used, window by window, and clear a window once it resets", () => {
		let now = new Date("2026-10-24T10:00:00.000Z");
		const { accounts } = setup(() => now);
		accounts.recordUsage("me", "codex", null, [
			{ window: "5h", usedPercent: 30, resetsAt: "2026-10-24T12:00:00.000Z", limited: false },
		]);
		accounts.recordUsage("me", "codex", null, [
			{ window: "Weekly", usedPercent: 60, resetsAt: null, limited: false },
		]);
		expect(accounts.usage("me")[0]?.limits.map((limit) => limit.usedPercent)).toEqual([30, 60]);
		now = new Date("2026-10-24T13:00:00.000Z");
		expect(accounts.usage("me")[0]?.limits[0]).toEqual({
			window: "5h",
			usedPercent: 0,
			resetsAt: null,
			limited: false,
		});
		expect(accounts.usage("you")).toEqual([]);
	});
});

describe("threads on an account", () => {
	it("start the agent pointed at the account and keep what it reports", async () => {
		const { ChatHub } = await import("./hub");
		const { ChatStore } = await import("./store");
		const { accounts, root } = setup();
		const started: Record<string, string>[] = [];
		const provider = {
			info: () => ({ id: "claude", name: "Claude", available: true, models: [], modes: [] }),
			start: async (ctx: import("../agents/provider").AgentContext) => {
				started.push(ctx.env ?? {});
				ctx.onRateLimits?.([{ window: "5h", usedPercent: 12, resetsAt: null, limited: false }]);
				return {
					prompt: async () => ({ reason: "done" as const }),
					cancel: () => undefined,
					approve: () => undefined,
					setModel: async () => undefined,
					setMode: async () => undefined,
					setEffort: async () => undefined,
					close: () => undefined,
				};
			},
		};
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["claude", provider]]), tmpdir());
		hub.setAccounts(accounts);
		hub.linkProjectFolder("me", "alpha", tmpdir());
		const who = { userId: "me", workspace: "me" };
		const work = accounts.create("me", "claude", "Work");
		expect(() =>
			hub.create(who, { project: "alpha", provider: "claude", cwd: tmpdir(), account: "nope" }),
		).toThrow("not one of yours");
		const thread = hub.create(who, {
			project: "alpha",
			provider: "claude",
			cwd: tmpdir(),
			account: work.id,
		});
		expect(thread.account).toBe(work.id);
		await hub.prompt("me", thread.id, "hello");
		expect(started[0]?.CLAUDE_CONFIG_DIR).toBe(join(root, "claude", work.id));
		expect(accounts.usage("me")).toMatchObject([{ provider: "claude", account: work.id }]);
	});
});
