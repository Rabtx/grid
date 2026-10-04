import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { ConnectionStore } from "../connectors/store";
import type { Gh } from "../github/gh";
import { parseReading, readingPrompt } from "./reading";
import { lastAnswer, Pulse } from "./service";
import { byAgent, median, shipping } from "./shipping";
import { PulseStore } from "./store";

const dir = mkdtempSync(join(tmpdir(), "grid-pulse-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A project folder whose origin is on GitHub. */
function repo(name: string, remote: string): string {
	const folder = join(dir, name);
	mkdirSync(join(folder, ".git"), { recursive: true });
	writeFileSync(join(folder, ".git", "config"), `[remote "origin"]\n\turl = ${remote}\n`);
	return folder;
}

function fakeGh(pulls: unknown[], deploys = 3): Gh & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		run: async (args) => {
			calls.push(args);
			if (args[0] === "pr") return { code: 0, stdout: JSON.stringify(pulls), stderr: "" };
			return { code: 0, stdout: String(deploys), stderr: "" };
		},
		spawn: () => {
			throw new Error("not used");
		},
	};
}

const pull = (n: number, branch: string, hours: number, author = "ana") => ({
	number: n,
	createdAt: "2026-10-01T00:00:00Z",
	mergedAt: new Date(Date.parse("2026-10-01T00:00:00Z") + hours * 3_600_000).toISOString(),
	headRefName: branch,
	author: { login: author },
});

describe("shipping", () => {
	it("counts deploys and merges, the median lead time, and who merged them", async () => {
		const gh = fakeGh([
			pull(1, "grid/chat-1", 2),
			pull(2, "fix-eta", 6),
			pull(3, "worked-on", 10),
			pull(4, "deps", 4, "dependabot[bot]"),
		]);
		const result = await shipping(
			gh,
			{
				grid: repo("grid", "git@github.com:rabtx/grid.git"),
				site: repo("site", "https://github.com/rabtx/grid"),
			},
			() => new Set(["worked-on"]),
			new Date("2026-09-04T00:00:00Z"),
		);
		// One repository though two projects point at it.
		expect(result.repositories).toBe(1);
		expect(result.merged).toBe(4);
		expect(result.byAgents).toBe(3);
		expect(result.byPeople).toBe(1);
		expect(result.deploys).toBe(3);
		expect(result.leadTimeHours).toBe(5);
		expect(gh.calls[0]).toContain("merged:>=2026-09-04");
	});

	it("tells agents' pull requests from people's", () => {
		expect(byAgent(pull(1, "grid/chat-9", 1), new Set())).toBe(true);
		expect(byAgent(pull(1, "feature", 1, "renovate[bot]"), new Set())).toBe(true);
		expect(byAgent(pull(1, "feature", 1), new Set())).toBe(false);
		expect(byAgent(pull(1, "agent/web/pulse", 1), new Set())).toBe(true);
		expect(
			byAgent(
				{
					...pull(1, "fix-eta", 1),
					body: "Fixes it.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
				},
				new Set(),
			),
		).toBe(true);
		expect(median([3, 1, 2])).toBe(2);
		expect(median([])).toBeNull();
	});
});

describe("reading", () => {
	it("asks only for what is connected", () => {
		const prompt = readingPrompt({ stripe: true, posthog: false, sentry: false }, 30);
		expect(prompt).toContain('"mrr"');
		expect(prompt).not.toContain('"activeUsers"');
		expect(prompt).toContain("Use only tools that read");
	});

	it("keeps only well-formed numbers from an agent's answer", () => {
		const reading = parseReading(
			'Here you go.\n```json\n{"mrr":{"value":4820,"currency":"usd","change":12,"series":[1,2,"x",3]},"activeUsers":{"value":"lots"},"insights":[{"title":"Signups up 22%","detail":"PostHog","source":"PostHog","tone":"good"},{"title":""}],"missing":{"activeUsers":"No PostHog project"}}\n```',
		);
		expect(reading?.mrr).toEqual({ value: 4820, currency: "USD", change: 12, series: [1, 2, 3] });
		expect(reading?.activeUsers).toBeNull();
		expect(reading?.insights).toHaveLength(1);
		expect(reading?.missing.activeUsers).toBe("No PostHog project");
		expect(parseReading("I could not read anything.")).toBeNull();
	});

	it("takes the agent's last answer, after the last thing it was asked", () => {
		expect(
			lastAnswer([
				{ type: "user", text: "first" },
				{ type: "message", text: "old" },
				{ type: "user", text: "read" },
				{ type: "message", text: "a" },
				{ type: "tool" },
				{ type: "message", text: "b" },
			]),
		).toBe("ab");
	});
});

describe("Pulse", () => {
	it("reads the numbers with an agent in a thread of its own, and keeps the snapshot", async () => {
		let asked = "";
		const provider: Provider = {
			info: () => ({ id: "claude", name: "Claude Code", available: true, models: [], modes: [] }),
			start: async (context) => ({
				prompt: async (text) => {
					asked = text;
					context.emit({
						type: "message",
						text: '```json\n{"mrr":{"value":100,"currency":"USD","change":5,"series":[90,100]},"insights":[],"missing":{}}\n```',
					});
					return { reason: "done" };
				},
				cancel: () => {},
				approve: () => {},
				setModel: async () => {},
				setMode: async () => {},
				setEffort: async () => {},
				close: () => {},
			}),
		};
		const projects = join(dir, "projects");
		mkdirSync(join(projects, "alpha"), { recursive: true });
		const chatStore = new ChatStore(":memory:");
		const chat = new ChatHub(chatStore, new Map([["claude", provider]]), projects);
		chat.linkProjectFolder("w", "alpha", join(projects, "alpha"));
		const connections = new ConnectionStore(":memory:");
		connections.save({
			id: "s1",
			workspace: "w",
			kind: "stripe",
			name: "Stripe",
			transport: "http",
			url: "https://mcp.stripe.com",
			command: null,
			args: [],
			env: {},
			auth: "oauth",
			enabled: true,
			rules: {},
			agents: {},
			hiddenRepositories: [],
			tools: [],
			status: "healthy",
			statusDetail: null,
			checkedAt: null,
			expiresAt: null,
			createdBy: "u1",
			createdAt: new Date().toISOString(),
		});
		const store = new PulseStore(":memory:");
		const pulse = new Pulse({ chat, gh: fakeGh([]), connections, store });
		const who = { userId: "u1", workspace: "w", role: "owner" as const };

		expect(pulse.sources("w")).toEqual({ stripe: true, posthog: false, sentry: false });
		const snapshot = await pulse.refresh(who, 30);
		expect(asked).toContain('"mrr"');
		expect(snapshot.reading?.mrr?.value).toBe(100);
		expect(snapshot.agent).toBe("claude");
		expect(chat.list("w", "alpha").find((item) => item.id === snapshot.thread)?.title).toBe(
			"Pulse · the last 30 days",
		);
		const view = await pulse.view(who, 30);
		expect(view.snapshot?.reading?.mrr?.value).toBe(100);
		expect(view.reading).toBe(false);
		await expect(pulse.view(who, 14)).rejects.toThrow("7, 30 or 90");
	});
});
