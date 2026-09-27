import { runnerCall } from "@/lib/runner-client";
import { placementsStore } from "@/modules/environments";

export type ProjectFile = { name: string; path: string; kind: "file" | "folder" };
export type ProjectFileListing = { path: string; entries: ProjectFile[] };
/** One file to read; `text` is null when it is binary or too large to show. */
export type ProjectFileContent = {
	path: string;
	name: string;
	size: number;
	text: string | null;
	binary: boolean;
	tooLarge: boolean;
};

/** A project's files, on whichever machine the project runs. */
export const filesService = {
	list: (token: string, project: string, path: string) =>
		runnerCall<ProjectFileListing>(
			`${placementsStore.scopeOf(project)}/projects/files/${project}?path=${encodeURIComponent(path)}`,
			token,
		),
	read: (token: string, project: string, path: string) =>
		runnerCall<ProjectFileContent>(
			`${placementsStore.scopeOf(project)}/projects/files/${project}/content?path=${encodeURIComponent(path)}`,
			token,
		),
	create: (token: string, project: string, path: string, name: string, kind: ProjectFile["kind"]) =>
		runnerCall<ProjectFile>(
			`${placementsStore.scopeOf(project)}/projects/files/${project}`,
			token,
			{
				method: "POST",
				body: JSON.stringify({ path, name, kind }),
			},
		),
	search: (token: string, project: string, query = "") =>
		runnerCall<string[]>(
			`${placementsStore.scopeOf(project)}/projects/files/${project}/search?q=${encodeURIComponent(query)}`,
			token,
		),
};
