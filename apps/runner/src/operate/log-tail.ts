import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readSync,
	realpathSync,
} from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { OperateError } from "./service";

const MAX_BYTES = 65_536;
const MAX_LINES = 200;
const denied =
	/(?:credentials?|secrets?|tokens?|password|passwd|private[-_]?key|id[-_]?(?:rsa|dsa|ecdsa|ed25519)|\.pem|\.key)(?:[._-]|$)/i;
const controls = (value: string) =>
	Array.from(value).some(
		(char) => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159),
	);
export function logPath(path: string): string {
	if (!path || path.length > 1_024 || isAbsolute(path) || path.includes("\\") || controls(path))
		throw new OperateError("Give a project-relative .log path");
	const parts = path.split("/");
	if (
		!path.endsWith(".log") ||
		parts.some((part) => !part || part.startsWith(".") || denied.test(part))
	)
		throw new OperateError("Give a visible, non-credential .log path");
	return path;
}
function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return !!rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../");
}
/** Remove terminal escapes and common credential formats before any log bytes leave the runner. */
export function redactLog(value: string): string {
	const printable = Array.from(stripVTControlCharacters(value))
		.filter(
			(char) =>
				char === "\n" ||
				char === "\t" ||
				(char.charCodeAt(0) >= 32 && !(char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)),
		)
		.join("");
	return (
		printable
			.replace(/^.*?-----END [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----/s, "[REDACTED PEM]")
			.replace(
				/-----BEGIN [A-Z0-9 ]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?(?:-----END [A-Z0-9 ]*-----|$)/g,
				"[REDACTED PEM]",
			)
			.replace(/^[A-Za-z0-9+/]{32,}={0,2}$/gm, "[REDACTED KEY MATERIAL]")
			.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [REDACTED]")
			// A value can be two words on its line ("token: Bearer x"), never the start of the next line.
			.replace(
				/(["']?(?:[\w-]*(?:password|passwd|secret|token|(?:api|access|private)[_-]?key)[\w-]*|pwd|authorization|cookie|set-cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|[^\s,;]+(?:[ \t]+[^\s,;]+)?)/gi,
				"$1[REDACTED]",
			)
			.replace(
				/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
				"[REDACTED]",
			)
			.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
	);
}

export type LogTail = {
	text: string;
	truncated: boolean;
	bytes: number;
	lines: number;
	readAt: string;
};
/** Linux opened-file validation fails closed elsewhere. The hook exists only for deterministic race tests. */
export function readLogTail(
	folder: string,
	path: string,
	atBoundary?: (phase: "validated" | "opened" | "read") => void,
): LogTail {
	logPath(path);
	if (process.platform !== "linux")
		throw new OperateError("Safe log reading requires a Linux runner");
	let fd: number | undefined;
	try {
		const root = realpathSync(folder);
		const rootStat = lstatSync(root);
		const candidate = join(root, path);
		let parent = root;
		for (const part of path.split("/")) {
			parent = join(parent, part);
			if (lstatSync(parent).isSymbolicLink())
				throw new OperateError("Log paths cannot contain symbolic links");
		}
		atBoundary?.("validated");
		fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		atBoundary?.("opened");
		const stat = fstatSync(fd);
		if (!stat.isFile()) throw new OperateError("Choose a regular .log file");
		const verify = () => {
			const opened = realpathSync(`/proc/self/fd/${fd}`);
			const current = lstatSync(candidate);
			const currentRoot = lstatSync(realpathSync(folder));
			if (
				!inside(root, opened) ||
				relative(root, opened) !== path ||
				current.isSymbolicLink() ||
				current.dev !== stat.dev ||
				current.ino !== stat.ino ||
				currentRoot.dev !== rootStat.dev ||
				currentRoot.ino !== rootStat.ino
			)
				throw new OperateError("The log file changed; retry the read", 409);
		};
		verify();
		const start = Math.max(0, stat.size - MAX_BYTES);
		const buffer = Buffer.alloc(Math.min(MAX_BYTES, stat.size));
		let bytes = 0;
		while (bytes < buffer.length) {
			const count = readSync(fd, buffer, bytes, buffer.length - bytes, start + bytes);
			if (!count) break;
			bytes += count;
		}
		atBoundary?.("read");
		verify();
		let raw = buffer.subarray(0, bytes);
		if (start > 0) {
			const newline = raw.indexOf(10);
			raw = newline < 0 ? raw.subarray(raw.length) : raw.subarray(newline + 1);
		}
		let decoded: string;
		try {
			decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
		} catch {
			throw new OperateError("Choose a UTF-8 text log");
		}
		if (Array.from(decoded).some((char) => char.charCodeAt(0) === 0 || char.charCodeAt(0) < 9))
			throw new OperateError("Choose a UTF-8 text log");
		// Redact before line limiting so PEM headers outside the last 200 lines still protect keys.
		const sanitized = redactLog(decoded).replace(/\r/g, "");
		const lines = sanitized ? sanitized.replace(/\n$/, "").split("\n") : [];
		const latest = lines.slice(-MAX_LINES);
		return {
			text: latest.join("\n"),
			truncated: start > 0 || lines.length > MAX_LINES,
			bytes,
			lines: latest.length,
			readAt: new Date().toISOString(),
		};
	} catch (cause) {
		if (cause instanceof OperateError) throw cause;
		const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : "";
		if (code === "ENOENT" || code === "ENOTDIR") throw new OperateError("Log file not found", 404);
		if (code === "EACCES" || code === "EPERM")
			throw new OperateError("The runner cannot read this log", 403);
		throw new OperateError("The log file cannot be read safely");
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}
