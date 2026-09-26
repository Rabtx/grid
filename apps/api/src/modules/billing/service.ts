import type { Database } from "@grid/db";

import type { AppConfig } from "../../config/config";
import { badRequest, notFound, serviceUnavailable } from "../../http/errors";
import type { CreateCheckoutInput, CreatePortalInput } from "./dto";
import {
	findActiveCustomerForUser,
	findLatestSubscriptionForUser,
	findUserById,
	type SubscriptionRecord,
	upsertSubscriptionFromWebhook,
} from "./repository";
import {
	createRazorpayCheckout,
	createRazorpayPortal,
	hasRazorpayKeys,
	parseRazorpayWebhook,
} from "./razorpay";
import {
	createStripeCheckout,
	createStripePortal,
	hasStripeKeys,
	parseStripeWebhook,
} from "./stripe";
import type { BillingInterval, CheckoutResult, PaymentProviderName, PlanCode } from "./types";

export function listConfiguredProviders(config: AppConfig): PaymentProviderName[] {
	const providers: PaymentProviderName[] = [];
	if (hasStripeKeys(config)) providers.push("stripe");
	if (hasRazorpayKeys(config)) providers.push("razorpay");
	return providers;
}

export function getSubscription(db: Database, userId: string): Promise<SubscriptionRecord | null> {
	return findLatestSubscriptionForUser(db, userId);
}

export async function createCheckout(
	db: Database,
	config: AppConfig,
	userId: string,
	input: CreateCheckoutInput,
): Promise<CheckoutResult> {
	const user = await findUserById(db, userId);
	if (!user?.isActive) {
		throw notFound({
			code: "USER_NOT_FOUND",
			message: "User not found",
		});
	}

	const providerName = input.provider ?? config.billingDefaultProvider;
	requireConfiguredProvider(config, providerName);

	const priceId = resolvePriceId(config, providerName, input.planCode, input.billingInterval);
	const successUrl =
		input.successUrl ?? `${config.webAppUrl}/billing/success?provider=${providerName}`;
	const cancelUrl =
		input.cancelUrl ?? `${config.webAppUrl}/billing/cancel?provider=${providerName}`;

	const checkoutInput = {
		userId,
		email: user.email,
		planCode: input.planCode,
		billingInterval: input.billingInterval,
		successUrl,
		cancelUrl,
		priceId,
	};

	if (providerName === "stripe") {
		return createStripeCheckout(config, checkoutInput);
	}
	return createRazorpayCheckout(config, checkoutInput);
}

export async function createPortal(
	db: Database,
	config: AppConfig,
	userId: string,
	input: CreatePortalInput,
): Promise<{ url: string }> {
	const providerName = input.provider ?? config.billingDefaultProvider;
	requireConfiguredProvider(config, providerName);

	const subscription = await findActiveCustomerForUser(db, userId, providerName);
	if (!subscription?.providerCustomerId) {
		throw badRequest({
			code: "BILLING_NO_CUSTOMER",
			message: "No billing customer found for this provider. Complete checkout first.",
		});
	}

	const portalInput = {
		providerCustomerId: subscription.providerCustomerId,
		returnUrl: input.returnUrl ?? `${config.webAppUrl}/billing`,
	};

	if (providerName === "stripe") {
		return createStripePortal(config, portalInput);
	}
	return createRazorpayPortal(config, portalInput);
}

export async function handleWebhook(
	db: Database,
	config: AppConfig,
	providerName: PaymentProviderName,
	rawBody: string,
	headers: Headers,
): Promise<{ received: boolean; handled: boolean }> {
	requireConfiguredProvider(config, providerName);

	const event =
		providerName === "stripe"
			? await parseStripeWebhook(config, rawBody, headers.get("stripe-signature") ?? undefined)
			: await parseRazorpayWebhook(
					config,
					rawBody,
					headers.get("x-razorpay-signature") ?? undefined,
				);

	if (!event) {
		return { received: true, handled: false };
	}

	if (!event.userId) {
		console.warn(`Ignoring ${event.provider} webhook without userId (${event.idempotencyKey})`);
		return { received: true, handled: true };
	}

	await upsertSubscriptionFromWebhook(db, {
		userId: event.userId,
		provider: event.provider,
		providerCustomerId: event.providerCustomerId,
		providerSubscriptionId: event.providerSubscriptionId,
		planCode: event.planCode ?? "team",
		billingInterval: event.billingInterval ?? "monthly",
		status: event.status,
		currentPeriodEnd: event.currentPeriodEnd,
		cancelAtPeriodEnd: event.cancelAtPeriodEnd,
	});

	return { received: true, handled: true };
}

function requireConfiguredProvider(config: AppConfig, name: PaymentProviderName): void {
	if (name !== "stripe" && name !== "razorpay") {
		throw badRequest({
			code: "BILLING_PROVIDER_UNKNOWN",
			message: `Unknown payment provider: ${name}`,
		});
	}
	const configured = name === "stripe" ? hasStripeKeys(config) : hasRazorpayKeys(config);
	if (!configured) {
		throw serviceUnavailable({
			code: "BILLING_PROVIDER_NOT_CONFIGURED",
			message: `${name} is not configured`,
		});
	}
}

function resolvePriceId(
	config: AppConfig,
	provider: PaymentProviderName,
	planCode: PlanCode,
	interval: BillingInterval,
): string {
	const prices = config.billingPrices[provider];
	const priceId = prices?.[planCode]?.[interval];
	if (!priceId) {
		throw serviceUnavailable({
			code: "BILLING_PRICE_NOT_CONFIGURED",
			message: `Missing price/plan id for ${provider} ${planCode} ${interval}`,
		});
	}
	return priceId;
}
