import { runnerCall } from "@/lib/runner-client";

export type FolderEntry = { name: string; path: string; git: boolean };

export type FolderListing = {
	path: string;
	parent: string | null;
	home: string;
	folders: FolderEntry[];
};

/** Folders on the machine Grid runs on, and which one holds each project's code. */
export const foldersService = {
	list: (token: string, path?: string) =>
		runnerCall<FolderListing>(
			`/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ""}`,
			token,
		),
	inspect: (token: string, path: string) =>
		runnerCall<{ path: string; name: string; repoUrl: string | null }>(
			`/fs/inspect?path=${encodeURIComponent(path)}`,
			token,
		),
	projectFolders: (token: string) => runnerCall<Record<string, string>>("/projects/folders", token),
	link: (token: string, project: string, path: string) =>
		runnerCall<void>(`/projects/folders/${project}`, token, {
			method: "PUT",
			body: JSON.stringify({ path }),
		}),
};
