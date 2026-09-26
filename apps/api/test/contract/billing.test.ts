import { beforeAll, describe, expect, it } from "bun:test";

import { call, demoToken, json, SIGN_IN_TIMEOUT, stable } from "./client";

describe("billing contract", () => {
	let token = "";

	beforeAll(async () => {
		token = await demoToken();
	}, SIGN_IN_TIMEOUT);

	describe("GET /api/v1/billing/providers", () => {
		it("lists configured payment providers without authentication", async () => {
			const reply = await call("/api/v1/billing/providers");
			expect(reply.status).toBe(200);
			const body = stable(reply.body) as {
				success: boolean;
				statusCode: number;
				data: { providers: string[] };
			};
			expect(body.success).toBe(true);
			expect(body.statusCode).toBe(200);
			expect(Array.isArray(body.data?.providers)).toBe(true);
		});
	});

	describe("GET /api/v1/billing/subscription", () => {
		it("rejects without authentication", async () => {
			const reply = await call("/api/v1/billing/subscription");
			expect(reply.status).toBe(401);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 401,
				code: "AUTH_REQUIRED",
				message: "Authentication required",
			});
		});

		it("rejects with an invalid token", async () => {
			const reply = await call("/api/v1/billing/subscription", {
				headers: { authorization: "Bearer invalid_token" },
			});
			expect(reply.status).toBe(401);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 401,
				code: "AUTH_ACCESS_TOKEN_INVALID",
			});
		});

		it("returns the current subscription for the signed-in user", async () => {
			const reply = await call("/api/v1/billing/subscription", {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(reply.status).toBe(200);
			const body = stable(reply.body) as {
				success: boolean;
				statusCode: number;
				data: { subscription: unknown };
			};
			expect(body.success).toBe(true);
			expect(body.statusCode).toBe(200);
			expect("subscription" in (body.data ?? {})).toBe(true);
		});
	});

	describe("POST /api/v1/billing/checkout", () => {
		it("rejects without authentication", async () => {
			const reply = await call("/api/v1/billing/checkout", json({ planCode: "team" }));
			expect(reply.status).toBe(401);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 401,
				code: "AUTH_REQUIRED",
			});
		});

		it("rejects an empty body with validation errors", async () => {
			const reply = await call(
				"/api/v1/billing/checkout",
				json({}, { headers: { authorization: `Bearer ${token}` } }),
			);
			expect(reply.status).toBe(400);
			const body = stable(reply.body) as {
				success: boolean;
				statusCode: number;
				code: string;
				errors: { path: string }[];
			};
			expect(body.success).toBe(false);
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.errors.some((e) => e.path === "planCode")).toBe(true);
		});

		it("rejects an invalid planCode", async () => {
			const reply = await call(
				"/api/v1/billing/checkout",
				json({ planCode: "super_tier" }, { headers: { authorization: `Bearer ${token}` } }),
			);
			expect(reply.status).toBe(400);
			const body = stable(reply.body) as { code: string; errors: { path: string }[] };
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.errors.some((e) => e.path === "planCode")).toBe(true);
		});

		it("rejects unrecognized body properties", async () => {
			const reply = await call(
				"/api/v1/billing/checkout",
				json(
					{ planCode: "team", unknownField: "nope" },
					{ headers: { authorization: `Bearer ${token}` } },
				),
			);
			expect(reply.status).toBe(400);
			const body = stable(reply.body) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("fails with 503 when stripe is not configured", async () => {
			const reply = await call(
				"/api/v1/billing/checkout",
				json(
					{ planCode: "team", provider: "stripe" },
					{ headers: { authorization: `Bearer ${token}` } },
				),
			);
			expect(reply.status).toBe(503);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 503,
				code: "BILLING_PROVIDER_NOT_CONFIGURED",
				message: "stripe is not configured",
			});
		});

		it("fails with 503 when razorpay is not configured", async () => {
			const reply = await call(
				"/api/v1/billing/checkout",
				json(
					{ planCode: "team", provider: "razorpay" },
					{ headers: { authorization: `Bearer ${token}` } },
				),
			);
			expect(reply.status).toBe(503);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 503,
				code: "BILLING_PROVIDER_NOT_CONFIGURED",
				message: "razorpay is not configured",
			});
		});
	});

	describe("POST /api/v1/billing/portal", () => {
		it("rejects without authentication", async () => {
			const reply = await call("/api/v1/billing/portal", json({}));
			expect(reply.status).toBe(401);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 401,
				code: "AUTH_REQUIRED",
			});
		});

		it("rejects unrecognized body properties", async () => {
			const reply = await call(
				"/api/v1/billing/portal",
				json({ extra: "property" }, { headers: { authorization: `Bearer ${token}` } }),
			);
			expect(reply.status).toBe(400);
			const body = stable(reply.body) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("rejects invalid provider option", async () => {
			const reply = await call(
				"/api/v1/billing/portal",
				json({ provider: "paypal" }, { headers: { authorization: `Bearer ${token}` } }),
			);
			expect(reply.status).toBe(400);
			const body = stable(reply.body) as { code: string; errors: { path: string }[] };
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.errors.some((e) => e.path === "provider")).toBe(true);
		});

		it("fails with 503 when provider is not configured", async () => {
			const reply = await call(
				"/api/v1/billing/portal",
				json({ provider: "stripe" }, { headers: { authorization: `Bearer ${token}` } }),
			);
			expect(reply.status).toBe(503);
			expect(stable(reply.body)).toMatchObject({
				success: false,
				statusCode: 503,
				code: "BILLING_PROVIDER_NOT_CONFIGURED",
				message: "stripe is not configured",
			});
		});
	});

	describe("POST /api/v1/billing/webhooks/:provider", () => {
		it("returns 200 with received: false, handled: false for unknown providers", async () => {
			const reply = await call("/api/v1/billing/webhooks/unknown", json({ some: "payload" }));
			expect(reply.status).toBe(200);
			expect(stable(reply.body)).toEqual({
				success: true,
				statusCode: 200,
				data: { received: false, handled: false },
			});
		});

		it("rejects stripe webhook when unconfigured or missing signature", async () => {
			const reply = await call(
				"/api/v1/billing/webhooks/stripe",
				json({ type: "checkout.session.completed" }),
			);
			// Without keys configured in env, 503 is expected. If keys were configured, 400 is expected.
			if (reply.status === 503) {
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 503,
					code: "BILLING_PROVIDER_NOT_CONFIGURED",
					message: "stripe is not configured",
				});
			} else {
				expect(reply.status).toBe(400);
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 400,
					code: "BILLING_WEBHOOK_SIGNATURE_MISSING",
				});
			}
		});

		it("rejects stripe webhook with invalid signature", async () => {
			const reply = await call(
				"/api/v1/billing/webhooks/stripe",
				json(
					{ type: "checkout.session.completed" },
					{ headers: { "stripe-signature": "t=123,v1=bad_sig" } },
				),
			);
			if (reply.status === 503) {
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 503,
					code: "BILLING_PROVIDER_NOT_CONFIGURED",
				});
			} else {
				expect(reply.status).toBe(400);
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 400,
					code: "BILLING_WEBHOOK_INVALID",
				});
			}
		});

		it("rejects razorpay webhook when unconfigured or missing signature", async () => {
			const reply = await call(
				"/api/v1/billing/webhooks/razorpay",
				json({ event: "subscription.charged" }),
			);
			if (reply.status === 503) {
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 503,
					code: "BILLING_PROVIDER_NOT_CONFIGURED",
					message: "razorpay is not configured",
				});
			} else {
				expect(reply.status).toBe(400);
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 400,
					code: "BILLING_WEBHOOK_SIGNATURE_MISSING",
				});
			}
		});

		it("rejects razorpay webhook with invalid signature", async () => {
			const reply = await call(
				"/api/v1/billing/webhooks/razorpay",
				json({ event: "subscription.charged" }, { headers: { "x-razorpay-signature": "bad_sig" } }),
			);
			if (reply.status === 503) {
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 503,
					code: "BILLING_PROVIDER_NOT_CONFIGURED",
				});
			} else {
				expect(reply.status).toBe(400);
				expect(stable(reply.body)).toMatchObject({
					success: false,
					statusCode: 400,
					code: "BILLING_WEBHOOK_INVALID",
				});
			}
		});
	});
});
