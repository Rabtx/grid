import type { Context } from "hono";

import type { AppConfig } from "../config/config";

/** Who made the request, once `requireUser` has checked their access token. */
export type AccessTokenPayload = { sub: string; sid: string };

/**
 * What a runner route was authenticated as: the Grid's own runner key, which may act anywhere,
 * or one enrolled machine, which may only act in its own workspace.
 */
export type RunnerScope = { kind: "grid" } | { kind: "machine"; id: string; workspaceId: string };

/** What every handler can read from the context. */
export type AppEnv = {
	Variables: {
		config: AppConfig;
		requestId: string;
		user: AccessTokenPayload;
		runner: RunnerScope;
	};
};

export type AppContext = Context<AppEnv>;
