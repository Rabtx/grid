import { runnerCall } from "@/lib/runner-client";

export type ProjectFile = { name: string; path: string; kind: "file" | "folder" };
export type ProjectFileListing = { path: string; entries: ProjectFile[] };

export const filesService = {
	list: (token: string, project: string, path: string) =>
		runnerCall<ProjectFileListing>(
			`/projects/files/${project}?path=${encodeURIComponent(path)}`,
			token,
		),
	create: (token: string, project: string, path: string, name: string, kind: ProjectFile["kind"]) =>
		runnerCall<ProjectFile>(`/projects/files/${project}`, token, {
			method: "POST",
			body: JSON.stringify({ path, name, kind }),
		}),
};
