import type { Context } from "hono";

import type { AppConfig } from "../config/config";

/** Who made the request, once `requireUser` has checked their access token. */
export type AccessTokenPayload = { sub: string; sid: string };

/** What every handler can read from the context. */
export type AppEnv = {
	Variables: {
		config: AppConfig;
		requestId: string;
		user: AccessTokenPayload;
	};
};

export type AppContext = Context<AppEnv>;
