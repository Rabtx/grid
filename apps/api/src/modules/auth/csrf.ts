import { createMiddleware } from "hono/factory";

import { isAllowedOrigin } from "../../config/config";
import type { AppEnv } from "../../http/context";
import { forbidden } from "../../http/errors";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes that carry the refresh cookie must come from a known console origin through its own
 * scripts (`X-Requested-With: XMLHttpRequest`, which a plain cross-site form cannot send).
 * Requests with no Origin (native apps, curl) are not browser cross-site requests and pass.
 */
export const csrf = createMiddleware<AppEnv>(async (c, next) => {
	const origin = c.req.header("origin");
	if (
		SAFE.has(c.req.method) ||
		!origin ||
		(isAllowedOrigin(c.get("config"), origin) &&
			c.req.header("x-requested-with") === "XMLHttpRequest")
	) {
		await next();
		return;
	}
	throw forbidden({ code: "AUTH_CSRF_REJECTED", message: "Request origin could not be verified" });
});
