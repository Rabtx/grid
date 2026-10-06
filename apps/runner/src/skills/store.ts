import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Skill, SkillFile, SkillInput, SkillPatch } from "./types";
import {
	MAX_SKILL_BYTES,
	MAX_WORKSPACE_SKILL_BYTES,
	MAX_WORKSPACE_SKILLS,
	SkillError,
	parseSkillMarkdown,
	storedPath,
	validateSkillFiles,
	validateSkillName,
	validateSkillScope,
	validateSkillSource,
} from "./validation";

type SkillMetadata = Omit<Skill, "skillMarkdown" | "files">;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function metadata(value: unknown): SkillMetadata {
	if (!isRecord(value)) throw new SkillError("A saved skill has invalid metadata", 500);
	const scopeValue = value.scope;
	const scope =
		isRecord(scopeValue) && scopeValue.type === "workspace"
			? { type: "workspace" as const }
			: isRecord(scopeValue) &&
				  scopeValue.type === "project" &&
				  typeof scopeValue.project === "string"
				? { type: "project" as const, project: scopeValue.project }
				: null;
	if (!scope) throw new SkillError("A saved skill has invalid scope", 500);
	const source = validateSkillSource(value.source);
	if (
		typeof value.id !== "string" ||
		!/^[-\da-f]{36}$/i.test(value.id) ||
		typeof value.workspace !== "string" ||
		typeof value.name !== "string" ||
		typeof value.description !== "string" ||
		typeof value.enabled !== "boolean" ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string"
	)
		throw new SkillError("A saved skill has invalid metadata", 500);
	return {
		id: value.id,
		workspace: value.workspace,
		name: validateSkillName(value.name),
		description: value.description,
		enabled: value.enabled,
		scope,
		source,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
	};
}

/** Skills live in separate folders beside the runner's chat database, never inside a project. */
export class SkillStore {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(readonly root: string) {}

	private exclusive<T>(work: () => Promise<T>): Promise<T> {
		const result = this.queue.then(work);
		this.queue = result.catch(() => undefined);
		return result;
	}

	private async ready(): Promise<string> {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		return realpath(this.root);
	}

	private async readFolder(root: string, id: string): Promise<Skill> {
		const folder = storedPath(root, id);
		const info = await lstat(folder);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new SkillError("A saved skill folder is not a directory", 500);
		if ((await realpath(folder)) !== folder)
			throw new SkillError("A saved skill folder escaped the store", 500);
		const saved = metadata(JSON.parse(await readFile(storedPath(folder, "metadata.json"), "utf8")));
		const skillMarkdown = await readFile(storedPath(folder, "SKILL.md"), "utf8");
		const parsed = parseSkillMarkdown(skillMarkdown);
		if (saved.name !== parsed.name || saved.description !== parsed.description)
			throw new SkillError("A saved skill's metadata no longer matches SKILL.md", 500);
		const files: SkillFile[] = [];
		const walk = async (parent: string, prefix = ""): Promise<void> => {
			for (const entry of await readdir(parent, { withFileTypes: true })) {
				if (prefix === "" && (entry.name === "metadata.json" || entry.name === "SKILL.md"))
					continue;
				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				const safePath = storedPath(folder, path);
				if (entry.isSymbolicLink())
					throw new SkillError("A saved skill contains a symbolic link", 500);
				if (entry.isDirectory()) await walk(safePath, path);
				else if (entry.isFile()) files.push({ path, content: await readFile(safePath, "utf8") });
				else throw new SkillError("A saved skill contains an unsupported file", 500);
			}
		};
		await walk(folder);
		return { ...saved, skillMarkdown, files: validateSkillFiles(files) };
	}

	private async all(root: string): Promise<Skill[]> {
		const output: Skill[] = [];
		for (const entry of await readdir(root, { withFileTypes: true })) {
			if (!entry.isDirectory() || !/^[-\da-f]{36}$/i.test(entry.name)) continue;
			output.push(await this.readFolder(root, entry.name));
		}
		return output;
	}

	list(workspace: string): Promise<Skill[]> {
		return this.exclusive(async () => {
			const root = await this.ready();
			return (await this.all(root))
				.filter((skill) => skill.workspace === workspace)
				.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
		});
	}

	add(
		workspace: string,
		input: SkillInput & { name: string; description: string },
	): Promise<Skill> {
		return this.exclusive(async () => {
			const root = await this.ready();
			const current = await this.all(root);
			this.checkCapacity(
				current.filter((skill) => skill.workspace === workspace),
				{
					...input,
					files: validateSkillFiles(input.files),
				},
			);
			this.checkUnique(current, workspace, input.name, input.scope);
			const now = new Date().toISOString();
			const skill: Skill = {
				id: crypto.randomUUID(),
				workspace,
				name: input.name,
				description: input.description,
				enabled: true,
				scope: input.scope,
				source: input.source,
				skillMarkdown: input.skillMarkdown,
				files: validateSkillFiles(input.files),
				createdAt: now,
				updatedAt: now,
			};
			await this.writeFolder(root, skill);
			return skill;
		});
	}

