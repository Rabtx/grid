import { inflateRawSync } from "node:zlib";

import type { SkillFile } from "./types";
import {
	SkillError,
	normalizeSkillPath,
	parseSkillMarkdown,
	validateSkillFiles,
} from "./validation";

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 80;
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

type ZipEntry = {
	path: string;
	flags: number;
	method: number;
	compressedSize: number;
	plainSize: number;
	localOffset: number;
	crc: number;
};

function need(bytes: Uint8Array, offset: number, length: number): void {
	if (offset < 0 || length < 0 || offset + length > bytes.byteLength)
		throw new SkillError("That ZIP file is incomplete");
}

function readText(bytes: Uint8Array, offset: number, length: number): string {
	need(bytes, offset, length);
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(
			bytes.subarray(offset, offset + length),
		);
	} catch {
		throw new SkillError("ZIP file names must be UTF-8");
	}
}

function endRecord(bytes: Uint8Array): {
	offset: number;
	entries: number;
	centralOffset: number;
	centralSize: number;
} {
	const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const earliest = Math.max(0, bytes.byteLength - 65_557);
	for (let offset = bytes.byteLength - 22; offset >= earliest; offset--) {
		if (input.readUInt32LE(offset) !== EOCD) continue;
		const commentLength = input.readUInt16LE(offset + 20);
		if (offset + 22 + commentLength !== bytes.byteLength) continue;
		if (input.readUInt16LE(offset + 4) !== 0 || input.readUInt16LE(offset + 6) !== 0)
			throw new SkillError("Multi-volume ZIP files are not supported");
		const localEntries = input.readUInt16LE(offset + 8);
		const entries = input.readUInt16LE(offset + 10);
		const centralSize = input.readUInt32LE(offset + 12);
		const centralOffset = input.readUInt32LE(offset + 16);
		if (entries !== localEntries || entries === 0xffff || centralOffset === 0xffffffff)
			throw new SkillError("ZIP64 and multi-volume archives are not supported");
		if (centralOffset + centralSize > offset)
			throw new SkillError("That ZIP file has invalid offsets");
		return { offset, entries, centralOffset, centralSize };
	}
	throw new SkillError("That file is not a valid ZIP archive");
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function directory(bytes: Uint8Array, end: ReturnType<typeof endRecord>): ZipEntry[] {
	if (end.entries > MAX_ARCHIVE_ENTRIES)
		throw new SkillError("A skill archive can contain up to 80 files");
	const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const output: ZipEntry[] = [];
	const seen = new Set<string>();
	let offset = end.centralOffset;
	for (let index = 0; index < end.entries; index++) {
		need(bytes, offset, 46);
		if (input.readUInt32LE(offset) !== CENTRAL)
			throw new SkillError("That ZIP file has an invalid directory");
		const flags = input.readUInt16LE(offset + 8);
		const method = input.readUInt16LE(offset + 10);
		const crc = input.readUInt32LE(offset + 16);
		const compressedSize = input.readUInt32LE(offset + 20);
		const plainSize = input.readUInt32LE(offset + 24);
		const filenameLength = input.readUInt16LE(offset + 28);
		const extraLength = input.readUInt16LE(offset + 30);
		const commentLength = input.readUInt16LE(offset + 32);
		const disk = input.readUInt16LE(offset + 34);
		const externalAttributes = input.readUInt32LE(offset + 38);
		const localOffset = input.readUInt32LE(offset + 42);
		if (
			disk !== 0 ||
			compressedSize === 0xffffffff ||
			plainSize === 0xffffffff ||
			localOffset === 0xffffffff
		)
			throw new SkillError("ZIP64 and multi-volume archives are not supported");
		const rawPath = readText(bytes, offset + 46, filenameLength);
		const folder = rawPath.endsWith("/");
		const path = normalizeSkillPath(folder ? rawPath.slice(0, -1) : rawPath);
		const unixMode = externalAttributes >>> 16;
		if ((unixMode & 0xf000) === 0xa000)
			throw new SkillError("Symbolic links cannot be imported as skill files");
		if (seen.has(path)) throw new SkillError(`The ZIP repeats ${path}`);
		seen.add(path);
		if (!folder) {
			if (flags & 0x1) throw new SkillError("Encrypted ZIP files are not supported");
			if (method !== 0 && method !== 8)
				throw new SkillError("That ZIP uses an unsupported compression method");
			output.push({ path, flags, method, compressedSize, plainSize, localOffset, crc });
		}
		offset += 46 + filenameLength + extraLength + commentLength;
		if (offset > end.centralOffset + end.centralSize)
			throw new SkillError("That ZIP directory is invalid");
	}
	if (offset !== end.centralOffset + end.centralSize)
		throw new SkillError("That ZIP directory is invalid");
	return output;
}

function fileContents(
	archive: Uint8Array,
	entry: ZipEntry,
	maxBytes: number,
	centralOffset: number,
): Uint8Array {
	if (entry.plainSize > maxBytes)
		throw new SkillError(`${entry.path} is larger than its size limit`, 413);
	const bytes = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
	const offset = entry.localOffset;
	need(archive, offset, 30);
	if (bytes.readUInt32LE(offset) !== LOCAL)
		throw new SkillError(`The ZIP entry ${entry.path} is invalid`);
	const flags = bytes.readUInt16LE(offset + 6);
	const method = bytes.readUInt16LE(offset + 8);
	const filenameLength = bytes.readUInt16LE(offset + 26);
	const extraLength = bytes.readUInt16LE(offset + 28);
	const localPath = readText(archive, offset + 30, filenameLength);
	if (localPath !== entry.path || flags !== entry.flags || method !== entry.method)
		throw new SkillError(`The ZIP entry ${entry.path} does not match its directory`);
	const start = offset + 30 + filenameLength + extraLength;
	const end = start + entry.compressedSize;
	if (end > centralOffset) throw new SkillError(`The ZIP entry ${entry.path} is out of bounds`);
	need(archive, start, entry.compressedSize);
	let plain: Uint8Array;
	try {
		plain =
			entry.method === 0
				? new Uint8Array(archive.subarray(start, end))
				: inflateRawSync(archive.subarray(start, end), { maxOutputLength: maxBytes });
	} catch {
		throw new SkillError(`The ZIP entry ${entry.path} could not be unpacked`);
	}
	if (plain.byteLength !== entry.plainSize || crc32(plain) !== entry.crc)
		throw new SkillError(`The ZIP entry ${entry.path} failed its integrity check`);
	return plain;
}

function text(bytes: Uint8Array, path: string): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new SkillError(`${path} must be a UTF-8 text file`);
	}
}

