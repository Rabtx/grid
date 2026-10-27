import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentSession, Provider } from "../agents/provider";
import type { Who } from "../auth";
import { ChatHub } from "../chat/hub";
import { ChatStore } from "../chat/store";
import { memoryBrief, ProjectMemory, wordsOf } from "./project-memory";
import { memoryRequest } from "./routes";
import { memoryTools } from "./tools";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const fn of cleanup.splice(0).reverse()) fn();
});

const agent = { kind: "agent" as const, id: "t1", name: "Claude Code" };

function kept(memory: ProjectMemory, text: string, kind = "fact", project = "web") {
	return memory.save({ workspaceId: "acme", project, kind, text, by: agent }).entry;
}

describe("project memory", () => {
	it("reads what text is about, file names and hyphenated words included", () => {
		expect([...wordsOf("Why does the auth.ts rate-limit fail?")]).toEqual(
			expect.arrayContaining(["auth.ts", "auth", "rate-limit", "rate", "limit", "fail"]),
		);
		expect(wordsOf("hi, can you do it?").size).toBe(0);
	});

	it("keeps each thing once, per project, and refuses what is not one", () => {
		const memory = new ProjectMemory(":memory:");
		const first = kept(memory, "Payments retry three times, then park the job.");
		const again = memory.save({
			workspaceId: "acme",
			project: "web",
			kind: "fact",
			text: "payments retry three times,  then park the job.",
			by: agent,
		});
		expect(again).toEqual({ entry: first, created: false });
		kept(memory, "Payments retry three times, then park the job.", "fact", "api");
		expect(memory.list("acme", "web")).toHaveLength(1);
		expect(() => kept(memory, "x", "rumour")).toThrow("kind is one of");
		expect(() => kept(memory, "  ")).toThrow("Say what to remember");
		expect(() => kept(memory, "y".repeat(1_001))).toThrow("under 1000");
	});

	it("starts a thread with what its first message is about, and counts each as used", () => {
		const memory = new ProjectMemory(":memory:");
		kept(memory, "We chose Postgres advisory locks over Redis for the job queue.", "decision");
		kept(memory, "Components are PascalCase files under src/kit.", "convention");
		kept(memory, "The flaky upload test was a missing await in uploadFile.", "fix");
		const found = memory.relevant("acme", "web", "The job queue drops jobs under load");
		expect(found.map((entry) => entry.kind)).toEqual(["decision"]);
		expect(memory.list("acme", "web").find((entry) => entry.kind === "decision")?.used).toBe(1);
		expect(memory.relevant("acme", "web", "hello")).toEqual([]);
		expect(memoryBrief(found)).toContain("- (decision) We chose Postgres advisory locks");
		expect(memoryBrief([])).toBeNull();
	});

	it("is kept and found by agents with its tools, and given to the next thread", async () => {
		const root = mkdtempSync(join(tmpdir(), "grid-memory-test-"));
		cleanup.push(() => rmSync(root, { recursive: true, force: true }));
		const store = new ChatStore(join(root, "chat.db"));
		const memory = new ProjectMemory(join(root, "chat.db"));
		cleanup.push(() => {
			memory.close();
			store.close();
		});
		const prompts: string[] = [];
		const provider: Provider = {
			info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
			start: async (): Promise<AgentSession> => ({
				prompt: async (text) => {
					prompts.push(text);
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
		hub.setMemoryBrief((session, message) =>
			memoryBrief(memory.relevant(session.workspaceId, session.project, message)),
		);
		const saved: string[] = [];
		const tools = memoryTools(memory, { saved: (_session, entry) => saved.push(entry.text) });
		const who = { userId: "ana", workspace: "acme" };
		const first = hub.create(who, { project: "web", provider: "fake", cwd: root });
		const [save, search] = tools;
		expect(
			await save?.run(first, {
				kind: "convention",
				text: "Migrations are never edited after they ship; add a new one.",
			}),
		).toBe("Kept in the project's memory.");
		expect(
			await save?.run(first, {
				kind: "convention",
				text: "migrations are never edited after they ship; add a new one.",
			}),
		).toBe("That is already in the project's memory.");
		expect(saved).toHaveLength(1);
		expect(await search?.run(first, { query: "migrations" })).toContain("never edited");
		expect(await search?.run(first, { query: "kubernetes" })).toContain("Nothing");

		const second = hub.create(who, { project: "web", provider: "fake", cwd: root });
		await hub.prompt("acme", second.id, "Add a column to the users table with a migration");
		expect(prompts[0]).toContain("From this project's memory");
		expect(prompts[0]).toContain("Migrations are never edited");
		// Only the first message carries it.
		await hub.prompt("acme", second.id, "And the migration for orders too");
		expect(prompts[1]).not.toContain("From this project's memory");
		// Another project's threads do not get this one's.
		const other = hub.create(who, { project: "api", provider: "fake", cwd: root });
		await hub.prompt("acme", other.id, "Write a migration");
		expect(prompts[2]).not.toContain("From this project's memory");
	});
});

describe("project memory over HTTP", () => {
	const ana = { userId: "ana", workspace: "acme", role: "member" as const };
	const bo = { userId: "bo", workspace: "acme", role: "member" as const };
	const viewer = { userId: "vi", workspace: "acme", role: "viewer" as const };
	const owner = { userId: "ow", workspace: "acme", role: "owner" as const };

	it("lets members keep and change it, and whoever kept it or an admin remove it", async () => {
		const memory = new ProjectMemory(":memory:");
		const audited: string[] = [];
		const call = async (who: Who, method: string, path: string, body?: unknown) => {
			const url = new URL(`http://runner${path}`);
			const response = await memoryRequest(
				new Request(url.href, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
				url,
				who,
				memory,
				(_who, action) => audited.push(action),
			);
			if (!response) throw new Error("not a memory request");
			return response;
		};
		expect((await call(ana, "GET", "/memory")).status).toBe(400);
		expect(
			(await call(viewer, "POST", "/memory", { project: "web", kind: "fact", text: "x" })).status,
		).toBe(403);
		const made = await call(ana, "POST", "/memory", {
			project: "web",
			kind: "decision",
			text: "Feature flags live in LaunchDarkly, not env vars.",
		});
		expect(made.status).toBe(201);
		const { id } = ((await made.json()) as { data: { id: string } }).data;
		const listed = (await (await call(viewer, "GET", "/memory?project=web")).json()) as {
			data: { text: string; by: { kind: string } }[];
		};
		expect(listed.data[0]).toMatchObject({ by: { kind: "person" } });
		const searched = (await (await call(ana, "GET", "/memory?project=web&q=flags")).json()) as {
			data: unknown[];
		};
		expect(searched.data).toHaveLength(1);
		expect(
			(await call(bo, "PUT", `/memory/${id}`, { text: "Flags live in LaunchDarkly." })).status,
		).toBe(200);
		expect((await call(bo, "DELETE", `/memory/${id}`)).status).toBe(403);
		expect((await call(owner, "DELETE", `/memory/${id}`)).status).toBe(204);
		expect((await call(owner, "DELETE", `/memory/${id}`)).status).toBe(404);
		expect(audited).toEqual(["memory.edit", "memory.remove"]);
	});
});
