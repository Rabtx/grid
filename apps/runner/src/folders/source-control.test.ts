import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	cleanMessage,
	commitFiles,
	createGithubRepo,
	fetchRemote,
	fileDiff,
	initRepo,
	messagePrompt,
	pullBranch,
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
		await run(remote, ["init", "--bare", "-q", "--initial-branch=main"]);
		await run(folder, ["remote", "add", "origin", remote]);
		expect((await sourceStatus(folder)).ahead).toBe(2);
		await pushBranch(folder);
		const status = await sourceStatus(folder);
		expect(status).toMatchObject({ upstream: "origin/main", ahead: 0, behind: 0 });
		expect(status.remote?.name).toBe("origin");
	});
});

describe("pull", () => {
	const other = mkdtempSync(join(tmpdir(), "grid-source-other-"));
	afterAll(() => rmSync(other, { recursive: true, force: true }));
	const signed = ["-c", "user.name=Ana", "-c", "user.email=ana@example.com"];

	it("brings in the remote's commits, and replays its own on top when both moved", async () => {
		await run(other, ["clone", "--quiet", remote, "."]);
		writeFileSync(join(other, "theirs.txt"), "from ana\n");
		await run(other, ["add", "theirs.txt"]);
		await run(other, [...signed, "commit", "--quiet", "-m", "feat: theirs"]);
		await run(other, ["push", "--quiet"]);
		await fetchRemote(folder);
		expect((await sourceStatus(folder)).behind).toBe(1);
		await pullBranch(folder);
		expect(readFileSync(join(folder, "theirs.txt"), "utf8")).toBe("from ana\n");
		// Both sides move on different files: this copy's commit goes on top of theirs.
		writeFileSync(join(other, "second.txt"), "again\n");
		await run(other, ["add", "second.txt"]);
		await run(other, [...signed, "commit", "--quiet", "-m", "feat: second"]);
		await run(other, ["push", "--quiet"]);
		writeFileSync(join(folder, "mine.txt"), "mine\n");
		await commitFiles(folder, { paths: ["mine.txt"], message: "feat: mine", author });
		await pullBranch(folder, author);
		const status = await sourceStatus(folder);
		expect(status).toMatchObject({ behind: 0, ahead: 1 });
		expect(status.recent.map((commit) => commit.subject).slice(0, 2)).toEqual([
			"feat: mine",
			"feat: second",
		]);
		// b.txt's uncommitted edit came through untouched.
		expect(status.changes.map((change) => change.path)).toContain("b.txt");
	});
});

describe("createGithubRepo", () => {
	const project = mkdtempSync(join(tmpdir(), "grid-source-new-"));
	const bare = mkdtempSync(join(tmpdir(), "grid-source-bare-"));
	const bin = mkdtempSync(join(tmpdir(), "grid-source-gh-"));
	const fake = join(bin, "gh");
	afterAll(() => {
		for (const dir of [project, bare, bin]) rmSync(dir, { recursive: true, force: true });
	});
	// A stand-in for the GitHub CLI: signed in, and "making" the repository as a local bare one.
	writeFileSync(
		fake,
		`#!/bin/sh
case "$1 $2" in
"auth status") exit 0 ;;
"repo create") git remote add origin "${bare}" && echo "https://github.com/sam/$3" ;;
*) exit 1 ;;
esac
`,
	);
	chmodSync(fake, 0o755);

	it("refuses a bad name and a folder not in git", async () => {
		await expect(
			createGithubRepo(project, { name: "bad name", private: true }, fake),
		).rejects.toThrow("Name it");
		await expect(createGithubRepo(project, { name: "web", private: true }, fake)).rejects.toThrow(
			"Start git",
		);
	});

	it("makes the repository, adds it as origin and pushes", async () => {
		await run(bare, ["init", "--bare", "-q", "--initial-branch=main"]);
		await initRepo(project, "main");
		writeFileSync(join(project, "a.txt"), "a\n");
		await commitFiles(project, { paths: ["a.txt"], message: "feat: a", author });
		const made = await createGithubRepo(project, { name: "web", private: true }, fake);
		expect(made).toEqual({ url: "https://github.com/sam/web", pushed: true });
		expect(await sourceStatus(project)).toMatchObject({ upstream: "origin/main", ahead: 0 });
		await expect(createGithubRepo(project, { name: "web", private: true }, fake)).rejects.toThrow(
			"already pushes",
		);
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