/** Read selected ZIP entries as data. The archive is never extracted onto disk. */
export async function importZip(bytes: Uint8Array, requestedPath?: string): Promise<ImportedSkill> {
	if (bytes.byteLength > MAX_ARCHIVE_BYTES)
		throw new SkillError("ZIP files must be 8 MB or smaller", 413);
	const location = endRecord(bytes);
	const entries = directory(bytes, location);
	let markdownPath: string | undefined;
	if (requestedPath?.trim()) {
		const folder = normalizeSkillPath(requestedPath.trim());
		markdownPath = entries.find((entry) => entry.path === `${folder}/SKILL.md`)?.path;
		if (!markdownPath) throw new SkillError("That folder in the archive has no SKILL.md");
	} else {
		const candidates = entries
			.map((entry) => entry.path)
			.filter((entry) => entry === "SKILL.md" || entry.endsWith("/SKILL.md"));
		if (candidates.length !== 1)
			throw new SkillError(
				candidates.length === 0
					? "The archive has no SKILL.md"
					: "This archive has several skills; upload one skill folder at a time",
			);
		markdownPath = candidates[0];
	}
	if (!markdownPath) throw new SkillError("The archive has no SKILL.md");
	const prefix = markdownPath === "SKILL.md" ? "" : markdownPath.slice(0, -"/SKILL.md".length);
	const selected = entries
		.filter((entry) => (prefix ? entry.path.startsWith(`${prefix}/`) : true))
		.filter((entry) => entry.path !== markdownPath && !entry.path.endsWith("/SKILL.md"));
	const skillMarkdown = text(
		fileContents(
			bytes,
			entries.find((entry) => entry.path === markdownPath)!,
			48 * 1024,
			location.centralOffset,
		),
		"SKILL.md",
	);
	parseSkillMarkdown(skillMarkdown);
	const files = selected.map((entry) => ({
		path: prefix ? entry.path.slice(prefix.length + 1) : entry.path,
		content: text(fileContents(bytes, entry, 16 * 1024, location.centralOffset), entry.path),
	}));
	return { skillMarkdown, files: validateSkillFiles(files) };
}

