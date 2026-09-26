import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { SignJWT } from "jose";
import * as z from "zod";

import type { Database } from "@grid/db";

import { createApp } from "./app";
import { createConfig } from "./config/config";
import { parseEnv } from "./config/env";
import { requireUser, type SessionLookup } from "./http/auth";
import type { AppEnv } from "./http/context";
import { errorResponse } from "./http/errors";
import { rateLimit } from "./http/rate-limit";
import { requestId } from "./http/request-id";
import { ok } from "./http/respond";
import { body } from "./http/validate";

// These tests never reach a route that queries the database.
const noDb = {} as Database;
const SECRET = "test-secret-that-is-at-least-32-characters";
const config = (env: Record<string, string> = {}) =>
	createConfig(parseEnv({ NODE_ENV: "test", JWT_SECRET: SECRET, ...env }));

const sessions = (
	overrides: Partial<{ revokedAt: Date | null; active: boolean }> = {},
): SessionLookup => ({
	session: async (id) =>
		id === "s1"
			? {
					userId: "u1",
					revokedAt: overrides.revokedAt ?? null,
					expiresAt: new Date(Date.now() + 60_000),
				}
			: null,
	userIsActive: async (id) => id === "u1" && (overrides.active ?? true),
});

const token = (claims: { sub: string; sid: string }, secret = SECRET) =>
	new SignJWT({ sid: claims.sid })
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.setSubject(claims.sub)
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(new TextEncoder().encode(secret));

describe("envelope and errors", () => {
	const app = createApp({ config: config(), sessions: sessions(), db: noDb, send: async () => {} });

	it("wraps success in the envelope and echoes a caller's request id", async () => {
		const response = await app.request("/api/v1/health", {
			headers: { "x-request-id": "req_abc" },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBe("req_abc");
		const json = (await response.json()) as Record<string, unknown>;
		expect(json).toMatchObject({
			success: true,
			statusCode: 200,
			requestId: "req_abc",
			data: { status: "ok", service: "grid-api" },
		});
		expect(typeof json.timestamp).toBe("string");
	});

	it("mints a request id when none is sent", async () => {
		const response = await app.request("/api/v1/health");
		expect(response.headers.get("x-request-id")).toMatch(/^req_[0-9a-f-]{36}$/);
	});

	it("answers an unknown route like NestJS did, without a legacy API", async () => {
		const response = await app.request("/api/v1/nothing-here?x=1");
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			success: false,
			statusCode: 404,
			code: "NOT_FOUND",
			message: "Cannot GET /api/v1/nothing-here?x=1",
			path: "/api/v1/nothing-here?x=1",
			method: "GET",
		});
	});

	it("allows configured console origins with credentials and refuses others", async () => {
		const allowed = await app.request("/api/v1/health", {
			headers: { origin: "http://localhost:3001" },
		});
		expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3001");
		expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
		const other = await app.request("/api/v1/health", { headers: { origin: "https://evil.test" } });
		expect(other.headers.get("access-control-allow-origin")).toBeNull();
	});
});

/** A small app with the same error handling, for the building blocks on their own. */
function harness(build: (app: Hono<AppEnv>) => void) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("config", config());
		await next();
	});
	app.use("*", requestId);
	build(app);
	app.onError((error, c) => errorResponse(c, error));
	return app;
}

describe("requireUser", () => {
	const route = (lookup: SessionLookup) =>
		harness((app) => app.get("/me", requireUser(lookup), (c) => ok(c, c.get("user"))));

	const call = async (lookup: SessionLookup, authorization?: string) => {
		const response = await route(lookup).request("/me", {
			headers: authorization ? { authorization } : {},
		});
		return { status: response.status, json: (await response.json()) as Record<string, unknown> };
	};

	it("needs a bearer token", async () => {
		expect(await call(sessions())).toMatchObject({
			status: 401,
			json: { code: "AUTH_REQUIRED", message: "Authentication required" },
		});
	});

	it("rejects a token signed with another secret", async () => {
		const bad = await token({ sub: "u1", sid: "s1" }, "another-secret-another-secret-another");
		expect(await call(sessions(), `Bearer ${bad}`)).toMatchObject({
			status: 401,
			json: { code: "AUTH_ACCESS_TOKEN_INVALID" },
		});
	});

	it("lets a live session through with its claims", async () => {
		const good = await token({ sub: "u1", sid: "s1" });
		expect(await call(sessions(), `Bearer ${good}`)).toMatchObject({
			status: 200,
			json: { data: { sub: "u1", sid: "s1" } },
		});
	});

	it("refuses revoked sessions, other users' sessions and inactive users", async () => {
		const good = await token({ sub: "u1", sid: "s1" });
		for (const lookup of [sessions({ revokedAt: new Date() }), sessions({ active: false })]) {
			expect(await call(lookup, `Bearer ${good}`)).toMatchObject({
				status: 401,
				json: { code: "AUTH_SESSION_INVALID" },
			});
		}
		const stolen = await token({ sub: "u2", sid: "s1" });
		expect((await call(sessions(), `Bearer ${stolen}`)).json.code).toBe("AUTH_SESSION_INVALID");
	});
});

