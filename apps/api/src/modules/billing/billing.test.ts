import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createDatabase, type Database, schema } from "@grid/db";
import { eq } from "drizzle-orm";

import { createApp } from "../../app";
import { createConfig } from "../../config/config";
import { parseEnv } from "../../config/env";
import { sessionLookup } from "../../sessions";
import { upsertSubscriptionFromWebhook } from "./repository";

/** Needs a migrated database; fixtures are owned by this suite and require no seed data. */
const suite = process.env.DATABASE_URL ? describe : describe.skip;

suite("billing webhook handling and signatures", () => {
	const STRIPE_TEST_SECRET = "whsec_test_stripe_webhook_secret_key_12345";
	const STRIPE_TEST_KEY = "sk_test_mock_stripe_key_for_unit_tests";
	const RAZORPAY_TEST_SECRET = "test_razorpay_webhook_secret_key_12345";
	const RAZORPAY_TEST_KEY_ID = "rzp_test_mock_key_id";
	const RAZORPAY_TEST_KEY_SECRET = "rzp_test_mock_key_secret";

	let dbInstance: { db: Database; close: () => Promise<void> };
	let db: Database;
	const testUserId = crypto.randomUUID();
	const testWorkspaceId = crypto.randomUUID();
	let app: ReturnType<typeof createApp>;

	beforeAll(async () => {
		const databaseUrl = process.env.DATABASE_URL ?? "";

		dbInstance = createDatabase(databaseUrl, { max: 2 });
		db = dbInstance.db;

		await db.transaction(async (tx) => {
			await tx.insert(schema.users).values({
				id: testUserId,
				email: `billing-${testUserId}@example.test`,
				username: `billing-${testUserId}`,
			});
			await tx.insert(schema.workspaces).values({
				id: testWorkspaceId,
				slug: `billing-${testWorkspaceId}`,
				name: "Billing test workspace",
			});
			await tx.insert(schema.workspaceMembers).values({
				workspaceId: testWorkspaceId,
				userId: testUserId,
				role: "owner",
			});
		});

		const testConfig = createConfig(
			parseEnv({
				...process.env,
				NODE_ENV: "test",
				STRIPE_SECRET_KEY: STRIPE_TEST_KEY,
				STRIPE_WEBHOOK_SECRET: STRIPE_TEST_SECRET,
				RAZORPAY_KEY_ID: RAZORPAY_TEST_KEY_ID,
				RAZORPAY_KEY_SECRET: RAZORPAY_TEST_KEY_SECRET,
				RAZORPAY_WEBHOOK_SECRET: RAZORPAY_TEST_SECRET,
			}),
		);

		app = createApp({
			config: testConfig,
			sessions: sessionLookup(db),
			db,
			send: async () => {},
		});
	});

	afterAll(async () => {
		if (!dbInstance) return;
		try {
			// Cascades remove only this suite's memberships and subscriptions, even after a failure.
			await db.delete(schema.workspaces).where(eq(schema.workspaces.id, testWorkspaceId));
			await db.delete(schema.users).where(eq(schema.users.id, testUserId));
		} finally {
			await dbInstance.close();
		}
	});

	describe("subscription upsert from a webhook", () => {
		it("converges on one row when the same event is delivered twice at once", async () => {
			// Payment providers deliver webhooks at least once and concurrently. Resolving the
			// existing row and then inserting had both deliveries miss the lookup, so the loser
			// died on subscriptions_provider_sub_unique and the provider retried forever.
			const subId = `sub_test_race_${testUserId}`;
			const periodEnd = new Date(Date.now() + 30 * 86_400_000);
			const event = {
				userId: testUserId,
				workspaceId: testWorkspaceId,
				provider: "stripe" as const,
				providerSubscriptionId: subId,
				planCode: "team" as const,
				billingInterval: "monthly" as const,
				status: "active" as const,
				currentPeriodEnd: periodEnd,
			};

			const [first, second] = await Promise.all([
				upsertSubscriptionFromWebhook(db, event),
				upsertSubscriptionFromWebhook(db, event),
			]);
			expect(second.id).toBe(first.id);

			const rows = await db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.providerSubscriptionId, subId));
			expect(rows).toHaveLength(1);
			expect(rows[0]?.status).toBe("active");
		});

		it("keeps what a later event leaves out", async () => {
			// `subscription.charged` carries no customer id, and the stored one still applies.
			const subId = `sub_test_partial_${testUserId}`;
			const providerCustomerId = `cus_test_${Date.now()}`;
			const base = {
				userId: testUserId,
				workspaceId: testWorkspaceId,
				provider: "stripe" as const,
				providerSubscriptionId: subId,
				planCode: "team" as const,
				billingInterval: "monthly" as const,
			};

			await upsertSubscriptionFromWebhook(db, {
				...base,
				providerCustomerId,
				status: "active",
				cancelAtPeriodEnd: true,
			});
			const updated = await upsertSubscriptionFromWebhook(db, {
				...base,
				status: "canceled",
			});

			expect(updated.providerCustomerId).toBe(providerCustomerId);
			expect(updated.cancelAtPeriodEnd).toBe(true);
			expect(updated.status).toBe("canceled");
		});
	});

	describe("Stripe webhooks", () => {
		it("refuses request with missing Stripe-Signature header", async () => {
			const res = await app.request("/api/v1/billing/webhooks/stripe", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "customer.subscription.updated" }),
			});
			expect(res.status).toBe(400);
			const json = (await res.json()) as { code: string; message: string };
			expect(json.code).toBe("BILLING_WEBHOOK_SIGNATURE_MISSING");
			expect(json.message).toBe("Missing Stripe-Signature header");
		});

		it("refuses request with invalid Stripe signature", async () => {
			const res = await app.request("/api/v1/billing/webhooks/stripe", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"stripe-signature": "t=1700000000,v1=invalid_hex_signature_here",
				},
				body: JSON.stringify({ type: "customer.subscription.updated" }),
			});
			expect(res.status).toBe(400);
			const json = (await res.json()) as { code: string; message: string };
			expect(json.code).toBe("BILLING_WEBHOOK_INVALID");
			expect(json.message).toBe("Invalid Stripe webhook signature");
		});

		it("accepts valid signed payload and updates subscription in database", async () => {
			const subId = `sub_test_stripe_${testUserId}`;

			const event = {
				id: `evt_test_${Date.now()}`,
				object: "event",
				type: "customer.subscription.updated",
				data: {
					object: {
						id: subId,
						customer: `cus_test_${Date.now()}`,
						status: "active",
						metadata: {
							userId: testUserId,
							planCode: "team",
							billingInterval: "monthly",
						},
						items: {
							data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }],
						},
						cancel_at_period_end: false,
					},
				},
			};

			const rawBody = JSON.stringify(event);
			const timestamp = Math.floor(Date.now() / 1000);
			const signaturePayload = `${timestamp}.${rawBody}`;
			const signature = crypto
				.createHmac("sha256", STRIPE_TEST_SECRET)
				.update(signaturePayload)
				.digest("hex");
			const stripeHeader = `t=${timestamp},v1=${signature}`;

			const res = await app.request("/api/v1/billing/webhooks/stripe", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"stripe-signature": stripeHeader,
				},
				body: rawBody,
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as {
				success: boolean;
				data: { received: boolean; handled: boolean };
			};
			expect(json.success).toBe(true);
			expect(json.data).toEqual({ received: true, handled: true });

			const [saved] = await db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.providerSubscriptionId, subId));

			expect(saved).toBeDefined();
			expect(saved.userId).toBe(testUserId);
			expect(saved.provider).toBe("stripe");
			expect(saved.status).toBe("active");
			expect(saved.planCode).toBe("team");
			expect(saved.billingInterval).toBe("monthly");
		});

		it("handles subscription cancellation event and marks status as canceled", async () => {
			const subId = `sub_test_stripe_cancel_${testUserId}`;

			const event = {
				id: `evt_test_del_${Date.now()}`,
				object: "event",
				type: "customer.subscription.deleted",
				data: {
					object: {
						id: subId,
						customer: `cus_test_${Date.now()}`,
						status: "canceled",
						metadata: {
							userId: testUserId,
							planCode: "team",
							billingInterval: "monthly",
						},
						items: {
							data: [{ current_period_end: Math.floor(Date.now() / 1000) }],
						},
					},
				},
			};

			const rawBody = JSON.stringify(event);
			const timestamp = Math.floor(Date.now() / 1000);
			const signaturePayload = `${timestamp}.${rawBody}`;
			const signature = crypto
				.createHmac("sha256", STRIPE_TEST_SECRET)
				.update(signaturePayload)
				.digest("hex");
			const stripeHeader = `t=${timestamp},v1=${signature}`;

			const res = await app.request("/api/v1/billing/webhooks/stripe", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"stripe-signature": stripeHeader,
				},
				body: rawBody,
			});

			expect(res.status).toBe(200);
			const [saved] = await db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.providerSubscriptionId, subId));

			expect(saved).toBeDefined();
			expect(saved.status).toBe("canceled");
		});
	});

	describe("Razorpay webhooks", () => {
		it("refuses request with missing X-Razorpay-Signature header", async () => {
			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ event: "subscription.charged" }),
			});
			expect(res.status).toBe(400);
			const json = (await res.json()) as { code: string; message: string };
			expect(json.code).toBe("BILLING_WEBHOOK_SIGNATURE_MISSING");
			expect(json.message).toBe("Missing X-Razorpay-Signature header");
		});

		it("refuses request with invalid Razorpay signature", async () => {
			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-razorpay-signature": "invalid_razorpay_hmac_hex",
				},
				body: JSON.stringify({ event: "subscription.charged" }),
			});
			expect(res.status).toBe(400);
			const json = (await res.json()) as { code: string; message: string };
			expect(json.code).toBe("BILLING_WEBHOOK_INVALID");
			expect(json.message).toBe("Invalid Razorpay webhook signature");
		});

		it("accepts valid signed payload and updates subscription in database", async () => {
			const subId = `sub_test_rzp_${testUserId}`;

			const payload = {
				event: "subscription.charged",
				payload: {
					subscription: {
						entity: {
							id: subId,
							customer_id: `cust_rzp_${Date.now()}`,
							status: "active",
							current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
							notes: {
								userId: testUserId,
								planCode: "enterprise",
								billingInterval: "yearly",
							},
						},
					},
				},
			};

			const rawBody = JSON.stringify(payload);
			const signature = crypto
				.createHmac("sha256", RAZORPAY_TEST_SECRET)
				.update(rawBody)
				.digest("hex");

			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-razorpay-signature": signature,
				},
				body: rawBody,
			});

			expect(res.status).toBe(200);
			const json = (await res.json()) as {
				success: boolean;
				data: { received: boolean; handled: boolean };
			};
			expect(json.success).toBe(true);
			expect(json.data).toEqual({ received: true, handled: true });

			const [saved] = await db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.providerSubscriptionId, subId));

			expect(saved).toBeDefined();
			expect(saved.userId).toBe(testUserId);
			expect(saved.provider).toBe("razorpay");
			expect(saved.status).toBe("active");
			expect(saved.planCode).toBe("enterprise");
			expect(saved.billingInterval).toBe("yearly");
		});

		it("handles cancellation event and marks subscription as canceled", async () => {
			const subId = `sub_test_rzp_cancel_${testUserId}`;

			const payload = {
				event: "subscription.cancelled",
				payload: {
					subscription: {
						entity: {
							id: subId,
							customer_id: `cust_rzp_${Date.now()}`,
							status: "cancelled",
							notes: {
								userId: testUserId,
								planCode: "team",
								billingInterval: "monthly",
							},
						},
					},
				},
			};

			const rawBody = JSON.stringify(payload);
			const signature = crypto
				.createHmac("sha256", RAZORPAY_TEST_SECRET)
				.update(rawBody)
				.digest("hex");

			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-razorpay-signature": signature,
				},
				body: rawBody,
			});

			expect(res.status).toBe(200);
			const [saved] = await db
				.select()
				.from(schema.subscriptions)
				.where(eq(schema.subscriptions.providerSubscriptionId, subId));

			expect(saved).toBeDefined();
			expect(saved.status).toBe("canceled");
		});

		it("returns received: true, handled: false for unhandled event types", async () => {
			const payload = {
				event: "payment.authorized",
				payload: { payment: { entity: { id: "pay_123" } } },
			};
			const rawBody = JSON.stringify(payload);
			const signature = crypto
				.createHmac("sha256", RAZORPAY_TEST_SECRET)
				.update(rawBody)
				.digest("hex");

			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-razorpay-signature": signature,
				},
				body: rawBody,
			});
			expect(res.status).toBe(200);
			const json = (await res.json()) as { data: unknown };
			expect(json.data).toEqual({ received: true, handled: false });
		});

		it("returns received: true, handled: true without updating when userId is missing", async () => {
			const payload = {
				event: "subscription.charged",
				payload: {
					subscription: {
						entity: {
							id: `sub_no_user_${Date.now()}`,
							customer_id: "cust_no_user",
							status: "active",
							notes: {},
						},
					},
				},
			};
			const rawBody = JSON.stringify(payload);
			const signature = crypto
				.createHmac("sha256", RAZORPAY_TEST_SECRET)
				.update(rawBody)
				.digest("hex");

			const res = await app.request("/api/v1/billing/webhooks/razorpay", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-razorpay-signature": signature,
				},
				body: rawBody,
			});
			expect(res.status).toBe(200);
			const json = (await res.json()) as { data: unknown };
			expect(json.data).toEqual({ received: true, handled: true });
		});
	});

	describe("Provider listing and portal edge cases", () => {
		it("lists configured providers", async () => {
			const res = await app.request("/api/v1/billing/providers");
			expect(res.status).toBe(200);
			const json = (await res.json()) as { data: { providers: string[] } };
			expect(json.data.providers).toContain("stripe");
			expect(json.data.providers).toContain("razorpay");
		});

		it("rejects unknown provider in webhook", async () => {
			const res = await app.request("/api/v1/billing/webhooks/paypal", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ event: "test" }),
			});
			expect(res.status).toBe(200);
			const json = (await res.json()) as { data: unknown };
			expect(json.data).toEqual({ received: false, handled: false });
		});
	});
});