type ImportedSkill = { skillMarkdown: string; files: SkillFile[] };

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
	if (!response.body) throw new SkillError("That repository archive could not be downloaded", 502);
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) throw new SkillError("GitHub skill archives must be 8 MB or smaller", 413);
			chunks.push(value);
		}
	} catch (cause) {
		await reader.cancel().catch(() => undefined);
		throw cause;
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function githubRepository(value: string): { owner: string; repository: string } {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new SkillError("Enter a public GitHub repository URL");
	}
	if (
		url.protocol !== "https:" ||
		url.hostname !== "github.com" ||
		url.port ||
		url.username ||
		url.password
	)
		throw new SkillError("Only public HTTPS GitHub repository URLs are supported");
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts.length !== 2 || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0] ?? ""))
		throw new SkillError("Enter a GitHub repository URL, such as https://github.com/team/skill");
	const repository = (parts[1] ?? "").replace(/\.git$/, "");
	if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repository))
		throw new SkillError("That repository URL is not valid");
	return { owner: parts[0] ?? "", repository };
}

/** Fetch a public GitHub archive as inert data; no repository commands, hooks or files are run. */
export async function importGitRepository(
	value: string,
	requestedPath?: string,
): Promise<ImportedSkill> {
	const { owner, repository } = githubRepository(value);
	const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
	const headers = { Accept: "application/vnd.github+json", "User-Agent": "Grid Runner" };
	const metadata = await fetch(base, {
		headers,
		redirect: "error",
		signal: AbortSignal.timeout(15_000),
	});
	if (!metadata.ok) throw new SkillError("That public repository could not be found", 404);
	const details = (await metadata.json().catch(() => null)) as { default_branch?: unknown } | null;
	if (typeof details?.default_branch !== "string" || details.default_branch.length > 200)
		throw new SkillError("That repository does not have a default branch");
	const archive = await fetch(`${base}/zipball/${encodeURIComponent(details.default_branch)}`, {
		headers,
		redirect: "manual",
		signal: AbortSignal.timeout(15_000),
	});
	const location = archive.headers.get("location");
	if (archive.status < 300 || archive.status >= 400 || !location)
		throw new SkillError("GitHub did not provide an archive for that repository", 502);
	let target: URL;
	try {
		target = new URL(location, base);
	} catch {
		throw new SkillError("GitHub returned an invalid archive address", 502);
	}
	if (target.protocol !== "https:" || target.hostname !== "codeload.github.com" || target.port)
		throw new SkillError("GitHub returned an unexpected archive address", 502);
	const response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new SkillError("That repository archive could not be downloaded", 502);
	const length = Number(response.headers.get("content-length"));
	if (Number.isFinite(length) && length > MAX_ARCHIVE_BYTES)
		throw new SkillError("GitHub skill archives must be 8 MB or smaller", 413);
	return importZip(await readBounded(response, MAX_ARCHIVE_BYTES), requestedPath);
}