describe("validation and rate limits", () => {
	it("reports field errors as VALIDATION_ERROR", async () => {
		const app = harness((app) =>
			app.post("/things", async (c) =>
				ok(c, await body(c.req, z.object({ title: z.string().min(1) }).strict()), 201),
			),
		);
		const response = await app.request("/things", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: "" }),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "VALIDATION_ERROR",
			message: "Request validation failed",
			errors: [{ path: "title", code: "too_small" }],
		});
	});

	it("answers 429 past the limit, with Retry-After", async () => {
		const app = harness((app) =>
			app.get("/busy", rateLimit({ limit: 2, windowMs: 60_000 }), (c) => ok(c, true)),
		);
		const statuses = [];
		for (let i = 0; i < 3; i++) statuses.push((await app.request("/busy")).status);
		expect(statuses).toEqual([200, 200, 429]);
		const last = await app.request("/busy");
		expect(last.headers.get("retry-after")).not.toBeNull();
		expect(((await last.json()) as { code: string }).code).toBe("TOO_MANY_REQUESTS");
	});
});

describe("forwarding to NestJS", () => {
	let legacy: ReturnType<typeof Bun.serve>;

	beforeAll(() => {
		legacy = Bun.serve({
			port: 0,
			fetch: async (request) => {
				const url = new URL(request.url);
				const headers = new Headers({ "content-type": "application/json" });
				headers.append("set-cookie", "grid_refresh_token=abc; Path=/api/v1/auth; HttpOnly");
				return new Response(
					JSON.stringify({
						method: request.method,
						path: url.pathname + url.search,
						cookie: request.headers.get("cookie"),
						requestId: request.headers.get("x-request-id"),
						body: request.method === "GET" ? null : await request.text(),
					}),
					{ status: 201, headers },
				);
			},
		});
	});
	afterAll(() => legacy.stop(true));

	it("passes unported routes through unchanged, cookies both ways", async () => {
		const app = createApp({
			config: config({ GRID_LEGACY_API_URL: `http://127.0.0.1:${legacy.port}` }),
			sessions: sessions(),
			db: noDb,
			send: async () => {},
		});
		const response = await app.request("/api/v1/not-ported/thing?next=%2F", {
			method: "POST",
			headers: { cookie: "a=1", "content-type": "application/json", "x-request-id": "req_fwd" },
			body: JSON.stringify({ email: "x@y.z" }),
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("set-cookie")).toContain("grid_refresh_token=abc");
		expect(await response.json()).toEqual({
			method: "POST",
			path: "/api/v1/not-ported/thing?next=%2F",
			cookie: "a=1",
			requestId: "req_fwd",
			body: JSON.stringify({ email: "x@y.z" }),
		});
	});

	it("still serves ported routes itself", async () => {
		const app = createApp({
			config: config({ GRID_LEGACY_API_URL: `http://127.0.0.1:${legacy.port}` }),
			sessions: sessions(),
			db: noDb,
			send: async () => {},
		});
		const json = (await (await app.request("/api/v1/health")).json()) as { data: unknown };
		expect(json.data).toEqual({ status: "ok", service: "grid-api" });
	});

	it("forwards uploaded files too", async () => {
		const app = createApp({
			config: config({ GRID_LEGACY_API_URL: `http://127.0.0.1:${legacy.port}` }),
			sessions: sessions(),
			db: noDb,
			send: async () => {},
		});
		const json = (await (await app.request("/uploads/avatars/a.png")).json()) as { path: string };
		expect(json.path).toBe("/uploads/avatars/a.png");
	});
});
