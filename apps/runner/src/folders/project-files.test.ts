import { afterAll, describe, expect, it } from "bun:test";
import {
	existsSync,
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FolderError } from "./folders";
import {
	createProjectFile,
	listProjectFiles,
	MAX_READ_BYTES,
	readProjectFile,
	searchProjectFiles,
	textHash,
	writeProjectFile,
} from "./project-files";

const root = mkdtempSync(join(tmpdir(), "grid-project-files-"));
const outside = mkdtempSync(join(tmpdir(), "grid-other-files-"));
mkdirSync(join(root, "src"));
mkdirSync(join(root, "node_modules"));
writeFileSync(join(root, "readme.md"), "hello");
symlinkSync(outside, join(root, "outside"));
writeFileSync(join(outside, "secret.txt"), "nope");

const readdirNames = (dir: string) => readdirSync(dir).sort();

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
			hash: textHash("hello"),
		});
		writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
		expect(readProjectFile(root, "logo.png")).toMatchObject({
			text: null,
			binary: true,
			hash: null,
		});
		writeFileSync(join(root, "big.log"), "x".repeat(MAX_READ_BYTES + 1));
		expect(readProjectFile(root, "big.log")).toMatchObject({ text: null, tooLarge: true });
	});

	it("refuses to read folders, missing files and anything outside the project", () => {
		for (const path of ["src", "missing.txt", "../x", "/etc/hosts", "outside/secret.txt"])
			expect(() => readProjectFile(root, path)).toThrow(FolderError);
	});
});

describe("writing a project file", () => {
	const base = mkdtempSync(join(tmpdir(), "grid-project-write-"));
	writeFileSync(join(base, "notes.md"), "first");
	mkdirSync(join(base, "src"));
	writeFileSync(join(base, "logo.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));
	mkdirSync(join(base, "outside"));
	symlinkSync(outside, join(base, "escape"));
	writeFileSync(join(outside, "secret.txt"), "nope");

	afterAll(() => {
		rmSync(base, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	});

	const read = () => readProjectFile(base, "notes.md");

	it("saves onto the version that was read and answers with the new one", () => {
		const before = read();
		expect(before.hash).toBe(textHash("first"));
		const saved = writeProjectFile(base, { path: "notes.md", text: "second", base: before.hash! });
		expect(saved.text).toBe("second");
		expect(saved.hash).toBe(textHash("second"));
		expect(readFileSync(join(base, "notes.md"), "utf8")).toBe("second");
		// A save must not leave its temporary file behind.
		expect(readdirNames(base)).toEqual(["escape", "logo.png", "notes.md", "outside", "src"]);
	});

	it("refuses a save based on a version that is no longer on disk", () => {
		const stale = read();
		writeFileSync(join(base, "notes.md"), "changed elsewhere");
		expect(() =>
			writeProjectFile(base, { path: "notes.md", text: "mine", base: stale.hash! }),
		).toThrow(FolderError);
		expect(readFileSync(join(base, "notes.md"), "utf8")).toBe("changed elsewhere");
		// Re-reading and saving again works: the base is what is on disk now.
		const fresh = read();
		expect(writeProjectFile(base, { path: "notes.md", text: "mine", base: fresh.hash! }).text).toBe(
			"mine",
		);
	});

	it("refuses anything outside the project, and anything that is not a text file", () => {
		const current = read();
		for (const path of ["../outside/secret.txt", "/etc/hosts", "escape/secret.txt", "src"]) {
			expect(() => writeProjectFile(base, { path, text: "mine", base: current.hash! })).toThrow(
				FolderError,
			);
		}
		expect(() =>
			writeProjectFile(base, { path: "missing.md", text: "mine", base: current.hash! }),
		).toThrow(FolderError);
		expect(() =>
			writeProjectFile(base, { path: "logo.png", text: "mine", base: current.hash! }),
		).toThrow(FolderError);
	});

	it("refuses binary text, text over the size limit, and a missing base", () => {
		const current = read();
		expect(() =>
			writeProjectFile(base, { path: "notes.md", text: "a\0b", base: current.hash! }),
		).toThrow(FolderError);
		expect(() =>
			writeProjectFile(base, {
				path: "notes.md",
				text: "x".repeat(MAX_READ_BYTES + 1),
				base: current.hash!,
			}),
		).toThrow(FolderError);
		expect(() =>
			writeProjectFile(base, { path: "notes.md", text: "mine", base: "" as string }),
		).toThrow(FolderError);
		// None of those refusals changed the file.
		expect(readFileSync(join(base, "notes.md"), "utf8")).toBe("mine");
	});

	it("refuses the git folder, and a symlinked file that points outside, for reading and writing", () => {
		const git = mkdtempSync(join(tmpdir(), "grid-project-git-"));
		mkdirSync(join(git, ".git", "hooks"), { recursive: true });
		writeFileSync(join(git, ".git", "config"), "[core]");
		writeFileSync(join(git, ".git", "hooks", "pre-commit"), "");
		symlinkSync(join(git, ".git"), join(git, "linked"));
		symlinkSync(join(outside, "secret.txt"), join(git, "secret.txt"));
		const hash = textHash("[core]");
		try {
			for (const path of [".git/config", "src/../.git/config", "linked/config", "secret.txt"]) {
				expect(() => readProjectFile(git, path)).toThrow(FolderError);
				expect(() => writeProjectFile(git, { path, text: "x", base: hash })).toThrow(FolderError);
			}
			expect(() =>
				writeProjectFile(git, { path: ".git/hooks/pre-commit", text: "x", base: textHash("") }),
			).toThrow(FolderError);
			expect(readFileSync(join(git, ".git", "config"), "utf8")).toBe("[core]");
			expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("nope");
		} finally {
			rmSync(git, { recursive: true, force: true });
		}
	});

	it("keeps the file's mode when it saves", () => {
		writeFileSync(join(base, "run.sh"), "echo one");
		chmodSync(join(base, "run.sh"), 0o775);
		writeProjectFile(base, { path: "run.sh", text: "echo two", base: textHash("echo one") });
		expect(statSync(join(base, "run.sh")).mode & 0o7777).toBe(0o775);
		expect(readFileSync(join(base, "run.sh"), "utf8")).toBe("echo two");
	});

	it("names a file that is not UTF-8 as not editable rather than decoding it lossily", () => {
		writeFileSync(join(base, "latin.txt"), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
		expect(readProjectFile(base, "latin.txt")).toMatchObject({
			text: null,
			binary: true,
			hash: null,
		});
		expect(() =>
			writeProjectFile(base, { path: "latin.txt", text: "café", base: textHash("caf\uFFFD") }),
		).toThrow(FolderError);
		expect([...readFileSync(join(base, "latin.txt"))]).toEqual([0x63, 0x61, 0x66, 0xe9]);
	});
});
