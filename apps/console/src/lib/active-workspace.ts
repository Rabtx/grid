/**
 * The workspace this device is working in, by slug; null means the person's default one. It is
 * read once at startup and changed only by switching, which reloads the console — every store,
 * cache and socket then starts over in the new workspace instead of each one having to follow.
 */
const STORAGE_KEY = "grid.workspace";

function readStored(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		// Blocked storage: the default workspace.
		return null;
	}
}

const active = readStored();

/** The chosen workspace's slug, or null for the default one. */
export function activeWorkspace(): string | null {
	return active;
}

/** Remember a workspace (null: the default) for the next start; callers then reload. */
export function rememberWorkspace(slug: string | null): void {
	try {
		if (slug) localStorage.setItem(STORAGE_KEY, slug);
		else localStorage.removeItem(STORAGE_KEY);
		// The last project used belongs to the workspace being left.
		localStorage.removeItem("grid.project");
	} catch {
		// Not remembered; the console opens the default workspace next time.
	}
}

/** An API path in the active workspace: `/projects` → `/workspaces/acme/projects`. */
export function inWorkspace(path: string): string {
	return active ? `/workspaces/${encodeURIComponent(active)}${path}` : path;
}

/** The header the runner reads the workspace from; empty for the default one. */
export function workspaceHeaders(): Record<string, string> {
	return active ? { "X-Grid-Workspace": active } : {};
}

/** The `workspace` field of a runner socket's hello; empty for the default one. */
export function workspaceHello(): { workspace?: string } {
	return active ? { workspace: active } : {};
}
