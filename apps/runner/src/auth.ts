/** How long a verified token is trusted before the API is asked again. */
const CACHE_MS = 30_000;

/**
 * Who is asking, and the workspace they act in. Projects' folders, chats and environments belong
 * to the workspace (teammates share them); terminals, agent settings and notifications stay the
 * person's own.
 */
export type Who = { userId: string; workspace: string };

/** A token checked: who it is, or why not (401: not signed in, 404: not in that workspace). */
export type Verified = { who: Who } | { status: 401 | 404; message: string };

export type Verify = (token: string, workspace?: string | null) => Promise<Verified>;

type Workspace = { id: string; slug: string; isDefault: boolean };
type Known = { userId: string; workspaces: Workspace[]; until: number };

export const signedOut: Verified = { status: 401, message: "Sign in again" };

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
): Verify {
	const cache = new Map<string, Known>();

	async function known(token: string): Promise<Known | null> {
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
			return null;
		}
		if (!me.ok || !listed.ok) return null;

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
		if (!entry) return signedOut;
		const workspace = slug
			? entry.workspaces.find((w) => w.slug === slug)
			: entry.workspaces.find((w) => w.isDefault);
		if (!workspace) return { status: 404, message: `Workspace "${slug}" not found` };
		const who = { userId: entry.userId, workspace: workspace.id };
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
