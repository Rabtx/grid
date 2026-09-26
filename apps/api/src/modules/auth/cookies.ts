import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { type AppConfig, isProduction } from "../../config/config";
import type { AppContext } from "../../http/context";

/**
 * The refresh-token cookie: httpOnly, scoped to the auth routes, Secure in production (and
 * whenever SameSite=None requires it). Same name and attributes as NestJS set.
 */
function options(config: AppConfig) {
	const sameSite = config.cookieSameSite;
	return {
		httpOnly: true,
		secure: isProduction(config) || sameSite === "none",
		sameSite: (sameSite[0]?.toUpperCase() + sameSite.slice(1)) as "Lax" | "Strict" | "None",
		path: `/${config.apiPrefix}/v${config.apiVersion}/auth`,
		...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
	};
}

export function readRefreshCookie(c: AppContext): string | null {
	const value = getCookie(c, c.get("config").refreshCookieName);
	return value ? value : null;
}

export function setRefreshCookie(c: AppContext, token: string): void {
	const config = c.get("config");
	setCookie(c, config.refreshCookieName, token, {
		...options(config),
		maxAge: config.sessionTtlDays * 86_400,
		expires: new Date(Date.now() + config.sessionTtlDays * 86_400_000),
	});
}

export function clearRefreshCookie(c: AppContext): void {
	const config = c.get("config");
	deleteCookie(c, config.refreshCookieName, options(config));
}

/**
 * Clients that cannot keep httpOnly cookies get the refresh token in the body instead. No
 * first-party client sets this today; a non-browser client may.
 */
export function isNativeClient(c: AppContext): boolean {
	return c.req.header("x-client-platform")?.trim().toLowerCase() === "native";
}
