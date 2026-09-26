import Razorpay from "razorpay";

import type { AppConfig } from "../../config/config";
import { ApiError, badRequest, serviceUnavailable } from "../../http/errors";
import type {
	BillingInterval,
	CheckoutInput,
	CheckoutResult,
	NormalizedWebhookEvent,
	PlanCode,
	PortalInput,
	SubscriptionStatus,
} from "./types";

type RazorpaySubscription = {
	id: string;
	status: string;
	short_url?: string;
	customer_id?: string;
	current_end?: number;
	notes?: Record<string, string>;
};

export function isRazorpayConfigured(config: AppConfig): boolean {
	return Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
}

export function hasRazorpayKeys(config: AppConfig): boolean {
	return Boolean(config.razorpayKeyId && config.razorpayKeySecret);
}

function getRazorpayClient(config: AppConfig): Razorpay {
	if (!config.razorpayKeyId || !config.razorpayKeySecret) {
		throw serviceUnavailable({
			code: "BILLING_RAZORPAY_NOT_CONFIGURED",
			message: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
		});
	}
	return new Razorpay({
		key_id: config.razorpayKeyId,
		key_secret: config.razorpayKeySecret,
	});
}

export async function createRazorpayCheckout(
	config: AppConfig,
	input: CheckoutInput,
): Promise<CheckoutResult> {
	const razorpay = getRazorpayClient(config);
	const subscription = (await razorpay.subscriptions.create({
		plan_id: input.priceId,
		total_count: input.billingInterval === "yearly" ? 10 : 120,
		customer_notify: 1,
		notes: {
			userId: input.userId,
			email: input.email,
			planCode: input.planCode,
			billingInterval: input.billingInterval,
		},
	})) as RazorpaySubscription;

	if (!subscription.short_url) {
		throw serviceUnavailable({
			code: "BILLING_CHECKOUT_FAILED",
			message: "Razorpay did not return a checkout URL",
		});
	}

	return {
		provider: "razorpay",
		checkoutUrl: subscription.short_url,
		providerSessionId: subscription.id,
	};
}

export function createRazorpayPortal(
	_config: AppConfig,
	_input: PortalInput,
): Promise<{ url: string }> {
	throw new ApiError(
		501,
		"Razorpay Customer Portal is not available. Cancel or change plans via support for now.",
		"BILLING_PORTAL_UNSUPPORTED",
	);
}

export async function verifyRazorpaySignature(
	rawBody: string,
	signature: string,
	secret: string,
): Promise<boolean> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
	const expected = Array.from(new Uint8Array(signatureBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	if (expected.length !== signature.length) return false;
	let mismatch = 0;
	for (let i = 0; i < expected.length; i++) {
		mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return mismatch === 0;
}

export async function parseRazorpayWebhook(
	config: AppConfig,
	rawBody: string,
	signature: string | undefined,
): Promise<NormalizedWebhookEvent | null> {
	const secret = config.razorpayWebhookSecret;
	if (!secret) {
		throw serviceUnavailable({
			code: "BILLING_RAZORPAY_NOT_CONFIGURED",
			message: "Razorpay webhook secret is not configured",
		});
	}

	if (!signature) {
		throw badRequest({
			code: "BILLING_WEBHOOK_SIGNATURE_MISSING",
			message: "Missing X-Razorpay-Signature header",
		});
	}

	const valid = await verifyRazorpaySignature(rawBody, signature, secret);
	if (!valid) {
		throw badRequest({
			code: "BILLING_WEBHOOK_INVALID",
			message: "Invalid Razorpay webhook signature",
		});
	}

	let payload: {
		event?: string;
		payload?: {
			subscription?: { entity?: RazorpaySubscription };
		};
	};
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return null;
	}

	const subscription = payload.payload?.subscription?.entity;
	if (!subscription || !payload.event) {
		return null;
	}

	const status = mapRazorpayStatus(subscription.status, payload.event);
	if (!status) {
		return null;
	}

	return {
		provider: "razorpay",
		idempotencyKey: `${payload.event}:${subscription.id}:${subscription.status}`,
		userId: subscription.notes?.userId,
		providerCustomerId: subscription.customer_id,
		providerSubscriptionId: subscription.id,
		planCode: asPlanCode(subscription.notes?.planCode),
		billingInterval: asInterval(subscription.notes?.billingInterval),
		status,
		currentPeriodEnd: subscription.current_end
			? new Date(subscription.current_end * 1000)
			: undefined,
		cancelAtPeriodEnd: payload.event === "subscription.pending",
	};
}

function mapRazorpayStatus(status: string, event: string): SubscriptionStatus | null {
	if (event === "subscription.cancelled" || status === "cancelled") {
		return "canceled";
	}
	if (event === "subscription.halted" || status === "halted") {
		return "past_due";
	}
	if (
		status === "active" ||
		event === "subscription.activated" ||
		event === "subscription.charged"
	) {
		return "active";
	}
	if (status === "authenticated" || status === "created") {
		return "incomplete";
	}
	return null;
}

function asPlanCode(value: string | undefined): PlanCode | undefined {
	if (value === "team" || value === "enterprise") return value;
	return undefined;
}

function asInterval(value: string | undefined): BillingInterval | undefined {
	if (value === "monthly" || value === "yearly") return value;
	return undefined;
}
