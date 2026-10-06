import { describe, expect, it } from "bun:test";
import { deflateRawSync } from "node:zlib";

import { importGitRepository, importZip } from "./imports";

type ZipFile = { path: string; content: string; mode?: number };

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** A small in-memory ZIP fixture, so import tests do not need a shell archive utility. */
function zip(files: ZipFile[]): Uint8Array {
	const locals: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const file of files) {
		const name = Buffer.from(file.path, "utf8");
		const content = Buffer.from(file.content, "utf8");
		const compressed = deflateRawSync(content);
		const crc = crc32(content);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x800, 6);
		local.writeUInt16LE(8, 8);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.byteLength, 18);
		local.writeUInt32LE(content.byteLength, 22);
		local.writeUInt16LE(name.byteLength, 26);
		locals.push(local, name, compressed);

		const directory = Buffer.alloc(46);
		directory.writeUInt32LE(0x02014b50, 0);
		directory.writeUInt16LE((3 << 8) | 20, 4);
		directory.writeUInt16LE(20, 6);
		directory.writeUInt16LE(0x800, 8);
		directory.writeUInt16LE(8, 10);
		directory.writeUInt32LE(crc, 16);
		directory.writeUInt32LE(compressed.byteLength, 20);
		directory.writeUInt32LE(content.byteLength, 24);
		directory.writeUInt16LE(name.byteLength, 28);
		directory.writeUInt32LE(((file.mode ?? 0o100644) << 16) >>> 0, 38);
		directory.writeUInt32LE(offset, 42);
		central.push(directory, name);
		offset += local.byteLength + name.byteLength + compressed.byteLength;
	}
	const centralBytes = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(centralBytes.byteLength, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, centralBytes, end]);
}

const markdown = `---\nname: change-review\ndescription: Review each change\n---\n\nCheck edge cases.`;

describe("skill archive imports", () => {
	it("reads a skill folder and optional reference files without extracting it", async () => {
		const result = await importZip(
			zip([
				{ path: "project/SKILL.md", content: markdown },
				{ path: "project/references/checklist.md", content: "Check edge cases." },
				{ path: "project/README.md", content: "Reference material." },
			]),
		);
		expect(result.skillMarkdown).toBe(markdown);
		expect(result.files).toEqual([
			{ path: "README.md", content: "Reference material." },
			{ path: "references/checklist.md", content: "Check edge cases." },
		]);
	});

	it("rejects traversal paths, links, extra skills and oversized skill data", async () => {
		await expect(importZip(zip([{ path: "../SKILL.md", content: markdown }]))).rejects.toThrow(
			"unsafe name",
		);
		await expect(
			importZip(zip([{ path: "SKILL.md", content: markdown, mode: 0o120777 }])),
		).rejects.toThrow("Symbolic links");
		await expect(
			importZip(
				zip([
					{ path: "a/SKILL.md", content: markdown },
					{ path: "b/SKILL.md", content: markdown },
				]),
			),
		).rejects.toThrow("several skills");
		await expect(
			importZip(zip([{ path: "SKILL.md", content: `${markdown}${"x".repeat(50 * 1024)}` }])),
		).rejects.toThrow("size limit");
	});

	it("imports a public Git repository archive without running repository code", async () => {
		const original = globalThis.fetch;
		const archive = zip([{ path: "change-review/SKILL.md", content: markdown }]);
		const requested: string[] = [];
		globalThis.fetch = (async (input) => {
			const url = String(input);
			requested.push(url);
			if (url === "https://api.github.com/repos/example/change-review")
				return Response.json({ default_branch: "main" });
			if (url.endsWith("/zipball/main"))
				return new Response(null, {
					status: 302,
					headers: {
						location: "https://codeload.github.com/example/change-review/legacy.zip/main",
					},
				});
			if (url.startsWith("https://codeload.github.com/")) return new Response(archive);
			return new Response(null, { status: 404 });
		}) as typeof fetch;
		try {
			const imported = await importGitRepository("https://github.com/example/change-review");
			expect(imported.skillMarkdown).toBe(markdown);
			expect(requested).toHaveLength(3);
			expect(requested.every((url) => url.startsWith("https://"))).toBe(true);
		} finally {
			globalThis.fetch = original;
		}
	});

	it("refuses non-GitHub URLs before making a request", async () => {
		await expect(importGitRepository("https://127.0.0.1/private/repo")).rejects.toThrow(
			"Only public HTTPS GitHub",
		);
	});
});
