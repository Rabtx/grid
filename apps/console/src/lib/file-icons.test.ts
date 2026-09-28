import { describe, expect, it } from "vitest";

import { iconIdFor, iconUrlFor, type IconTheme } from "./file-icons";

const theme: IconTheme = {
	file: "file",
	folder: "folder",
	folderExpanded: "folder_open",
	fileExtensions: { ts: "typescript", "d.ts": "typescript_def", json: "json" },
	fileNames: { "package.json": "nodejs", Dockerfile: "docker" },
	folderNames: { src: "folder_src" },
	folderNamesExpanded: { src: "folder_src_open" },
	languageIds: { c: "c" },
	iconDefinitions: {
		file: { iconPath: "./deep/file.svg" },
		typescript: { iconPath: "./deep/typescript.svg" },
		__typescript: { iconPath: "./deep-light/typescript.svg" },
	},
	light: { fileExtensions: { ts: "__typescript" } },
};

describe("file icons", () => {
	it("picks an exact name first, then the longest extension", () => {
		expect(iconIdFor(theme, "package.json", false, false, false)).toBe("nodejs");
		expect(iconIdFor(theme, "Dockerfile", false, false, false)).toBe("docker");
		expect(iconIdFor(theme, "index.d.ts", false, false, false)).toBe("typescript_def");
		expect(iconIdFor(theme, "main.TS", false, false, false)).toBe("typescript");
		expect(iconIdFor(theme, "notes.xyz", false, false, false)).toBe("file");
	});

	it("finds a file by its language when the theme lists it only that way", () => {
		expect(iconIdFor(theme, "main.h", false, false, false)).toBe("c");
	});

	it("gives folders their own icon, open or closed, else the default folder", () => {
		expect(iconIdFor(theme, "src", true, false, false)).toBe("folder_src");
		expect(iconIdFor(theme, "src", true, true, false)).toBe("folder_src_open");
		expect(iconIdFor(theme, "misc", true, true, false)).toBe("folder_open");
	});

	it("uses the light variant in light mode, and serves icons from the public folder", () => {
		expect(iconUrlFor(theme, "a.ts", false, false, false)).toBe("/file-icons/deep/typescript.svg");
		expect(iconUrlFor(theme, "a.ts", false, false, true)).toBe(
			"/file-icons/deep-light/typescript.svg",
		);
		expect(iconUrlFor(theme, "a.json", false, false, false)).toBeNull();
	});
});
