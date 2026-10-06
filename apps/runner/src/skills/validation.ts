import { isAbsolute, relative, resolve, sep } from "node:path";

import type { SkillFile, SkillInput, SkillScope, SkillSource } from "./types";

export const MAX_SKILL_FILES = 20;
export const MAX_SKILL_BYTES = 64 * 1024;
export const MAX_MARKDOWN_BYTES = 48 * 1024;
export const MAX_WORKSPACE_SKILL_BYTES = 512 * 1024;
export const MAX_WORKSPACE_SKILLS = 100;

export class SkillError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
		this.name = "SkillError";
	}
}

export function validateSkillName(value: string): string {
	const name = value.trim();
	if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
		throw new SkillError("Skill names must use lowercase letters, numbers and single hyphens");
	return name;
}

function scalar(value: string): string {
	const text = value.trim();
	if (text.startsWith('"')) {
		try {
			const parsed: unknown = JSON.parse(text);
			if (typeof parsed === "string") return parsed;
		} catch {
			throw new SkillError("The skill description has invalid quotes");
		}
	}
	if (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
		return text.slice(1, -1).replaceAll("''", "'");
	return text;
}

export function parseSkillMarkdown(markdown: string): { name: string; description: string } {
	if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES)
		throw new SkillError("SKILL.md must be 48 KB or smaller", 413);
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
	if (!match) throw new SkillError("SKILL.md needs frontmatter with name and description");
	const fields = new Map<string, string>();
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const item = /^([a-z][a-z0-9_-]*):\s*(.*)$/.exec(line);
		if (!item) continue;
		if (item[1] === "name" || item[1] === "description") fields.set(item[1], scalar(item[2] ?? ""));
	}
	const nameValue = fields.get("name");
	const description = fields.get("description")?.trim();
	if (!nameValue) throw new SkillError("SKILL.md needs a name in its frontmatter");
	if (!description || description.length > 300)
		throw new SkillError("SKILL.md needs a description of 300 characters or fewer");
	return { name: validateSkillName(nameValue), description };
}

export function normalizeSkillPath(value: string): string {
	if (!value || value.includes("\\") || value.startsWith("/") || value.includes("\0"))
		throw new SkillError("Skill file paths must be relative to the skill folder");
	const parts = value.split("/");
	if (
		parts.some(
			(part) =>
				!part ||
				part === "." ||
				part === ".." ||
				part.startsWith("-") ||
				part.length > 128 ||
				// Control characters on purpose: they have no place in a file name.
				// oxlint-disable-next-line no-control-regex
				/[<>:"|?*\x00-\x1f]/.test(part),
		)
	)
		throw new SkillError("Skill file paths contain an unsafe name");
	if (parts[0]?.toLowerCase() === ".git")
		throw new SkillError("Git metadata cannot be added as a skill file");
	return parts.join("/");
}

export function validateSkillFiles(files: readonly SkillFile[] = []): SkillFile[] {
	if (files.length > MAX_SKILL_FILES)
		throw new SkillError("A skill can contain up to 20 extra files");
	const seen = new Set<string>();
	let total = 0;
	const checked = files.map((file) => {
		if (!file || typeof file.path !== "string" || typeof file.content !== "string")
			throw new SkillError("Skill files need a relative path and text content");
		const path = normalizeSkillPath(file.path);
		if (path.toLowerCase() === "skill.md") throw new SkillError("SKILL.md is provided separately");
		if (path.toLowerCase() === "metadata.json")
			throw new SkillError("metadata.json is reserved by the runner skill store");
		if (seen.has(path)) throw new SkillError(`Duplicate skill file: ${path}`);
		seen.add(path);
		const size = Buffer.byteLength(file.content, "utf8");
		if (size > 16 * 1024) throw new SkillError(`${path} must be 16 KB or smaller`, 413);
		total += size;
		return { path, content: file.content };
	});
	if (
		total + Buffer.byteLength(checked.map((file) => file.path).join(""), "utf8") >
		MAX_SKILL_BYTES
	)
		throw new SkillError("A skill's files must total 64 KB or less", 413);
	return checked.sort((a, b) => a.path.localeCompare(b.path));
}

export function validateSkillScope(value: unknown, projects: readonly string[]): SkillScope {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new SkillError("Choose workspace or project scope");
	const input = value as Record<string, unknown>;
	if (input.type === "workspace") return { type: "workspace" };
	if (
		input.type === "project" &&
		typeof input.project === "string" &&
		projects.includes(input.project)
	)
		return { type: "project", project: input.project };
	throw new SkillError("Choose a project linked to this workspace");
}

export function validateSkillSource(value: unknown): SkillSource {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new SkillError("Say where this skill came from");
	const input = value as Record<string, unknown>;
	if (input.type === "written") return { type: "written", label: "Written in Grid" };
	if (input.type === "upload") {
		const label =
			typeof input.label === "string" ? input.label.trim().slice(0, 120) : "Uploaded folder";
		return { type: "upload", label: label || "Uploaded folder" };
	}
	if (input.type === "git" && typeof input.url === "string") {
		const url = input.url.trim();
		return { type: "git", label: url.replace(/^https:\/\//, ""), url };
	}
	throw new SkillError("That skill source is not supported");
}

export function validateSkillInput(
	value: unknown,
	projects: readonly string[],
): SkillInput & { name: string; description: string; files: SkillFile[] } {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new SkillError("Send a skill to save");
	const input = value as Record<string, unknown>;
	if (typeof input.skillMarkdown !== "string") throw new SkillError("SKILL.md is required");
	const { name, description } = parseSkillMarkdown(input.skillMarkdown);
	const files = validateSkillFiles(Array.isArray(input.files) ? (input.files as SkillFile[]) : []);
	return {
		skillMarkdown: input.skillMarkdown,
		files,
		source: validateSkillSource(input.source),
		scope: validateSkillScope(input.scope, projects),
		name,
		description,
	};
}

/** Defense in depth before any supplied path is joined to the runner's store. */
export function storedPath(root: string, ...parts: string[]): string {
	const base = resolve(root);
	const result = resolve(base, ...parts);
	const fromRoot = relative(base, result);
	if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
		throw new SkillError("Skill path is outside the runner store", 400);
	return result;
}
