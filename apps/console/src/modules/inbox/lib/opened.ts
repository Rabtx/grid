/**
 * The page an inbox item waits on, or null. A console path with any workspace already taken off:
 * a thread, or a project's pull requests (the pull request open inside it, or the project itself).
 * Arriving there is what reading it means, so the item goes read.
 */
export function waitedOn(path: string): string | null {
	const [, section, project, id] = path.split("/");
	if (section === "chat" && project && id) return `/chat/${project}/${id}`;
	if (section === "pulls" && project) return `/pulls/${project}`;
	return null;
}
