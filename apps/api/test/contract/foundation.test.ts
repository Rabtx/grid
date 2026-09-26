import { describe, expect, it } from "bun:test";

import { call, json, stable } from "./client";

describe("the envelope every client unwraps", () => {
	it("GET /api/v1/health", async () => {
		const reply = await call("/api/v1/health", { headers: { "x-request-id": "req_contract" } });
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-request-id")).toBe("req_contract");
		expect(reply.body).toMatchObject({ requestId: "req_contract" });
		expect(stable(reply.body)).toEqual({
			success: true,
			statusCode: 200,
			data: { status: "ok", service: "grid-api" },
		});
	});

	it("an unknown route is a 404 in the error shape", async () => {
		const reply = await call("/api/v1/no-such-route?x=1");
		expect(reply.status).toBe(404);
		expect(stable(reply.body)).toEqual({
			success: false,
			statusCode: 404,
			code: "NOT_FOUND",
			message: "Cannot GET /api/v1/no-such-route?x=1",
			path: "/api/v1/no-such-route?x=1",
			method: "GET",
		});
	});

	it("a signed-in route without a token is AUTH_REQUIRED", async () => {
		const reply = await call("/api/v1/projects");
		expect(reply.status).toBe(401);
		expect(stable(reply.body)).toMatchObject({
			success: false,
			statusCode: 401,
			code: "AUTH_REQUIRED",
			message: "Authentication required",
			path: "/api/v1/projects",
			method: "GET",
		});
	});

	it("a bad token is AUTH_ACCESS_TOKEN_INVALID", async () => {
		const reply = await call("/api/v1/projects", { headers: { authorization: "Bearer nope" } });
		expect(reply.status).toBe(401);
		expect(stable(reply.body)).toMatchObject({ code: "AUTH_ACCESS_TOKEN_INVALID" });
	});

	it("an invalid body is VALIDATION_ERROR with field errors", async () => {
		const reply = await call("/api/v1/auth/login", json({}));
		expect(reply.status).toBe(400);
		const body = stable(reply.body) as { code: string; errors: { path: string }[] };
		expect(body.code).toBe("VALIDATION_ERROR");
		expect(body.errors.length).toBeGreaterThan(0);
	});
});
