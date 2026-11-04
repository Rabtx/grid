import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	cleanMessage,
	commitFiles,
	fileDiff,
	initRepo,
	messagePrompt,
	pushBranch,
	run,
	sourceStatus,
} from "./source-control";

const folder = mkdtempSync(join(tmpdir(), "grid-source-"));
const remote = mkdtempSync(join(tmpdir(), "grid-source-remote-"));
// No global identity: the person signed in to Grid signs the first commit.
const env = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const before = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM };
process.env.GIT_CONFIG_GLOBAL = env.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_NOSYSTEM = env.GIT_CONFIG_NOSYSTEM;
const author = { name: "Sam", email: "sam@example.com" };

afterAll(() => {
	if (before.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
	else process.env.GIT_CONFIG_GLOBAL = before.global;
	if (before.system === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
	else process.env.GIT_CONFIG_NOSYSTEM = before.system;
	rmSync(folder, { recursive: true, force: true });
	rmSync(remote, { recursive: true, force: true });
});

describe("source control", () => {
	it("says a folder is not in git, then starts a repository", async () => {
		expect((await sourceStatus(folder)).repo).toBe(false);
		await initRepo(folder, "main");
		const status = await sourceStatus(folder);
		expect(status).toMatchObject({ repo: true, top: true, branch: "main", commits: false });
		await expect(initRepo(folder)).rejects.toThrow("already in git");
	});

	it("shows a new file whole, and commits only the files chosen", async () => {
		writeFileSync(join(folder, "a.txt"), "one\n");
		writeFileSync(join(folder, "b.txt"), "two\n");
		const diff = await fileDiff(folder, "a.txt");
		expect(diff.diff).toContain("+one");
		const commit = await commitFiles(folder, { paths: ["a.txt"], message: "feat: add a", author });
		expect(commit.subject).toBe("feat: add a");
		const status = await sourceStatus(folder);
		expect(status.changes.map((change) => change.path)).toEqual(["b.txt"]);
		expect(status.commits).toBe(true);
		expect(status.recent[0]).toMatchObject({ subject: "feat: add a", author: "Sam" });
	});

	it("commits a rename with its old path, and refuses files no longer changed", async () => {
		renameSync(join(folder, "a.txt"), join(folder, "c.txt"));
		await run(folder, ["add", "--all", "--", "a.txt", "c.txt"]);
		const status = await sourceStatus(folder);
		expect(status.changes.find((change) => change.path === "c.txt")).toMatchObject({
			status: "renamed",
			from: "a.txt",
		});
		await commitFiles(folder, { paths: ["c.txt"], message: "refactor: rename a", author });
		const after = await sourceStatus(folder);
		expect(after.changes.map((change) => change.path)).toEqual(["b.txt"]);
		await expect(commitFiles(folder, { paths: ["a.txt"], message: "x", author })).rejects.toThrow(
			"no longer changed",
		);
		await expect(commitFiles(folder, { paths: ["b.txt"], message: " " })).rejects.toThrow(
			"commit message",
		);
	});

	it("asks for a message from the changes and recent subjects", async () => {
		writeFileSync(join(folder, "b.txt"), "two\nthree\n");
		const prompt = await messagePrompt(folder, ["b.txt"]);
		expect(prompt).toContain("added b.txt");
		expect(prompt).toContain("refactor: rename a");
		expect(prompt).toContain("+three");
	});

	it("pushes to a remote, setting where the branch goes the first time", async () => {
		await expect(pushBranch(folder)).rejects.toThrow("no remote");
		await run(remote, ["init", "--bare", "-q"]);
		await run(folder, ["remote", "add", "origin", remote]);
		expect((await sourceStatus(folder)).ahead).toBe(2);
		await pushBranch(folder);
		const status = await sourceStatus(folder);
		expect(status).toMatchObject({ upstream: "origin/main", ahead: 0, behind: 0 });
		expect(status.remote?.name).toBe("origin");
	});
});

describe("cleanMessage", () => {
	it("takes off fences, quotes and preamble", () => {
		expect(cleanMessage("Here is the commit message:\n```\nfix: tidy up\n```")).toBe(
			"fix: tidy up",
		);
		expect(cleanMessage('"feat: add x"')).toBe("feat: add x");
		expect(cleanMessage("feat: a\n\n\n\nbody")).toBe("feat: a\n\nbody");
	});
});
