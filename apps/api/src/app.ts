import type { Database } from "@grid/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { type AppConfig, basePath, isAllowedOrigin } from "./config/config";
import type { SessionLookup } from "./http/auth";
import type { AppContext, AppEnv } from "./http/context";
import { ApiError, errorResponse } from "./http/errors";
import { rateLimit } from "./http/rate-limit";
import { requestId } from "./http/request-id";

import { authCrypto } from "./modules/auth/crypto";
import { authRoutes } from "./modules/auth/routes";
import { billingRoutes } from "./modules/billing/routes";
import type { EmailSender } from "./modules/email/email";
import { healthRoutes } from "./modules/health/routes";
import { instanceRoutes } from "./modules/instance/routes";
import { projectRoutes } from "./modules/projects/routes";
import { runnerRoutes } from "./modules/runner/routes";
import { profileRoutes, uploadedFile } from "./modules/profiles/routes";
import { inviteRoutes, workspaceRoutes } from "./modules/workspaces/routes";

/** A route that does not exist, in the words clients already know (query string included). */
function notFoundRoute(c: AppContext): ApiError {
	const url = new URL(c.req.url);
	return new ApiError(404, `Cannot ${c.req.method} ${url.pathname}${url.search}`);
}

export type AppDeps = {
	config: AppConfig;
	db: Database;
	sessions: SessionLookup;
	/** Sends the codes and sign-in links. */
	send: EmailSender;
};

/** The Grid API: `/api/v1/...`, plus the uploaded files it serves at `/uploads/...`. */
export function createApp(deps: AppDeps): Hono<AppEnv> {
	const { config } = deps;
	const app = new Hono<AppEnv>();

	app.use("*", async (c, next) => {
		c.set("config", config);
		await next();
	});
	app.use("*", requestId);
	app.use("*", secureHeaders({ crossOriginResourcePolicy: "cross-origin" }));
	app.use(
		"*",
		cors({
			origin: (origin) => (isAllowedOrigin(config, origin) ? origin : null),
			credentials: true,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"X-Requested-With",
				"X-Request-Id",
				"X-Client-Platform",
			],
		}),
	);

	const base = basePath(config);
	app.use(`${base}/*`, rateLimit({ limit: 100, windowMs: 60_000 }));

	// Ported modules. Each one's routes answer here; everything else falls through below.
	const api = new Hono<AppEnv>();
	api.route("/health", healthRoutes());
	const auth = {
		db: deps.db,
		config,
		crypto: authCrypto(config),
		send: deps.send,
		sessions: deps.sessions,
	};
	api.route("/auth", authRoutes(auth));
	api.route("/instance", instanceRoutes(auth));
	const workspaces = {
		db: deps.db,
		sessions: deps.sessions,
		send: deps.send,
		uploadsDir: config.uploadsDir,
		databaseUrl: config.databaseUrl,
		backupsDir: config.backupsDir,
	};
	api.route("/workspaces", workspaceRoutes(workspaces));
	api.route("/invites", inviteRoutes(workspaces));
	// The user's default workspace, for clients that do not pick one yet.
	api.route(
		"/projects",
		projectRoutes({ db: deps.db, sessions: deps.sessions, uploadsDir: config.uploadsDir }),
	);
	api.route(
		"/users/me",
		profileRoutes({ db: deps.db, sessions: deps.sessions, uploadsDir: config.uploadsDir }),
	);
	api.route("/billing", billingRoutes({ db: deps.db, sessions: deps.sessions }));
	// This Grid's runners, with the machine key: their threads, kept beyond the machine.
	api.route("/runner", runnerRoutes({ db: deps.db }));
	app.route(base, api);

	app.get("/uploads/*", (c) => uploadedFile(c, config.uploadsDir));

	app.notFound((c) => errorResponse(c, notFoundRoute(c)));
	app.onError((error, c) => errorResponse(c, error));
	return app;
}
