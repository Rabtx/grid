/** How long a verified token is trusted before the API is asked again. */
const CACHE_MS = 30_000;

/**
 * Who is asking, and the workspace they act in. Projects' folders, chats and environments belong
 * to the workspace (teammates share them); terminals, agent settings and notifications stay the
 * person's own.
 */
export type Who = {
	userId: string;
	workspace: string;
	/** Their role in the workspace, when the API said (always, for a signed-in person). */
	role?: WorkspaceRole;
	/** A role the workspace made (Settings → Roles), in place of the built-in role's permissions. */
	customRole?: string;
	/** What applies to everyone in the workspace (Settings → General). */
	settings?: WorkspaceSettings;
};

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/** What a role may do (see `permissions`). */
export type RolePermission =
	| "startAgents"
	| "approveCommands"
	| "mergePulls"
	| "production"
	| "machines"
	| "integrations"
	| "invite";

/** What a workspace sets for everyone, as the API keeps it; a missing field is its default. */
export type WorkspaceSettings = {
	defaultBranch?: string;
	defaultAgent?: string;
	weekStartsOn?: string;
	/** Run logs older than this many days are cleared; 0 or missing keeps them. */
	logRetentionDays?: number;
	/** Per agent id: who may start it. */
	agentAccess?: Record<string, "everyone" | "admins">;
	/** What agents may do on their own (see `agents/policy`). */
	agentPolicy?: {
		rules?: Partial<
			Record<
				"read" | "edit" | "commands" | "packages" | "network" | "push",
				"allow" | "ask" | "never"
			>
		>;
		newBranch?: boolean;
		showCommands?: boolean;
	};
	/** Per built-in role, what it may do over its defaults (Settings → Roles). */
	rolePermissions?: Partial<
		Record<"admin" | "member" | "viewer", Partial<Record<RolePermission, boolean>>>
	>;
	/** Roles the workspace made, each with its own permissions. */
	customRoles?: { id: string; permissions: Partial<Record<RolePermission, boolean>> }[];
};

/**
 * A token checked: who it is, or why not (401: not signed in, 404: not in that workspace, 503: the
 * API could not say).
 */
export type Verified = { who: Who } | { status: 401 | 404 | 503; message: string };

export type Verify = (token: string, workspace?: string | null) => Promise<Verified>;

type Workspace = {
	id: string;
	slug: string;
	isDefault: boolean;
	role?: WorkspaceRole;
	customRole?: string | null;
	settings?: WorkspaceSettings;
};
type Known = { userId: string; workspaces: Workspace[]; until: number };

export const signedOut: Verified = { status: 401, message: "Sign in again" };

/**
 * The API could not be asked, or failed answering. Not a sign-out: answering 401 here told the
 * console the session had ended whenever the API restarted or was briefly unreachable.
 */
export const apiUnavailable: Verified = {
	status: 503,
	message: "Grid's API can't be reached right now. Try again in a moment.",
};

/**
 * Checks a console access token by asking the API who it belongs to and which workspaces they
 * are in. The runner holds no signing secret of its own, and a signed-out or revoked session
 * stops working here too. A request names its workspace by slug; without one it acts in the
 * person's default workspace, and `onDefault` hears about it (to adopt what was kept per person
 * before workspaces).
 */
export function createTokenVerifier(
	apiUrl: string,
	fetcher: typeof fetch = fetch,
	onDefault: (who: Who) => void = () => {},
	onSettings: (workspace: string, settings: WorkspaceSettings) => void = () => {},
): Verify {
	const cache = new Map<string, Known>();

	async function known(token: string): Promise<Known | null | "unavailable"> {
		const now = Date.now();
		const hit = cache.get(token);
		if (hit && hit.until > now) return hit;
		cache.delete(token);

		const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
		let me: Response;
		let listed: Response;
		try {
			[me, listed] = await Promise.all([
				fetcher(`${apiUrl}/api/v1/auth/me`, { headers }),
				fetcher(`${apiUrl}/api/v1/workspaces`, { headers }),
			]);
		} catch (cause) {
			console.error("[runner] could not reach the API to verify a token", cause);
			return "unavailable";
		}
		// Only a refusal means the token is no good; anything else is the API failing to answer.
		const refused = (response: Response) => response.status === 401 || response.status === 403;
		if (refused(me) || refused(listed)) return null;
		if (!me.ok || !listed.ok) return "unavailable";

		const user = (await me.json().catch(() => null)) as { data?: { id?: unknown } } | null;
		const userId = typeof user?.data?.id === "string" ? user.data.id : null;
		const rows = (await listed.json().catch(() => null)) as { data?: unknown } | null;
		const workspaces = Array.isArray(rows?.data) ? rows.data.filter(isWorkspace) : [];
		if (!userId || workspaces.length === 0) return null;

		// Drop expired entries on the way, so the cache never outgrows the live tokens.
		for (const [key, entry] of cache) if (entry.until <= now) cache.delete(key);
		const entry = { userId, workspaces, until: now + CACHE_MS };
		cache.set(token, entry);
		return entry;
	}

	return async (token, slug) => {
		const entry = await known(token);
		if (entry === "unavailable") return apiUnavailable;
		if (!entry) return signedOut;
		const workspace = slug
			? entry.workspaces.find((w) => w.slug === slug)
			: entry.workspaces.find((w) => w.isDefault);
		if (!workspace) return { status: 404, message: `Workspace "${slug}" not found` };
		const who: Who = {
			userId: entry.userId,
			workspace: workspace.id,
			...(workspace.role ? { role: workspace.role } : {}),
			...(workspace.customRole ? { customRole: workspace.customRole } : {}),
			...(workspace.settings ? { settings: workspace.settings } : {}),
		};
		onSettings(workspace.id, workspace.settings ?? {});
		if (workspace.isDefault) onDefault(who);
		return { who };
	};
}

function isWorkspace(value: unknown): value is Workspace {
	const w = value as Workspace | null;
	return (
		typeof w?.id === "string" && typeof w.slug === "string" && typeof w.isDefault === "boolean"
	);
}