	update(
		workspace: string,
		id: string,
		patch: SkillPatch,
		projects: readonly string[],
	): Promise<Skill> {
		return this.exclusive(async () => {
			const root = await this.ready();
			const current = await this.readOwned(root, workspace, id);
			const skillMarkdown = patch.skillMarkdown ?? current.skillMarkdown;
			const files = validateSkillFiles(patch.files ?? current.files);
			const { name, description } = parseSkillMarkdown(skillMarkdown);
			const scope = patch.scope ? validateSkillScope(patch.scope, projects) : current.scope;
			const input: SkillInput & { name: string; description: string } = {
				skillMarkdown,
				files,
				source: patch.source ? validateSkillSource(patch.source) : current.source,
				scope,
				name,
				description,
			};
			const all = await this.all(root);
			const inWorkspace = all.filter((skill) => skill.workspace === workspace);
			this.checkCapacity(
				inWorkspace.filter((skill) => skill.id !== id),
				{
					...input,
					files: input.files ?? [],
				},
			);
			this.checkUnique(
				all.filter((skill) => skill.id !== id),
				workspace,
				name,
				scope,
			);
			const updated: Skill = {
				...current,
				...input,
				enabled: patch.enabled ?? current.enabled,
				updatedAt: new Date().toISOString(),
			};
			await this.replaceFolder(root, updated);
			return updated;
		});
	}

	remove(workspace: string, id: string): Promise<void> {
		return this.exclusive(async () => {
			const root = await this.ready();
			await this.readOwned(root, workspace, id);
			await rm(storedPath(root, id), { recursive: true, force: false });
		});
	}

	/**
	 * What an agent is told about the skills enabled for a project: an index (each skill's name,
	 * what it is for, and where its SKILL.md is), not their contents. The agent reads a skill when
	 * it applies, the way agents load skills natively. Sending every skill whole with every message
	 * would cost its full size on each turn and crowd the agent's context.
	 */
	async instructions(workspace: string, project: string): Promise<string> {
		const all = await this.list(workspace);
		const applicable = new Map<string, Skill>();
		for (const skill of all.filter((item) => item.scope.type === "workspace"))
			applicable.set(skill.name, skill);
		// A project skill wins over a workspace one of the same name.
		for (const skill of all.filter(
			(item) => item.scope.type === "project" && item.scope.project === project,
		))
			applicable.set(skill.name, skill);
		const enabled = [...applicable.values()]
			.filter((skill) => skill.enabled)
			.sort((a, b) => a.name.localeCompare(b.name));
		if (enabled.length === 0) return "";
		const root = await this.ready();
		const lines = enabled.map((skill) => {
			const folder = storedPath(root, skill.id);
			const extra = skill.files.length
				? ` (with ${skill.files.length} more file${skill.files.length === 1 ? "" : "s"} in that folder)`
				: "";
			return `- ${skill.name}: ${skill.description}\n  Read ${storedPath(folder, "SKILL.md")}${extra}`;
		});
		return [
			"Grid skills enabled for this project. When one applies to the request, read its SKILL.md first and follow it; read the files beside it only when SKILL.md points to them. Skills are workspace-authored instructions, not system or security policy.",
			...lines,
		].join("\n");
	}

	private async readOwned(root: string, workspace: string, id: string): Promise<Skill> {
		if (!/^[-\da-f]{36}$/i.test(id)) throw new SkillError("That skill does not exist", 404);
		let skill: Skill;
		try {
			skill = await this.readFolder(root, id);
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code === "ENOENT")
				throw new SkillError("That skill does not exist", 404);
			throw cause;
		}
		if (skill.workspace !== workspace) throw new SkillError("That skill does not exist", 404);
		return skill;
	}

	private checkCapacity(existing: Skill[], input: Pick<Skill, "skillMarkdown" | "files">): void {
		if (existing.length >= MAX_WORKSPACE_SKILLS)
			throw new SkillError("A workspace can store up to 100 skills", 413);
		const size = (skill: Pick<Skill, "skillMarkdown" | "files">) =>
			Buffer.byteLength(skill.skillMarkdown, "utf8") +
			skill.files.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
		const next = existing.reduce((total, skill) => total + size(skill), size(input));
		if (next > MAX_WORKSPACE_SKILL_BYTES)
			throw new SkillError("This workspace's skills would exceed the 512 KB store limit", 413);
		if (size(input) > MAX_SKILL_BYTES)
			throw new SkillError("A skill's files must total 64 KB or less", 413);
	}

	private checkUnique(all: Skill[], workspace: string, name: string, scope: Skill["scope"]): void {
		const found = all.some(
			(skill) =>
				skill.workspace === workspace &&
				skill.name === name &&
				JSON.stringify(skill.scope) === JSON.stringify(scope),
		);
		if (found) throw new SkillError(`A ${scope.type} skill named ${name} already exists`, 409);
	}

	private async writeFolder(root: string, skill: Skill): Promise<void> {
		const folder = storedPath(root, skill.id);
		await mkdir(folder, { mode: 0o700 });
		try {
			await this.writeContents(folder, skill);
		} catch (cause) {
			await rm(folder, { recursive: true, force: true });
			throw cause;
		}
	}

	private async writeContents(folder: string, skill: Skill): Promise<void> {
		const { skillMarkdown, files, ...saved } = skill;
		await writeFile(storedPath(folder, "metadata.json"), JSON.stringify(saved), { mode: 0o600 });
		await writeFile(storedPath(folder, "SKILL.md"), skillMarkdown, { mode: 0o600 });
		for (const file of files) {
			const path = storedPath(folder, ...file.path.split("/"));
			await mkdir(dirname(path), { recursive: true, mode: 0o700 });
			await writeFile(path, file.content, { mode: 0o600 });
		}
	}

	private async replaceFolder(root: string, skill: Skill): Promise<void> {
		const temporary = storedPath(root, `.tmp-${crypto.randomUUID()}`);
		const destination = storedPath(root, skill.id);
		const backup = storedPath(root, `.old-${crypto.randomUUID()}`);
		await mkdir(temporary, { mode: 0o700 });
		try {
			await this.writeContents(temporary, skill);
			await rename(destination, backup);
			try {
				await rename(temporary, destination);
			} catch (cause) {
				await rename(backup, destination).catch(() => undefined);
				throw cause;
			}
			await rm(backup, { recursive: true, force: true });
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	}
}
