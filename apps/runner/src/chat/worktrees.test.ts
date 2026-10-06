import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Provider } from "../agents/provider";
import { ChatHub } from "./hub";
import { ChatStore } from "./store";
import { createWorktree, fetchBranch, removeWorktree, repoRoot, worktreeStatus } from "./worktrees";

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

	it("starts a new branch from the workspace's default branch when there is one", () => {
		const app = repo("defaulted");
		git(app, "checkout", "-q", "-b", "feature/wip");
		writeFileSync(join(app, "web", "wip.ts"), "export {};\n");
		git(app, "add", ".");
		git(app, "commit", "-q", "-m", "wip");
		const made = createWorktree(join(app, "web"), "dddddddd-1111", projects, { from: "main" });
		expect(made?.worktree.base).toBe("main");
		expect(git(made?.worktree.path ?? "", "rev-parse", "HEAD")).toBe(
			git(app, "rev-parse", "refs/heads/main"),
		);
		// A default branch this repository lacks starts from what is checked out instead.
		const other = createWorktree(join(app, "web"), "eeeeeeee-1111", projects, { from: "develop" });
		expect(other?.worktree.base).toBe("feature/wip");
	});

	it("is not made for a folder outside git", () => {
		const plain = join(projects, "plain");
		mkdirSync(plain);
		expect(createWorktree(plain, "abcdef12", projects)).toBeNull();
	});

	it("refuses a .grid-worktrees that resolves outside the projects folder", () => {
		// A symlink here would pass a check made on the unresolved path and put a checkout, and
		// a branch, outside the folder Grid keeps projects in.
		const root = mkdtempSync(join(tmpdir(), "grid-worktree-escape-"));
		try {
			const inside = join(root, "projects");
			const outside = join(root, "outside");
			mkdirSync(inside, { recursive: true });
			mkdirSync(outside, { recursive: true });
			const shop = join(inside, "shop");
			mkdirSync(shop, { recursive: true });
			git(shop, "init", "-q", "-b", "main");
			writeFileSync(join(shop, "app.ts"), "export {};\n");
			git(shop, "add", ".");
			git(shop, "commit", "-q", "-m", "first");
			symlinkSync(outside, join(inside, ".grid-worktrees"));

			expect(() => createWorktree(shop, "deadbeef-1111", inside)).toThrow(
				"outside the projects directory",
			);
			expect(existsSync(join(outside, "shop"))).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("checks out an existing branch as it is instead of making one", () => {
		const app = repo("existing");
		git(app, "branch", "feature/login");
		const made = createWorktree(join(app, "web"), "aaaaaaaa-1111", projects, {
			branch: "feature/login",
			existing: true,
		});
		expect(made?.worktree.branch).toBe("feature/login");
		// It did not start from anything local, so there is no base to count against.
		expect(made?.worktree.base).toBeNull();
		expect(git(made?.worktree.path ?? "", "rev-parse", "HEAD")).toBe(
			git(app, "rev-parse", "refs/heads/feature/login"),
		);
	});

	it("fetches a branch only the remote has, and tracks it", async () => {
		const server = join(projects, "origin.git");
		mkdirSync(server);
		git(server, "init", "-q", "--bare", "-b", "main");
		const local = join(projects, "cloned");
		mkdirSync(join(local, "web"), { recursive: true });
		git(local, "init", "-q", "-b", "main");
		writeFileSync(join(local, "web", "app.ts"), "export {};\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "first");
		git(local, "remote", "add", "origin", server);
		git(local, "push", "-q", "-u", "origin", "main");
		git(local, "branch", "remote-only");
		git(local, "push", "-q", "origin", "remote-only");
		git(local, "branch", "-D", "remote-only");

		await fetchBranch(join(local, "web"), { branch: "remote-only", existing: true });
		const made = createWorktree(join(local, "web"), "bbbbbbbb-2222", projects, {
			branch: "remote-only",
			existing: true,
		});
		expect(made?.worktree.branch).toBe("remote-only");
		expect(git(made?.worktree.path ?? "", "rev-parse", "HEAD")).toBe(
			git(local, "rev-parse", "refs/remotes/origin/remote-only"),
		);
		expect(git(local, "rev-parse", "--abbrev-ref", "remote-only@{upstream}")).toBe(
			"origin/remote-only",
		);
	});

	it("fetches a fork's pull request onto a branch of its own, even when its name is taken", async () => {
		const server = join(projects, "fork-origin.git");
		mkdirSync(server);
		git(server, "init", "-q", "--bare", "-b", "main");
		const local = join(projects, "forked");
		mkdirSync(join(local, "web"), { recursive: true });
		git(local, "init", "-q", "-b", "main");
		writeFileSync(join(local, "web", "app.ts"), "export {};\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "first");
		git(local, "remote", "add", "origin", server);
		git(local, "push", "-q", "-u", "origin", "main");
		// The contribution exists only as the pull request's ref, as a fork's would; the fork's
		// branch was called `main`, like the person's own, which is checked out in their folder.
		git(local, "checkout", "-q", "-b", "contributed");
		writeFileSync(join(local, "web", "app.ts"), "export const contributed = true;\n");
		git(local, "commit", "-q", "-am", "contribute");
		const contributed = git(local, "rev-parse", "HEAD");
		git(local, "push", "-q", "origin", "HEAD:refs/pull/7/head");
		git(local, "checkout", "-q", "main");
		git(local, "branch", "-D", "contributed");
		const ownMain = git(local, "rev-parse", "main");

		const request = { branch: "grid/pr-7", existing: true, pull: 7, fork: true };
		await fetchBranch(join(local, "web"), request);
		const made = createWorktree(join(local, "web"), "ffffffff-6666", projects, request);
		expect(made?.worktree).toMatchObject({ branch: "grid/pr-7", adopted: true });
		expect(git(made?.worktree.path ?? "", "rev-parse", "HEAD")).toBe(contributed);
		// The person's own `main` was not touched.
		expect(git(local, "rev-parse", "main")).toBe(ownMain);
	});

	it("never deletes a branch it did not make, whatever removing asks", () => {
		const app = repo("adopted");
		git(app, "branch", "feature/theirs");
		const made = createWorktree(app, "abababab-7777", projects, {
			branch: "feature/theirs",
			existing: true,
		});
		if (!made) throw new Error("no worktree");
		expect(worktreeStatus(made.worktree).adopted).toBe(true);
		removeWorktree(made.worktree, { deleteBranch: true });
		expect(existsSync(made.worktree.path)).toBe(false);
		expect(git(app, "branch", "--list", "feature/theirs")).toContain("feature/theirs");
	});

	it("takes a pull request's own branch on origin, which tracks it, over its pull ref", async () => {
		const server = join(projects, "same-repo-origin.git");
		mkdirSync(server);
		git(server, "init", "-q", "--bare", "-b", "main");
		const local = join(projects, "same-repo");
		mkdirSync(join(local, "web"), { recursive: true });
		git(local, "init", "-q", "-b", "main");
		writeFileSync(join(local, "web", "app.ts"), "export {};\n");
		git(local, "add", ".");
		git(local, "commit", "-q", "-m", "first");
		git(local, "remote", "add", "origin", server);
		git(local, "push", "-q", "-u", "origin", "main");
		// A pull request from a branch of this repository: both exist on origin.
		git(local, "checkout", "-q", "-b", "fix/tidy");
		writeFileSync(join(local, "web", "app.ts"), "export const tidy = true;\n");
		git(local, "commit", "-q", "-am", "tidy");
		git(local, "push", "-q", "-u", "origin", "fix/tidy");
		git(local, "push", "-q", "origin", "HEAD:refs/pull/12/head");
		git(local, "checkout", "-q", "main");
		git(local, "branch", "-D", "fix/tidy");

		await fetchBranch(join(local, "web"), { branch: "fix/tidy", existing: true, pull: 12 });
		const made = createWorktree(join(local, "web"), "eeeeeeee-5555", projects, {
			branch: "fix/tidy",
			existing: true,
			pull: 12,
		});
		expect(git(made?.worktree.path ?? "", "rev-parse", "HEAD")).toBe(
			git(local, "rev-parse", "refs/remotes/origin/fix/tidy"),
		);
		// It tracks the branch, so the agent's push goes back to the pull request.
		expect(git(local, "rev-parse", "--abbrev-ref", "fix/tidy@{upstream}")).toBe("origin/fix/tidy");
	});

	it("refuses a branch that is already checked out somewhere", () => {
		const app = repo("checked-out");
		// The project's own folder has `main`; a worktree cannot take it too.
		expect(() =>
			createWorktree(join(app, "web"), "cccccccc-3333", projects, {
				branch: "main",
				existing: true,
			}),
		).toThrow("already checked out");

		// Neither can another worktree that already has the branch.
		git(app, "branch", "feature/x");
		git(app, "worktree", "add", "-q", join(projects, "elsewhere"), "feature/x");
		expect(() =>
			createWorktree(join(app, "web"), "dddddddd-4444", projects, {
				branch: "feature/x",
				existing: true,
			}),
		).toThrow("already checked out");
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

	it("works on an existing branch when the chat asks for it", () => {
		const api = repo("api");
		const hub = new ChatHub(new ChatStore(":memory:"), new Map([["fake", provider]]), projects);
		hub.linkProjectFolder("w1", "api", api);
		git(api, "branch", "release/2");

		const chat = hub.create(who, {
			project: "api",
			provider: "fake",
			worktree: true,
			branch: "release/2",
			existing: true,
		});
		expect(chat.worktree?.branch).toBe("release/2");
		expect(chat.cwd).toBe(join(projects, ".grid-worktrees", "api", "release-2"));
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
