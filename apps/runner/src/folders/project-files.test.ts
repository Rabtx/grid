import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FolderError } from "./folders";
import { createProjectFile, listProjectFiles } from "./project-files";

const root = mkdtempSync(join(tmpdir(), "grid-project-files-"));
const outside = mkdtempSync(join(tmpdir(), "grid-other-files-"));
mkdirSync(join(root, "src"));
mkdirSync(join(root, "node_modules"));
writeFileSync(join(root, "readme.md"), "hello");
symlinkSync(outside, join(root, "outside"));

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
});
