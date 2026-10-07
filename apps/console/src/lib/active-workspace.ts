/**
 * The workspace the console is working in. Its slug leads every signed-in URL (`/acme/board/web`),
 * so a link says which workspace it belongs to; the last one used is also remembered on the
 * device, so `/` and old links without a workspace open there. It is read once at startup:
 * switching loads the new workspace's URL, and every store, cache and socket starts over in it.
 */
const STORAGE_KEY = "grid.workspace";

/**
 * Top-level pages that belong to no workspace: signing in, first-run setup, invites, the kit, and
 * where a connector's sign-in comes back to.
 */
const OUTSIDE = new Set(["login", "setup", "invite", "magic-link", "dev", "design", "oauth"]);
/** The console's own sections, as links from before workspaces spelled them. */
const SECTIONS = new Set([
	"chat",
	"board",
	"files",
	"notes",
	"terminal",
	"settings",
	"machines",
	"agents",
	"operate",
]);

function readStored(): string | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		// Blocked storage: nothing remembered.
		return null;
	}
}

function writeStored(slug: string | null): void {
	try {
		const previous = localStorage.getItem(STORAGE_KEY);
		if (slug) localStorage.setItem(STORAGE_KEY, slug);
		else localStorage.removeItem(STORAGE_KEY);
		// The last project used belongs to the workspace being left.
		if (previous !== slug) localStorage.removeItem("grid.project");
	} catch {
		// Not remembered; the console opens the default workspace next time.
	}
}

function firstSegment(pathname: string): string {
	try {
		return decodeURIComponent(pathname.split("/")[1] ?? "");
	} catch {
		return "";
	}
}

/** Where the console starts: the workspace the URL names, if any, and whether it is outside one. */
export function resolveStart(pathname: string, stored: string | null) {
	const segment = firstSegment(pathname);
	if (OUTSIDE.has(segment)) return { inUrl: null, active: stored, outside: true };
	if (!segment || SECTIONS.has(segment)) return { inUrl: null, active: stored, outside: false };
	return { inUrl: segment, active: segment, outside: false };
}

// Outside a browser (node tests) there is no URL: no workspace yet.
const start = resolveStart(
	typeof window === "undefined" ? "/" : window.location.pathname,
	readStored(),
);
if (start.inUrl) writeStored(start.inUrl);

/** The workspace's slug, or null before it is known (then the API uses your default one). */
export function activeWorkspace(): string | null {
	return start.active;
}

/** The router's base: `/acme` when the URL names a workspace, else the root. */
export function routerBase(): string {
	return start.inUrl ? `/${encodeURIComponent(start.inUrl)}` : "";
}

/** A console path in the workspace, for links: `/board/web` → `/acme/board/web`. */
export function workspaceHref(path: string): string {
	return `${routerBase()}${path}`;
}

/**
 * The same page with its workspace in the URL, for a signed-in page opened without one (`/`, or an
 * old `/chat/web` link); null when the URL already has it or the page belongs to no workspace.
 */
export function urlWithWorkspace(slug: string | null = start.active): string | null {
	if (start.inUrl || start.outside || !slug) return null;
	const { pathname, search, hash } = window.location;
	return `/${encodeURIComponent(slug)}${pathname === "/" ? "" : pathname}${search}${hash}`;
}

/** Remember a workspace for the next start (null forgets it); callers then load its URL. */
export function rememberWorkspace(slug: string | null): void {
	writeStored(slug);
}

/** An API path in the active workspace: `/projects` → `/workspaces/acme/projects`. */
export function inWorkspace(path: string): string {
	return start.active ? `/workspaces/${encodeURIComponent(start.active)}${path}` : path;
}

/** The header the runner reads the workspace from; empty until it is known. */
export function workspaceHeaders(): Record<string, string> {
	return start.active ? { "X-Grid-Workspace": start.active } : {};
}

/** The `workspace` field of a runner socket's hello; empty until it is known. */
export function workspaceHello(): { workspace?: string } {
	return start.active ? { workspace: start.active } : {};
}
