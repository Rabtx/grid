/**
 * A path the agent reported, relative to the project's folder: as given when already relative,
 * with the folder taken off when it is inside it, null when it is somewhere else.
 */
export function insideFolder(folder: string, path: string): string | null {
	if (!path.startsWith("/")) return path.replace(/^\.\//, "") || null;
	const root = folder.endsWith("/") ? folder : `${folder}/`;
	return path.startsWith(root) && path.length > root.length ? path.slice(root.length) : null;
}

/** The last part of a path, for a tab's label. */
export function baseName(path: string): string {
	return path.split("/").filter(Boolean).pop() ?? path;
}
