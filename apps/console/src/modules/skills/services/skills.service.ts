import { runnerCall } from "@/lib/runner-client";
import { workspaceHeaders } from "@/lib/active-workspace";

import type { Skill, SkillFile, SkillsView, SkillScope } from "../types/skill.types";

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

async function upload(token: string, form: FormData): Promise<Skill> {
	let response: Response;
	try {
		response = await fetch(`${window.location.origin}/runner/skills/import/upload`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				...workspaceHeaders(),
			},
			body: form,
		});
	} catch {
		throw new Error("The runner is not reachable");
	}
	const result = (await response.json().catch(() => null)) as {
		data?: Skill;
		message?: string;
	} | null;
	if (!response.ok || !result?.data)
		throw new Error(result?.message ?? "The skill could not be uploaded");
	return result.data;
}

export const skillsService = {
	view: (token: string) => runnerCall<SkillsView>("/skills", token),
	write: (token: string, input: { skillMarkdown: string; scope: SkillScope }) =>
		runnerCall<Skill>("/skills", token, json({ ...input, source: { type: "written" } })),
	fromGit: (token: string, input: { url: string; path?: string; scope: SkillScope }) =>
		runnerCall<Skill>("/skills/import/git", token, json(input)),
	uploadFolder: (token: string, input: { files: File[]; paths: string[]; scope: SkillScope }) => {
		const form = new FormData();
		form.set("scope", JSON.stringify(input.scope));
		form.set("paths", JSON.stringify(input.paths));
		input.files.forEach((file) => form.append("files", file, file.name));
		return upload(token, form);
	},
	uploadArchive: (token: string, archive: File, scope: SkillScope, path?: string) => {
		const form = new FormData();
		form.set("scope", JSON.stringify(scope));
		form.set("archive", archive, archive.name);
		if (path) form.set("path", path);
		return upload(token, form);
	},
	update: (
		token: string,
		id: string,
		patch: { enabled?: boolean; skillMarkdown?: string; files?: SkillFile[]; scope?: SkillScope },
	) =>
		runnerCall<Skill>(`/skills/${encodeURIComponent(id)}`, token, {
			method: "PATCH",
			body: JSON.stringify(patch),
		}),
	remove: (token: string, id: string) =>
		runnerCall<void>(`/skills/${encodeURIComponent(id)}`, token, { method: "DELETE" }),
};
