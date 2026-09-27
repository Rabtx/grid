import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkout, gitInfo } from "./git";

const root = mkdtempSync(join(tmpdir(), "grid-git-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): void {
	Bun.spawnSync(["git", "-C", cwd, ...args], {
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Grid",
			GIT_AUTHOR_EMAIL: "grid@example.com",
			GIT_COMMITTER_NAME: "Grid",
			GIT_COMMITTER_EMAIL: "grid@example.com",
		},
	});
}

describe("a folder's git state", () => {
	it("knows a folder outside git", () => {
		expect(gitInfo(root)).toEqual({
			repo: false,
			branch: null,
			branches: [],
			changed: 0,
			worktree: false,
		});
	});

	it("reads the branch, the branches and the changes, and switches or creates branches", () => {
		const app = join(root, "app");
		git(root, "init", "-q", "-b", "main", app);
		writeFileSync(join(app, "a.txt"), "a\n");
		git(app, "add", ".");
		git(app, "commit", "-q", "-m", "first");

		expect(gitInfo(app)).toMatchObject({
			repo: true,
			branch: "main",
			branches: ["main"],
			changed: 0,
		});
		expect(checkout(app, "feature/x", true)).toMatchObject({ branch: "feature/x" });
		expect(gitInfo(app).branches.sort()).toEqual(["feature/x", "main"]);
		expect(checkout(app, "main", false).branch).toBe("main");

		writeFileSync(join(app, "b.txt"), "b\n");
		expect(gitInfo(app).changed).toBe(1);
		expect(() => checkout(app, "bad name", true)).toThrow("not a branch name");
		expect(() => checkout(app, "no-such", false)).toThrow();
	});
});
