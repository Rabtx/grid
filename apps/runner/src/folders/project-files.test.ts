import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FolderError } from "./folders";
import {
	createProjectFile,
	listProjectFiles,
	MAX_READ_BYTES,
	readProjectFile,
	searchProjectFiles,
} from "./project-files";

const root = mkdtempSync(join(tmpdir(), "grid-project-files-"));
const outside = mkdtempSync(join(tmpdir(), "grid-other-files-"));
mkdirSync(join(root, "src"));
mkdirSync(join(root, "node_modules"));
writeFileSync(join(root, "readme.md"), "hello");
symlinkSync(outside, join(root, "outside"));
writeFileSync(join(outside, "secret.txt"), "nope");

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

describe("project files", () => {
	it("lists folders before files and skips generated directories and symlinks", () => {
		expect(listProjectFiles(root)).toEqual({
			path: "",
			entries: [
				{ name: "src", path: "src", kind: "folder" },
				{ name: "readme.md", path: "readme.md", kind: "file" },
			],
		});
	});

	it("creates an empty file and folder without replacing existing items", () => {
		expect(createProjectFile(root, "src", "index.ts", "file").path).toBe("src/index.ts");
		expect(createProjectFile(root, "src", "components", "folder").path).toBe("src/components");
		expect(existsSync(join(root, "src", "index.ts"))).toBe(true);
		expect(() => createProjectFile(root, "src", "index.ts", "file")).toThrow(FolderError);
		expect(() => createProjectFile(root, "src", "components", "folder")).toThrow(FolderError);
	});

	it("rejects traversal, symlink escapes and unsafe names", () => {
		for (const path of ["../", "/tmp", "outside", "src/../../", "src\\..\\outside"])
			expect(() => listProjectFiles(root, path)).toThrow(FolderError);
		for (const name of ["", ".", "..", "../bad", "a/b", "bad\nname", " trailing ", "node_modules"])
			expect(() => createProjectFile(root, "src", name, "file")).toThrow(FolderError);
	});

	it("searches files recursively, matches queries with subsequence/substring, and skips ignored folders", () => {
		createProjectFile(root, "src", "app.ts", "file");
		createProjectFile(root, "src", "app.test.ts", "file");
		mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(root, "node_modules", "pkg", "index.js"), "module");

		const all = searchProjectFiles(root);
		expect(all).toContain("readme.md");
		expect(all).toContain("src/app.ts");
		expect(all).toContain("src/app.test.ts");
		expect(all.some((f) => f.includes("node_modules"))).toBe(false);

		const filtered = searchProjectFiles(root, "test");
		expect(filtered).toEqual(["src/app.test.ts"]);

		const fuzzy = searchProjectFiles(root, "sat");
		expect(fuzzy).toContain("src/app.test.ts");
	});

	it("reads a text file, and names binary and oversized files without their contents", () => {
		expect(readProjectFile(root, "readme.md")).toEqual({
			path: "readme.md",
			name: "readme.md",
			size: 5,
			text: "hello",
			binary: false,
			tooLarge: false,
		});
		writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
		expect(readProjectFile(root, "logo.png")).toMatchObject({ text: null, binary: true });
		writeFileSync(join(root, "big.log"), "x".repeat(MAX_READ_BYTES + 1));
		expect(readProjectFile(root, "big.log")).toMatchObject({ text: null, tooLarge: true });
	});

	it("refuses to read folders, missing files and anything outside the project", () => {
		for (const path of ["src", "missing.txt", "../x", "/etc/hosts", "outside/secret.txt"])
			expect(() => readProjectFile(root, path)).toThrow(FolderError);
	});
});
