import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	agentOf,
	blame,
	committedText,
	gitUser,
	lastChanges,
	projectGit,
	repoPrefix,
} from "./project-git";

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
// An agent's commit: authored as Sam, signed by the agent as its co-author.
writeFileSync(join(project, "src", "queue.ts"), "export const retries = 3;\n");
run("add", ".");
run(
	"commit",
	"-q",
	"-m",
	"Retry failed jobs\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
);
run("config", "user.email", "Sam@Example.com");
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
		expect(root[""]).toMatchObject({ author: "Sam", subject: "Retry failed jobs" });
		expect(root.src).toMatchObject({ subject: "Retry failed jobs" });
		expect(root["README.md"]).toMatchObject({ subject: "Round job ETAs" });
		const src = await lastChanges(project, "apps/web/", "src", ["src/eta.ts", "src/eta.test.ts"]);
		expect(src["src/eta.ts"]).toMatchObject({ author: "Sam" });
		expect(src["src/eta.test.ts"]).toBeUndefined();
	});

	it("names the agent behind a commit, by its author or a co-author trailer", () => {
		expect(agentOf("Sam", "sam@example.com", [])).toBeNull();
		expect(agentOf("Sam", "sam@example.com", ["Claude Opus 5.5 <noreply@anthropic.com>"])).toBe(
			"claude",
		);
		expect(agentOf("Codex", "codex@example.com", [])).toBe("codex");
		expect(agentOf("Sam", "sam@example.com", ["Ada <ada@example.com>"])).toBeNull();
	});

	it("says which agent made a commit and whether it was mine", async () => {
		const me = await gitUser(project);
		expect(me).toBe("sam@example.com");
		const src = await lastChanges(project, "apps/web/", "src", ["src/eta.ts", "src/queue.ts"], me);
		expect(src["src/queue.ts"]).toMatchObject({
			subject: "Retry failed jobs",
			agent: "claude",
			mine: true,
		});
		expect(src["src/eta.ts"]).toMatchObject({ agent: null, mine: true });
		const others = await lastChanges(
			project,
			"apps/web/",
			"src",
			["src/eta.ts"],
			"ada@example.com",
		);
		expect(others["src/eta.ts"]).toMatchObject({ mine: false });
	});

	it("blames each line on its commit, and lines not committed on no commit", async () => {
		const result = await blame(project, "src/eta.ts", "sam@example.com");
		expect(result?.lines).toHaveLength(2);
		const [first, second] = (result?.lines ?? []).map((at) => result?.commits[at]);
		expect(first).toMatchObject({ subject: "Round job ETAs", author: "Sam", mine: true });
		expect(first?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(second).toMatchObject({ sha: null, subject: "Not committed yet" });
		const queue = await blame(project, "src/queue.ts", null);
		expect(queue?.commits[0]).toMatchObject({ agent: "claude", mine: false });
		expect(await blame(project, "src/eta.test.ts", null)).toBeNull();
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
