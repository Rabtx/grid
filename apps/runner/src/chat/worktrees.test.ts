import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";
import { createWorktree, removeWorktree, repoRoot, worktreeStatus } from "./worktrees";

const projects = mkdtempSync(join(tmpdir(), "grid-worktrees-"));
afterAll(() => rmSync(projects, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): string {
	const result = Bun.spawnSync(["git", "-C", cwd, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Grid",
			GIT_AUTHOR_EMAIL: "grid@example.com",
			GIT_COMMITTER_NAME: "Grid",
			GIT_COMMITTER_EMAIL: "grid@example.com",
		},
	});
	return result.stdout.toString().trim();
}

/** A repository in the projects folder, with one commit on `main`. */
function repo(name: string): string {
	const path = join(projects, name);
	mkdirSync(join(path, "web"), { recursive: true });
	git(path, "init", "-q", "-b", "main");
	writeFileSync(join(path, "web", "app.ts"), "export {};\n");
	git(path, "add", ".");
	git(path, "commit", "-q", "-m", "first");
	return path;
}

function branches(path: string): string[] {
	return git(path, "branch", "--format=%(refname:short)").split("\n").filter(Boolean);
}

describe("chat worktrees", () => {
	it("makes one per chat, on its own branch from what is checked out", () => {
		const shop = repo("shop");
		const made = createWorktree(join(shop, "web"), "abcdef12-3456", projects);
		expect(made?.worktree).toEqual({
			repo: repoRoot(shop) ?? "",
			path: join(projects, ".grid-worktrees", "shop", "chat-abcdef12"),
			branch: "grid/chat-abcdef12",
			base: "main",
			origin: join(shop, "web"),
		});
		// The chat works in the same place inside it as the folder is in its repository.
		expect(made?.cwd).toBe(join(projects, ".grid-worktrees", "shop", "chat-abcdef12", "web"));
		expect(existsSync(join(made?.cwd ?? "", "app.ts"))).toBe(true);
		expect(branches(shop)).toContain("grid/chat-abcdef12");
	});

	it("is not made for a folder outside git", () => {
		const plain = join(projects, "plain");
		mkdirSync(plain);
		expect(createWorktree(plain, "abcdef12", projects)).toBeNull();
	});

	it("says what would be lost, and refuses to lose it without force", () => {
		const app = repo("app");
		const made = createWorktree(app, "11111111-aaaa", projects);
		if (!made) throw new Error("no worktree");
		const { worktree } = made;
		expect(worktreeStatus(worktree)).toMatchObject({ exists: true, changed: 0, unpushed: 0 });

		writeFileSync(join(worktree.path, "notes.md"), "draft\n");
		expect(worktreeStatus(worktree).changed).toBe(1);
		expect(() => removeWorktree(worktree, { deleteBranch: false })).toThrow("1 changed file");

		git(worktree.path, "add", ".");
		git(worktree.path, "commit", "-q", "-m", "notes");
		expect(worktreeStatus(worktree)).toMatchObject({ changed: 0, unpushed: 1 });
		expect(() => removeWorktree(worktree, { deleteBranch: true })).toThrow("1 commit");

		// Keeping the branch keeps the commit: the worktree can go.
		removeWorktree(worktree, { deleteBranch: false });
		expect(existsSync(worktree.path)).toBe(false);
		expect(branches(app)).toContain(worktree.branch);
	});
});

const provider: Provider = {
	info: () => ({ id: "fake", name: "Fake", available: true, models: [], modes: [] }),
	start: async () => {
		throw new Error("not used");
	},
};

describe("chats in worktrees", () => {
	const who = { userId: "u1", workspace: "w1" };

	it("works in the project folder unless a worktree is asked for, on the branch named", () => {
		const blog = repo("blog");
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), projects);
		hub.linkProjectFolder("w1", "blog", blog);

		const plain = hub.create(who, { project: "blog", provider: "fake" });
		expect(plain.worktree).toBeNull();
		expect(plain.cwd).toBe(blog);

		const named = hub.create(who, {
			project: "blog",
			provider: "fake",
			worktree: true,
			branch: "feature/login",
		});
		expect(named.worktree?.branch).toBe("feature/login");
		expect(named.cwd).toBe(join(projects, ".grid-worktrees", "blog", "feature-login"));
		expect(() =>
			hub.create(who, {
				project: "blog",
				provider: "fake",
				worktree: true,
				branch: "feature/login",
			}),
		).toThrow("already exists");

		// A project set to start every thread in a worktree names them itself.
		hub.setProjectSettings("w1", "blog", { worktrees: true });
		const auto = hub.create(who, { project: "blog", provider: "fake" });
		expect(auto.worktree?.branch).toBe(`grid/chat-${auto.id.slice(0, 8)}`);
	});

	it("carries on in the project folder once its worktree is discarded", () => {
		const docs = repo("docs");
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), projects);
		hub.linkProjectFolder("w1", "docs", docs);
		const chat = hub.create(who, { project: "docs", provider: "fake", worktree: true });
		const path = chat.worktree?.path ?? "";

		hub.discardWorktree("w1", chat.id, { deleteBranch: true });
		expect(existsSync(path)).toBe(false);
		expect(branches(docs)).not.toContain(chat.worktree?.branch);
		const after = hub.list("w1", "docs").find((row) => row.id === chat.id);
		expect(after?.worktree).toBeNull();
		expect(after?.cwd).toBe(docs);
	});

	it("cleans up an unused worktree with its chat, and keeps one holding work", () => {
		const site = repo("site");
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), projects);
		hub.linkProjectFolder("w1", "site", site);
		const empty = hub.create(who, { project: "site", provider: "fake", worktree: true });
		const busy = hub.create(who, { project: "site", provider: "fake", worktree: true });
		writeFileSync(join(busy.cwd, "wip.ts"), "// half done\n");

		hub.delete("w1", empty.id);
		hub.delete("w1", busy.id);
		expect(existsSync(empty.cwd)).toBe(false);
		expect(existsSync(join(busy.cwd, "wip.ts"))).toBe(true);

		// The kept one is listed as a leftover, with what it holds, and can be removed from there.
		const leftover = hub.worktrees("w1").find((entry) => entry.path === busy.cwd);
		expect(leftover).toMatchObject({ project: "site", chat: null, changed: 1 });
		expect(() => hub.removeWorktreeAt("w1", busy.cwd, { deleteBranch: true })).toThrow(
			"1 changed file",
		);
		hub.removeWorktreeAt("w1", busy.cwd, { deleteBranch: true, force: true });
		expect(existsSync(busy.cwd)).toBe(false);
	});

	it("lists the chats' worktrees and cleans up only those that hold nothing", () => {
		const shop = repo("store");
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), projects);
		hub.linkProjectFolder("w1", "store", shop);
		const idle = hub.create(who, { project: "store", provider: "fake", worktree: true });
		const working = hub.create(who, { project: "store", provider: "fake", worktree: true });
		writeFileSync(join(working.cwd, "draft.md"), "draft\n");

		const listed = hub.worktrees("w1").filter((entry) => entry.project === "store");
		expect(listed.map((entry) => entry.chat?.id).sort()).toEqual([idle.id, working.id].sort());

		expect(hub.cleanWorktrees("w1")).toBe(1);
		expect(existsSync(idle.cwd)).toBe(false);
		expect(existsSync(join(working.cwd, "draft.md"))).toBe(true);
		// The cleaned-up chat carries on in the project folder.
		expect(hub.list("w1", "store").find((row) => row.id === idle.id)?.cwd).toBe(shop);
	});
});
