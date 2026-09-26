import Stripe from "stripe";

import type { AppConfig } from "../../config/config";
import { badRequest, serviceUnavailable } from "../../http/errors";
import type {
	BillingInterval,
	CheckoutInput,
	CheckoutResult,
	NormalizedWebhookEvent,
	PlanCode,
	PortalInput,
	SubscriptionStatus,
} from "./types";

export function isStripeConfigured(config: AppConfig): boolean {
	return Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
}

export function hasStripeKeys(config: AppConfig): boolean {
	return Boolean(config.stripeSecretKey);
}

function getStripeClient(config: AppConfig): Stripe {
	if (!config.stripeSecretKey) {
		throw serviceUnavailable({
			code: "BILLING_STRIPE_NOT_CONFIGURED",
			message: "Stripe is not configured. Set STRIPE_SECRET_KEY.",
		});
	}
	return new Stripe(config.stripeSecretKey, {
		apiVersion: "2026-08-26.dahlia" as unknown as Stripe.LatestApiVersion,
	});
}

export async function createStripeCheckout(
	config: AppConfig,
	input: CheckoutInput,
): Promise<CheckoutResult> {
	const stripe = getStripeClient(config);
	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer_email: input.email,
		client_reference_id: input.userId,
		success_url: input.successUrl,
		cancel_url: input.cancelUrl,
		line_items: [{ price: input.priceId, quantity: 1 }],
		metadata: {
			userId: input.userId,
			workspaceId: input.workspaceId,
			planCode: input.planCode,
			billingInterval: input.billingInterval,
		},
		subscription_data: {
			metadata: {
				userId: input.userId,
				workspaceId: input.workspaceId,
				planCode: input.planCode,
				billingInterval: input.billingInterval,
			},
		},
	});

	if (!session.url) {
		throw serviceUnavailable({
			code: "BILLING_CHECKOUT_FAILED",
			message: "Stripe did not return a checkout URL",
		});
	}

	return {
		provider: "stripe",
		checkoutUrl: session.url,
		providerSessionId: session.id,
	};
}

export async function createStripePortal(
	config: AppConfig,
	input: PortalInput,
): Promise<{ url: string }> {
	const stripe = getStripeClient(config);
	const session = await stripe.billingPortal.sessions.create({
		customer: input.providerCustomerId,
		return_url: input.returnUrl,
	});
	return { url: session.url };
}

export async function parseStripeWebhook(
	config: AppConfig,
	rawBody: string | Uint8Array,
	signature: string | undefined,
): Promise<NormalizedWebhookEvent | null> {
	const stripe = getStripeClient(config);
	const secret = config.stripeWebhookSecret;
	if (!secret) {
		throw serviceUnavailable({
			code: "BILLING_STRIPE_NOT_CONFIGURED",
			message: "Stripe webhook secret is not configured",
		});
	}

	if (!signature) {
		throw badRequest({
			code: "BILLING_WEBHOOK_SIGNATURE_MISSING",
			message: "Missing Stripe-Signature header",
		});
	}

	let event: Stripe.Event;
	try {
		event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
	} catch {
		throw badRequest({
			code: "BILLING_WEBHOOK_INVALID",
			message: "Invalid Stripe webhook signature",
		});
	}

	return normalizeStripeEvent(event);
}

function normalizeStripeEvent(event: Stripe.Event): NormalizedWebhookEvent | null {
	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;
			if (session.mode !== "subscription") {
				return null;
			}
			return {
				provider: "stripe",
				idempotencyKey: event.id,
				userId: session.metadata?.userId ?? session.client_reference_id ?? undefined,
				workspaceId: session.metadata?.workspaceId,
				providerCustomerId: customerId(session.customer),
				providerSubscriptionId: subscriptionId(session.subscription),
				planCode: asPlanCode(session.metadata?.planCode),
				billingInterval: asInterval(session.metadata?.billingInterval),
				status: "active",
			};
		}
		case "customer.subscription.updated":
		case "customer.subscription.created": {
			const subscription = event.data.object as Stripe.Subscription;
			return {
				provider: "stripe",
				idempotencyKey: event.id,
				userId: subscription.metadata?.userId,
				workspaceId: subscription.metadata?.workspaceId,
				providerCustomerId: customerId(subscription.customer),
				providerSubscriptionId: subscription.id,
				planCode: asPlanCode(subscription.metadata?.planCode),
				billingInterval: asInterval(subscription.metadata?.billingInterval),
				status: mapStripeStatus(subscription.status),
				currentPeriodEnd: stripePeriodEnd(subscription),
				cancelAtPeriodEnd: subscription.cancel_at_period_end,
			};
		}
		case "customer.subscription.deleted": {
			const subscription = event.data.object as Stripe.Subscription;
			return {
				provider: "stripe",
				idempotencyKey: event.id,
				userId: subscription.metadata?.userId,
				workspaceId: subscription.metadata?.workspaceId,
				providerCustomerId: customerId(subscription.customer),
				providerSubscriptionId: subscription.id,
				planCode: asPlanCode(subscription.metadata?.planCode),
				billingInterval: asInterval(subscription.metadata?.billingInterval),
				status: "canceled",
				currentPeriodEnd: stripePeriodEnd(subscription),
				cancelAtPeriodEnd: false,
			};
		}
		default:
			return null;
	}
}

function customerId(
	value: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | undefined {
	if (!value) return undefined;
	return typeof value === "string" ? value : value.id;
}

function stripePeriodEnd(subscription: Stripe.Subscription): Date | undefined {
	const itemEnd = subscription.items?.data?.[0]?.current_period_end;
	if (typeof itemEnd === "number") {
		return new Date(itemEnd * 1000);
	}
	return undefined;
}

function subscriptionId(value: string | Stripe.Subscription | null): string | undefined {
	if (!value) return undefined;
	return typeof value === "string" ? value : value.id;
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
	switch (status) {
		case "trialing":
			return "trialing";
		case "active":
			return "active";
		case "past_due":
			return "past_due";
		case "canceled":
			return "canceled";
		case "unpaid":
			return "unpaid";
		default:
			return "incomplete";
	}
}

function asPlanCode(value: string | undefined): PlanCode | undefined {
	if (value === "team" || value === "enterprise") return value;
	return undefined;
}

function asInterval(value: string | undefined): BillingInterval | undefined {
	if (value === "monthly" || value === "yearly") return value;
	return undefined;
}
