import { runnerCall } from "@/lib/runner-client";

export type FolderEntry = { name: string; path: string; git: boolean };

export type FolderListing = {
	path: string;
	parent: string | null;
	home: string;
	folders: FolderEntry[];
};

/**
 * Folders on a machine, and which one holds each project's code there. `scope` picks the
 * machine: empty for this one, `/env/<id>` for an environment (see `placementsStore`).
 */
export const foldersService = {
	list: (token: string, path?: string, scope = "") =>
		runnerCall<FolderListing>(
			`${scope}/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ""}`,
			token,
		),
	inspect: (token: string, path: string, scope = "") =>
		runnerCall<{ path: string; name: string; repoUrl: string | null }>(
			`${scope}/fs/inspect?path=${encodeURIComponent(path)}`,
			token,
		),
	projectFolders: (token: string, scope = "") =>
		runnerCall<Record<string, string>>(`${scope}/projects/folders`, token),
	link: (token: string, project: string, path: string, scope = "") =>
		runnerCall<void>(`${scope}/projects/folders/${project}`, token, {
			method: "PUT",
			body: JSON.stringify({ path }),
		}),
};
