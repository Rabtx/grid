/** How long a verified token is trusted before the API is asked again. */
const CACHE_MS = 30_000;

type Verified = { userId: string; until: number };

/**
 * Checks a console access token by asking the API who it belongs to. The runner holds no signing
 * secret of its own, and a signed-out or revoked session stops working here too.
 */
export function createTokenVerifier(
	apiUrl: string,
	fetcher: typeof fetch = fetch,
): (token: string) => Promise<string | null> {
	const cache = new Map<string, Verified>();

	return async (token) => {
		const now = Date.now();
		const hit = cache.get(token);
		if (hit && hit.until > now) return hit.userId;
		cache.delete(token);

		let response: Response;
		try {
			response = await fetcher(`${apiUrl}/api/v1/auth/me`, {
				headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
			});
		} catch (cause) {
			console.error("[runner] could not reach the API to verify a token", cause);
			return null;
		}
		if (!response.ok) return null;

		const body = (await response.json().catch(() => null)) as { data?: { id?: unknown } } | null;
		const userId = typeof body?.data?.id === "string" ? body.data.id : null;
		if (!userId) return null;

		// Drop expired entries on the way, so the cache never outgrows the live tokens.
		for (const [key, entry] of cache) if (entry.until <= now) cache.delete(key);
		cache.set(token, { userId, until: now + CACHE_MS });
		return userId;
	};
}
