import * as z from "zod";

export const createCheckoutSchema = z
	.object({
		provider: z.enum(["stripe", "razorpay"]).optional(),
		planCode: z.enum(["team", "enterprise"]),
		billingInterval: z.enum(["monthly", "yearly"]).default("monthly"),
		successUrl: z.url().optional(),
		cancelUrl: z.url().optional(),
	})
	.strict();

export const createPortalSchema = z
	.object({
		provider: z.enum(["stripe", "razorpay"]).optional(),
		returnUrl: z.url().optional(),
	})
	.strict();

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CreatePortalInput = z.infer<typeof createPortalSchema>;
