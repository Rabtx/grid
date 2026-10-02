import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { committedText, lastChanges, projectGit, repoPrefix } from "./project-git";

const repo = mkdtempSync(join(tmpdir(), "grid-project-git-"));
const run = (...args: string[]) =>
	Bun.spawnSync(["git", "-C", repo, ...args], {
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Sam",
			GIT_AUTHOR_EMAIL: "sam@example.com",
			GIT_COMMITTER_NAME: "Sam",
			GIT_COMMITTER_EMAIL: "sam@example.com",
		},
	});
// The project is a folder inside a larger repository.
const project = join(repo, "apps", "web");
mkdirSync(join(project, "src"), { recursive: true });
run("init", "-q", "-b", "main");
writeFileSync(join(project, "src", "eta.ts"), "export const step = 5;\n");
writeFileSync(join(project, "README.md"), "Jobs\n");
writeFileSync(join(repo, "other.txt"), "elsewhere\n");
run("add", ".");
run("commit", "-q", "-m", "Round job ETAs");
writeFileSync(join(project, "src", "eta.ts"), "export const step = 5;\nexport const max = 60;\n");
writeFileSync(join(project, "src", "eta.test.ts"), "test\n");
writeFileSync(join(repo, "other.txt"), "changed outside the project\n");

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("project git", () => {
	it("finds where the project sits in its repository", async () => {
		expect(await repoPrefix(project)).toBe("apps/web/");
	});

	it("names the branch and what changed, in the project's own paths only", async () => {
		expect(await projectGit(project, "apps/web/")).toEqual({
			branch: "main",
			changes: [
				{ path: "src/eta.test.ts", status: "added", added: null, removed: null },
				{ path: "src/eta.ts", status: "modified", added: 1, removed: 0 },
			],
		});
	});

	it("says who last changed each entry of a folder, and the folder itself", async () => {
		const root = await lastChanges(project, "apps/web/", "", ["src", "README.md"]);
		expect(root[""]).toMatchObject({ author: "Sam", subject: "Round job ETAs" });
		expect(root.src).toMatchObject({ subject: "Round job ETAs" });
		expect(root["README.md"]).toMatchObject({ subject: "Round job ETAs" });
		const src = await lastChanges(project, "apps/web/", "src", ["src/eta.ts", "src/eta.test.ts"]);
		expect(src["src/eta.ts"]).toMatchObject({ author: "Sam" });
		expect(src["src/eta.test.ts"]).toBeUndefined();
	});

	it("gives a file as it was committed, and nothing for a new one", async () => {
		expect(await committedText(project, "src/eta.ts")).toBe("export const step = 5;\n");
		expect(await committedText(project, "src/eta.test.ts")).toBeNull();
	});

	it("knows a folder outside a repository is not in one", async () => {
		const loose = mkdtempSync(join(tmpdir(), "grid-no-git-"));
		expect(await repoPrefix(loose)).toBeNull();
		rmSync(loose, { recursive: true, force: true });
	});
});
