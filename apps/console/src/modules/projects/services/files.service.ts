import { runnerCall, RunnerError } from "@/lib/runner-client";
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
	/** Of `text`, the version a save is based on; null when there is no text. */
	hash: string | null;
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
	/**
	 * Saves an edit onto the version of the file that was read. A refusal because the file
	 * changed on disk since comes back as a `FileConflictError`, so the console can offer a
	 * reload or an overwrite instead of quietly losing someone's work.
	 */
	save: (token: string, project: string, path: string, text: string, base: string) =>
		runnerCall<ProjectFileContent>(
			`${placementsStore.scopeOf(project)}/projects/files/${project}/content`,
			token,
			{ method: "PUT", body: JSON.stringify({ path, text, base }) },
		).catch((cause: unknown) => {
			throw cause instanceof RunnerError && cause.status === STALE_SAVE
				? new FileConflictError(cause.message)
				: cause;
		}),
};

/** The runner's status for "this file is no longer the version you read". */
const STALE_SAVE = 409;

/** A save refused because the file on disk is no longer the version the edit was based on. */
export class FileConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FileConflictError";
	}
}

/** Whether a save failed because the file changed underneath it. */
export function isFileConflict(cause: unknown): cause is FileConflictError {
	return cause instanceof FileConflictError;
}
