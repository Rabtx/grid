import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
	expandPath,
	FolderError,
	insideProjectsDir,
	inspectFolder,
	listFolders,
	remoteToUrl,
} from "./folders";

const root = mkdtempSync(join(tmpdir(), "grid-folders-"));
mkdirSync(join(root, "app", ".git"), { recursive: true });
writeFileSync(
	join(root, "app", ".git", "config"),
	'[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:me/app.git\n\tfetch = +refs/heads/*\n',
);
mkdirSync(join(root, "Notes"));
mkdirSync(join(root, ".hidden"));
mkdirSync(join(root, "node_modules"));
writeFileSync(join(root, "file.txt"), "not a folder");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("listFolders", () => {
	it("lists folders only, sorted, marking git repositories and skipping noise", () => {
		const listing = listFolders(root);
		expect(listing.path).toBe(root);
		expect(listing.folders.map((folder) => [folder.name, folder.git])).toEqual([
			["app", true],
			["Notes", false],
		]);
		expect(listFolders(root, { hidden: true }).folders.map((folder) => folder.name)).toContain(
			".hidden",
		);
	});

	it("starts at home and refuses what is not a folder", () => {
		expect(listFolders(undefined).path).toBe(homedir());
		expect(() => listFolders(join(root, "file.txt"))).toThrow(FolderError);
	});
});

describe("folder details", () => {
	it("keeps filesystem paths inside the configured projects directory", () => {
		const outside = mkdtempSync(join(tmpdir(), "grid-folders-outside-"));
		const escaped = join(root, "outside-link");
		symlinkSync(outside, escaped, "dir");
		try {
			expect(insideProjectsDir(root, root)).toBe(root);
			expect(() => insideProjectsDir(outside, root)).toThrow(FolderError);
			expect(() => insideProjectsDir(escaped, root)).toThrow("outside the projects directory");
			expect(() => insideProjectsDir(join(root, "missing"), root)).toThrow(
				"folder is not available",
			);
		} finally {
			rmSync(escaped, { force: true });
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("expands the home shorthand", () => {
		expect(expandPath("~/Projects")).toBe(join(homedir(), "Projects"));
	});

	it("names the project after the folder and reads its origin as a web URL", () => {
		expect(inspectFolder(join(root, "app"))).toEqual({
			path: join(root, "app"),
			name: "app",
			repoUrl: "https://github.com/me/app",
		});
		expect(inspectFolder(join(root, "Notes")).repoUrl).toBeNull();
	});

	it("turns every common remote form into a URL, dropping credentials", () => {
		expect(remoteToUrl("git@github.com:me/app.git")).toBe("https://github.com/me/app");
		expect(remoteToUrl("ssh://git@gitlab.com:22/team/app.git")).toBe("https://gitlab.com/team/app");
		expect(remoteToUrl("https://user:secret@github.com/me/app.git")).toBe(
			"https://github.com/me/app",
		);
		expect(remoteToUrl("/local/path")).toBeNull();
	});
});
